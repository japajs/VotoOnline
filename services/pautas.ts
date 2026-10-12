import { createServerClient } from "@/lib/supabase/server"
import type { Pauta, PautaOpcao, PautaStatus } from "@/types"

type PautaRow = {
  id: string
  assembleia_id: string
  ordem: number
  titulo: string
  descricao: string | null
  ativa: boolean
  tipo: "sim_nao" | "multipla_escolha"
  permite_abstencao: boolean
  status: PautaStatus
  quorum_aprovacao: number
  sigiloso: boolean
  votacao_aberta?: boolean
  votacao_aberta_em?: string | null
  votacao_fechada_em?: string | null
  created_at: string
  pauta_opcoes?: PautaOpcaoRow[] | null
}

type PautaOpcaoRow = {
  id: string
  pauta_id: string
  ordem: number
  label: string
  created_at: string
}

function rowToPautaOpcao(row: PautaOpcaoRow): PautaOpcao {
  return {
    id: row.id,
    pauta_id: row.pauta_id,
    ordem: row.ordem,
    label: row.label,
    created_at: row.created_at,
  }
}

function rowToPauta(row: PautaRow): Pauta {
  return {
    id: row.id,
    assembleia_id: row.assembleia_id,
    ordem: row.ordem,
    titulo: row.titulo,
    descricao: row.descricao,
    ativa: row.ativa,
    tipo: row.tipo,
    permite_abstencao: row.permite_abstencao,
    status: row.status,
    quorum_aprovacao: row.quorum_aprovacao,
    sigiloso: row.sigiloso,
    votacao_aberta: row.votacao_aberta ?? false,
    votacao_aberta_em: row.votacao_aberta_em ?? null,
    votacao_fechada_em: row.votacao_fechada_em ?? null,
    created_at: row.created_at,
    opcoes: row.pauta_opcoes
      ? row.pauta_opcoes.map(rowToPautaOpcao).sort((a, b) => a.ordem - b.ordem)
      : undefined,
  }
}

export async function getPautasByAssembleiaId(assembleiaId: string): Promise<Pauta[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("pautas")
    .select("*, pauta_opcoes(*)")
    .eq("assembleia_id", assembleiaId)
    .order("ordem", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => rowToPauta(r as unknown as PautaRow))
}

export async function createPautasBatch(
  pautas: (Pick<Pauta, "assembleia_id" | "ordem" | "titulo" | "descricao"> & {
    tipo?: Pauta["tipo"]
    permite_abstencao?: boolean
    quorum_aprovacao?: number
    sigiloso?: boolean
    opcoes?: string[]
  })[]
): Promise<Pauta[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("pautas")
    .insert(
      pautas.map((p) => ({
        assembleia_id: p.assembleia_id,
        ordem: p.ordem,
        titulo: p.titulo,
        descricao: p.descricao,
        tipo: p.tipo ?? "sim_nao",
        permite_abstencao: p.permite_abstencao ?? true,
        quorum_aprovacao: p.quorum_aprovacao ?? 0.5,
        sigiloso: p.sigiloso ?? false,
      }))
    )
    .select()

  if (error) throw new Error(error.message)
  const criadas = (data ?? []) as unknown as PautaRow[]

  // Auditoria funcional: antes casava pela coluna `ordem`, mas `ordem` só é
  // garantidamente única DENTRO desta mesma chamada — se no futuro pautas
  // forem adicionadas uma a uma a uma assembleia já existente (via
  // getNextOrdem), duas chamadas concorrentes poderiam gerar o mesmo
  // `ordem` e trocar as opções entre pautas. Uma única instrução INSERT com
  // múltiplas linhas preserva a ordem de entrada no retorno — mais seguro
  // casar pela posição no array do que por um valor que pode colidir.
  const opcoesParaInserir = criadas.flatMap((pauta, idx) => {
    const labels = pautas[idx]?.opcoes ?? []
    return labels.map((label, i) => ({ pauta_id: pauta.id, ordem: i + 1, label }))
  })

  if (opcoesParaInserir.length > 0) {
    const { error: opcoesError } = await db.from("pauta_opcoes").insert(opcoesParaInserir)
    if (opcoesError) throw new Error(opcoesError.message)
  }

  return getPautasByAssembleiaId(pautas[0]!.assembleia_id)
}

// Versão por pauta de hasVotosRegistrados (services/assembleias.ts) — usada
// para travar edição/exclusão de UMA pauta específica assim que ela recebe
// o 1º voto, mesmo que a assembleia continue aberta e outras pautas ainda
// não tenham voto nenhum.
export async function hasVotoPauta(pautaId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_respostas")
    .select("id")
    .eq("pauta_id", pautaId)
    .limit(1)

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

// Chamada logo após o 1º voto de uma pauta ser gravado (services/
// assembleia-votos.ts). Só sobe rascunho/aberta → em_votacao; nunca reverte
// e nunca mexe em "encerrada" (que só acontece junto com a assembleia — ver
// updateAssembleiaStatus).
export async function marcarPautaEmVotacaoSeNecessario(pautaId: string): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from("pautas")
    .update({ status: "em_votacao" })
    .eq("id", pautaId)
    .in("status", ["rascunho", "aberta"])

  if (error) throw new Error(error.message)
}

export async function deletePauta(id: string): Promise<void> {
  const db = createServerClient()
  const { error } = await db.from("pautas").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Votação pauta por pauta (controlada pela mesa) — só faz sentido quando a
// assembleia está com votacao_por_pauta = true. Abrir libera o voto DESTA
// pauta; fechar bloqueia (reabrível). As datas ficam pro registro/ata. Abrir
// limpa a data de fechamento e vice-versa, pra o par aberto/fechado refletir
// sempre o último movimento.
export async function abrirVotacaoPauta(pautaId: string): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from("pautas")
    .update({
      votacao_aberta: true,
      votacao_aberta_em: new Date().toISOString(),
      votacao_fechada_em: null,
    })
    .eq("id", pautaId)
  if (error) throw new Error(error.message)
}

export async function fecharVotacaoPauta(pautaId: string): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from("pautas")
    .update({ votacao_aberta: false, votacao_fechada_em: new Date().toISOString() })
    .eq("id", pautaId)
  if (error) throw new Error(error.message)
}

export interface PautaEdicaoIndividualInput {
  titulo: string
  descricao: string | null
  tipo: Pauta["tipo"]
  permite_abstencao: boolean
  quorum_aprovacao: number
  sigiloso: boolean
  opcoes?: string[] // só relevante quando tipo === "multipla_escolha"
}

// Edição de UMA pauta específica, independente do que acontece com as
// demais pautas da mesma assembleia (item 2 do pedido de evolução: uma
// pauta ainda em rascunho/aberta e sem voto continua editável mesmo que
// outra pauta da mesma assembleia já esteja em votação). Reaproveita
// hasVotoPauta — a mesma trava usada para subir o status a "em_votacao".
export async function updatePautaIndividual(
  pautaId: string,
  dados: PautaEdicaoIndividualInput
): Promise<void> {
  const db = createServerClient()

  if (await hasVotoPauta(pautaId)) {
    throw new Error("Esta pauta já possui voto registrado e não pode mais ser alterada.")
  }

  const { error } = await db
    .from("pautas")
    .update({
      titulo: dados.titulo,
      descricao: dados.descricao,
      tipo: dados.tipo,
      permite_abstencao: dados.permite_abstencao,
      quorum_aprovacao: dados.quorum_aprovacao,
      sigiloso: dados.sigiloso,
    })
    .eq("id", pautaId)
  if (error) throw new Error(error.message)

  // Substitui as opções por completo — seguro porque, sem voto ainda,
  // nenhuma assembleia_respostas.opcao_id referencia as opções antigas
  // desta pauta.
  const { error: delOpcoesError } = await db.from("pauta_opcoes").delete().eq("pauta_id", pautaId)
  if (delOpcoesError) throw new Error(delOpcoesError.message)

  if (dados.tipo === "multipla_escolha" && (dados.opcoes?.length ?? 0) > 0) {
    const { error: insOpcoesError } = await db
      .from("pauta_opcoes")
      .insert(dados.opcoes!.map((label, i) => ({ pauta_id: pautaId, ordem: i + 1, label })))
    if (insOpcoesError) throw new Error(insOpcoesError.message)
  }
}

// Exclusão de UMA pauta específica sem voto — mesma trava de
// updatePautaIndividual, mais uma checagem para nunca deixar a assembleia
// sem nenhuma pauta (mesma exigência mínima já usada na criação).
export async function deletePautaIndividual(pautaId: string): Promise<void> {
  const db = createServerClient()

  if (await hasVotoPauta(pautaId)) {
    throw new Error("Esta pauta já possui voto registrado e não pode ser excluída.")
  }

  const { data: pauta, error: fetchError } = await db
    .from("pautas")
    .select("assembleia_id")
    .eq("id", pautaId)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  const { count, error: countError } = await db
    .from("pautas")
    .select("*", { count: "exact", head: true })
    .eq("assembleia_id", (pauta as { assembleia_id: string }).assembleia_id)
  if (countError) throw new Error(countError.message)
  if ((count ?? 0) <= 1) {
    throw new Error("A assembleia precisa ter pelo menos 1 pauta — não é possível excluir a última.")
  }

  await deletePauta(pautaId)
}

export async function getNextOrdem(assembleiaId: string): Promise<number> {
  const db = createServerClient()
  const { data, error } = await db
    .from("pautas")
    .select("ordem")
    .eq("assembleia_id", assembleiaId)
    .order("ordem", { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  const max = (data?.[0] as { ordem: number } | undefined)?.ordem ?? 0
  return max + 1
}
