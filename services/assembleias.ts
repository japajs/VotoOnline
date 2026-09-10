import { createServerClient } from "@/lib/supabase/server"
import { createPautasBatch, hasVotoPauta } from "@/services/pautas"
import type { Assembleia, AssembleiaStatus, Pauta, PautaOpcao, PautaStatus } from "@/types"

type JoinedPautaOpcao = {
  id: string
  pauta_id: string
  ordem: number
  label: string
  created_at: string
}

type JoinedPauta = {
  id: string
  assembleia_id: string
  ordem: number
  titulo: string
  descricao: string | null
  ativa: boolean
  tipo: Pauta["tipo"]
  permite_abstencao: boolean
  status: PautaStatus
  quorum_aprovacao: number
  sigiloso: boolean
  created_at: string
  pauta_opcoes: JoinedPautaOpcao[] | null
}

type JoinedAssembleia = {
  id: string
  condominio_id: string
  titulo: string
  descricao: string | null
  status: AssembleiaStatus
  data_abertura: string | null
  data_encerramento: string | null
  quorum_minimo: number | null
  data_1a_convocacao: string | null
  quorum_minimo_2a: number | null
  created_at: string
  updated_at: string
  pautas: JoinedPauta[] | null
}

function rowToPautaOpcao(row: JoinedPautaOpcao): PautaOpcao {
  return {
    id: row.id,
    pauta_id: row.pauta_id,
    ordem: row.ordem,
    label: row.label,
    created_at: row.created_at,
  }
}

function rowToPauta(row: JoinedPauta): Pauta {
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
    created_at: row.created_at,
    opcoes: row.pauta_opcoes
      ? [...row.pauta_opcoes].sort((a, b) => a.ordem - b.ordem).map(rowToPautaOpcao)
      : undefined,
  }
}

function rowToAssembleia(row: JoinedAssembleia): Assembleia {
  return {
    id: row.id,
    condominio_id: row.condominio_id,
    titulo: row.titulo,
    descricao: row.descricao,
    status: row.status ?? "rascunho",
    data_abertura: row.data_abertura ?? null,
    data_encerramento: row.data_encerramento ?? null,
    quorum_minimo: row.quorum_minimo ?? null,
    data_1a_convocacao: row.data_1a_convocacao ?? null,
    quorum_minimo_2a: row.quorum_minimo_2a ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    pautas: (row.pautas ?? []).map(rowToPauta).sort((a, b) => a.ordem - b.ordem),
  }
}

const SELECT_WITH_PAUTAS = "*, pautas(*, pauta_opcoes(*))"

export async function getAllAssembleias(condominioId: string): Promise<Assembleia[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleias")
    .select(SELECT_WITH_PAUTAS)
    .eq("condominio_id", condominioId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as JoinedAssembleia[]).map(rowToAssembleia)
}

export async function getAssembleiaById(id: string): Promise<Assembleia | null> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleias")
    .select(SELECT_WITH_PAUTAS)
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(error.message)
  }
  return rowToAssembleia(data as unknown as JoinedAssembleia)
}

export async function createAssembleia(
  input: Pick<
    Assembleia,
    | "condominio_id"
    | "titulo"
    | "descricao"
    | "data_abertura"
    | "data_encerramento"
    | "quorum_minimo"
    | "data_1a_convocacao"
    | "quorum_minimo_2a"
  >
): Promise<Assembleia> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleias")
    .insert({
      condominio_id: input.condominio_id,
      titulo: input.titulo,
      descricao: input.descricao,
      data_abertura: input.data_abertura,
      data_encerramento: input.data_encerramento,
      quorum_minimo: input.quorum_minimo,
      data_1a_convocacao: input.data_1a_convocacao,
      quorum_minimo_2a: input.quorum_minimo_2a,
    })
    .select(SELECT_WITH_PAUTAS)
    .single()

  if (error) throw new Error(error.message)
  return rowToAssembleia(data as unknown as JoinedAssembleia)
}

// Auditoria funcional: mesma proteção de deleteCondominio, aqui na exclusão
// direta de uma assembleia — sem isso, dava pra contornar aquela trava
// excluindo a assembleia em vez do condomínio inteiro.
export async function deleteAssembleia(id: string): Promise<void> {
  const db = createServerClient()

  const { data: sendsVotados, error: votosError } = await db
    .from("assembleia_sends")
    .select("id")
    .eq("assembleia_id", id)
    .not("votado_em", "is", null)
    .limit(1)

  if (votosError) throw new Error(votosError.message)
  if ((sendsVotados ?? []).length > 0) {
    throw new Error(
      "Esta assembleia possui votos registrados e não pode ser excluída, para preservar o histórico de votação."
    )
  }

  const { error } = await db.from("assembleias").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Edição de assembleia: mesmo sinal de "tem voto" já usado por
// deleteAssembleia (assembleia_sends.votado_em preenchido) — reaproveitado
// aqui para decidir se as pautas ainda podem ser alteradas.
export async function hasVotosRegistrados(assembleiaId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select("id")
    .eq("assembleia_id", assembleiaId)
    .not("votado_em", "is", null)
    .limit(1)

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export interface PautaEdicaoInput {
  titulo: string
  descricao: string | null
  tipo: Pauta["tipo"]
  permite_abstencao: boolean
  quorum_aprovacao: number
  sigiloso: boolean
  opcoes?: string[]
}

// Edita título/descrição/datas (sempre, enquanto não encerrada) e,
// opcionalmente, substitui as pautas por completo (delete + recria, que é
// seguro porque só é permitido chamar com `pautas` não-nulo quando ainda não
// existe nenhum voto — sem isso, apagar uma pauta que já tem resposta
// gravada quebraria a integridade do histórico de votação).
//
// Reforça a mesma regra que a tela já aplica (perfil, pautas bloqueadas com
// voto, assembleia encerrada) aqui no service — nunca confia só no que o
// client mandou.
export async function updateAssembleiaCompleta(
  id: string,
  dadosBasicos: {
    titulo: string
    descricao: string | null
    data_abertura: string | null
    data_encerramento: string | null
    quorum_minimo: number | null
    data_1a_convocacao: string | null
    quorum_minimo_2a: number | null
  },
  pautas: PautaEdicaoInput[] | null
): Promise<void> {
  const db = createServerClient()

  const { data: atual, error: fetchError } = await db
    .from("assembleias")
    .select("status")
    .eq("id", id)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  if ((atual as { status: AssembleiaStatus }).status === "encerrada") {
    throw new Error("Esta assembleia está encerrada e não pode mais ser alterada.")
  }

  if (pautas !== null) {
    const temVotos = await hasVotosRegistrados(id)
    if (temVotos) {
      throw new Error(
        "Esta assembleia já possui votos registrados. Para preservar a integridade da votação, as pautas não podem mais ser alteradas."
      )
    }
  }

  const { error: updateError } = await db
    .from("assembleias")
    .update({
      titulo: dadosBasicos.titulo,
      descricao: dadosBasicos.descricao,
      data_abertura: dadosBasicos.data_abertura,
      data_encerramento: dadosBasicos.data_encerramento,
      quorum_minimo: dadosBasicos.quorum_minimo,
      data_1a_convocacao: dadosBasicos.data_1a_convocacao,
      quorum_minimo_2a: dadosBasicos.quorum_minimo_2a,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (updateError) throw new Error(updateError.message)

  if (pautas !== null) {
    const { error: deleteError } = await db.from("pautas").delete().eq("assembleia_id", id)
    if (deleteError) throw new Error(deleteError.message)

    if (pautas.length > 0) {
      await createPautasBatch(
        pautas.map((p, i) => ({
          assembleia_id: id,
          ordem: i + 1,
          titulo: p.titulo,
          descricao: p.descricao,
          tipo: p.tipo,
          permite_abstencao: p.permite_abstencao,
          quorum_aprovacao: p.quorum_aprovacao,
          sigiloso: p.sigiloso,
          opcoes: p.tipo === "multipla_escolha" ? p.opcoes : undefined,
        }))
      )
    }
  }
}

// Auditoria funcional: transferir uma unidade enquanto há assembleia aberta
// no condomínio pode fazer o peso da unidade ser contado duas vezes (uma no
// voto do dono antigo, outra no voto do novo dono) na mesma apuração — ambos
// calculam o peso "ao vivo" a partir das unidades atuais no momento do voto.
// "Pausada" conta como aberta aqui de propósito: é uma assembleia em
// andamento só temporariamente sem receber voto novo, não um estado seguro
// pra mexer em unidade/critério de peso — só "rascunho" (nenhum voto ainda)
// e "encerrada" (apuração já congelada) são seguros.
export async function hasAssembleiaAberta(condominioId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleias")
    .select("id")
    .eq("condominio_id", condominioId)
    .in("status", ["aberta", "pausada"])
    .limit(1)

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export async function updateAssembleiaStatus(
  id: string,
  status: AssembleiaStatus
): Promise<void> {
  const db = createServerClient()

  // Auditoria de segurança: por ESTA função, uma assembleia encerrada é
  // definitiva — nunca volta pra rascunho/aberta. A única exceção
  // deliberada é reabrirAssembleia (abaixo), uma função separada e
  // explícita pra correção excepcional — nunca um parâmetro escondido
  // aqui.
  const { data: atual, error: fetchError } = await db
    .from("assembleias")
    .select("status")
    .eq("id", id)
    .single()
  if (fetchError) throw new Error(fetchError.message)
  if ((atual as { status: AssembleiaStatus }).status === "encerrada") {
    throw new Error("Assembleia encerrada não pode ser reaberta.")
  }

  const now = new Date().toISOString()
  const updates: {
    status: AssembleiaStatus
    updated_at: string
    data_abertura?: string
    data_encerramento?: string
  } = { status, updated_at: now }

  if (status === "aberta") updates.data_abertura = now
  if (status === "encerrada") updates.data_encerramento = now

  const { error } = await db.from("assembleias").update(updates).eq("id", id)
  if (error) throw new Error(error.message)

  // Uma pauta nunca encerra sozinha (decisão do produto) — todas fecham
  // junto quando a assembleia inteira é encerrada, independente do status
  // individual de cada uma (aberta ou em_votacao).
  if (status === "encerrada") {
    const { error: pautasError } = await db
      .from("pautas")
      .update({ status: "encerrada" })
      .eq("assembleia_id", id)
    if (pautasError) throw new Error(pautasError.message)
  }
}

// Reabertura excepcional de uma assembleia encerrada — ex.: um voto
// indevido (proprietário inadimplente) precisa ser removido e a apuração
// refeita. Ao contrário de updateAssembleiaStatus, esta função existe
// justamente para bypassar a trava "encerrada é definitiva" — por isso é
// uma função separada e explícita, nunca um parâmetro escondido na outra.
//
// data_encerramento é limpo (null): ele guarda o instante em que a
// assembleia foi fechada, e se ficasse no passado o fechamento automático
// por prazo (ver app/v/[token]/page.tsx) reencerraria a assembleia sozinho
// assim que qualquer participante abrisse o link de voto de novo. O
// síndico define um novo prazo (se quiser) editando a assembleia antes de
// encerrar de novo.
//
// Pautas voltam para "aberta" (sem voto ainda) ou "em_votacao" (já tem ao
// menos 1 voto) — a mesma distinção de sempre (ver hasVotoPauta /
// marcarPautaEmVotacaoSeNecessario em services/pautas.ts), só que
// reconstruída aqui porque updateAssembleiaStatus apaga essa distinção ao
// forçar todas as pautas pra "encerrada" junto com a assembleia. Sem isso,
// uma pauta que já tinha voto reabriria como "aberta" e a tela de apuração
// deixaria o síndico tentar editá-la — updatePautaIndividual bloquearia
// (hasVotoPauta), mas só depois de um clique frustrado.
export async function reabrirAssembleia(id: string): Promise<void> {
  const db = createServerClient()

  const { data: atual, error: fetchError } = await db
    .from("assembleias")
    .select("status")
    .eq("id", id)
    .single()
  if (fetchError) throw new Error(fetchError.message)
  if ((atual as { status: AssembleiaStatus }).status !== "encerrada") {
    throw new Error("Só é possível reabrir uma assembleia encerrada.")
  }

  const { error } = await db
    .from("assembleias")
    .update({
      status: "aberta",
      data_encerramento: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(error.message)

  const { data: pautas, error: pautasError } = await db
    .from("pautas")
    .select("id")
    .eq("assembleia_id", id)
  if (pautasError) throw new Error(pautasError.message)

  await Promise.all(
    (pautas ?? []).map(async (p) => {
      const pautaId = (p as { id: string }).id
      const status: PautaStatus = (await hasVotoPauta(pautaId)) ? "em_votacao" : "aberta"
      const { error: updateError } = await db.from("pautas").update({ status }).eq("id", pautaId)
      if (updateError) throw new Error(updateError.message)
    })
  )
}

// Quantos participantes desta assembleia já registraram pelo menos 1 voto —
// usado para decidir se, ao adicionar uma pauta nova, existe alguém que
// precisa ser avisado por e-mail (ver app/actions/assembleias.ts e
// app/actions/assembleia-votos.ts).
export async function contarParticipantesJaVotaram(assembleiaId: string): Promise<number> {
  const db = createServerClient()
  const { count, error } = await db
    .from("assembleia_sends")
    .select("id", { count: "exact", head: true })
    .eq("assembleia_id", assembleiaId)
    .not("votado_em", "is", null)

  if (error) throw new Error(error.message)
  return count ?? 0
}
