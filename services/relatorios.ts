import { createServerClient } from "@/lib/supabase/server"
import { getAllProprietarios } from "@/services/proprietarios"

export interface ParticipanteRelatorio {
  nome: string
  email: string | null
  telefone: string | null
  respondeu: boolean
  send_status: string
  sent_at: string | null
}

export interface UnidadeRelatorio {
  numero: string
  bloco: string | null
  proprietario: string
  email: string | null
}

export interface HistoricoParticipante {
  proprietarioNome: string
  totalPautas: number
  pautasRespondidas: number
  ultimaResposta: string | null
}

// Item 6 do pedido de evolução do fluxo: controle interno de participação
// por proprietário (não entra no PDF/XLSX oficiais, só na tela de detalhe
// da assembleia) — quantas pautas cada um já respondeu e a data do voto.
// A data vem de assembleia_sends.votado_em (NÃO do created_at da resposta):
// é a MESMA fonte do detalhamento e da ata, e é a que respeita o ajuste de
// data do voto manual (lançamento retroativo). Antes usava created_at, que é
// o instante real da gravação no banco e nunca reflete a data ajustada —
// causava a divergência entre esta tela e o detalhamento (bug do Carlos).
export async function getHistoricoParticipacao(
  assembleiaId: string,
  totalPautas: number
): Promise<HistoricoParticipante[]> {
  const db = createServerClient()

  const { data: sends, error } = await db
    .from("assembleia_sends")
    .select("id, nome_snapshot, votado_em, proprietarios(nome)")
    .eq("assembleia_id", assembleiaId)
  if (error) throw new Error(error.message)

  const sendIds = (sends ?? []).map((s) => s.id as string)
  if (sendIds.length === 0) return []

  // Só o número de pautas respondidas por send (a data é o votado_em acima).
  const { data: respostas, error: respError } = await db
    .from("assembleia_respostas")
    .select("send_id")
    .in("send_id", sendIds)
  if (respError) throw new Error(respError.message)

  const countPorSend = new Map<string, number>()
  for (const r of (respostas ?? []) as { send_id: string }[]) {
    countPorSend.set(r.send_id, (countPorSend.get(r.send_id) ?? 0) + 1)
  }

  type SendRow = {
    id: string
    nome_snapshot: string | null
    votado_em: string | null
    proprietarios: { nome: string } | null
  }

  return ((sends ?? []) as unknown as SendRow[])
    .map((s) => ({
      proprietarioNome: s.nome_snapshot ?? s.proprietarios?.nome ?? "—",
      totalPautas,
      pautasRespondidas: countPorSend.get(s.id) ?? 0,
      ultimaResposta: s.votado_em ?? null,
    }))
    .sort((a, b) => a.proprietarioNome.localeCompare(b.proprietarioNome, "pt-BR"))
}

export async function getParticipantesByAssembleia(
  assembleiaId: string
): Promise<ParticipanteRelatorio[]> {
  const db = createServerClient()

  type SendRow = {
    id: string
    status: string
    sent_at: string | null
    nome_snapshot: string | null
    email_snapshot: string | null
    telefone_snapshot: string | null
    proprietarios: { nome: string; email: string | null; telefone: string | null } | null
  }

  const { data: sends } = await db
    .from("assembleia_sends")
    .select(
      "id, status, sent_at, nome_snapshot, email_snapshot, telefone_snapshot, proprietarios(nome, email, telefone)"
    )
    .eq("assembleia_id", assembleiaId)

  if (!sends || sends.length === 0) return []

  const sendIds = (sends as unknown as SendRow[]).map((s) => s.id)

  const { data: respostas } = await db
    .from("assembleia_respostas")
    .select("send_id")
    .in("send_id", sendIds)

  const respondedIds = new Set<string>((respostas ?? []).map((r) => r.send_id as string))

  // Etapa 3 — integridade histórica: quem já votou tem os dados congelados
  // no momento do voto (snapshot); o cadastro atual só é usado para quem
  // ainda não votou, já que não existe nenhum snapshot para congelar.
  return (sends as unknown as SendRow[]).map((s) => {
    const respondeu = respondedIds.has(s.id)
    return {
      nome: (respondeu ? s.nome_snapshot : null) ?? s.proprietarios?.nome ?? "—",
      email: (respondeu ? s.email_snapshot : null) ?? s.proprietarios?.email ?? null,
      telefone: (respondeu ? s.telefone_snapshot : null) ?? s.proprietarios?.telefone ?? null,
      respondeu,
      send_status: s.status,
      sent_at: s.sent_at,
    }
  })
}

export interface VotoDetalhado {
  pauta_id: string
  unidades: string
  nome: string
  email: string | null
  resposta: string
  votado_em: string | null
  // Nome de quem participou pelo imóvel quando não é o dono do cadastro (co-dono
  // presente, ex.: esposa). null = participou o próprio dono. Sai no boletim.
  participante: string | null
}

// Detalhamento de voto por pauta (Unidade/Nome/E-mail/Resposta/Data-hora)
// para os relatórios e para o boletim parcial/final do link público — usa os
// campos *_snapshot de Etapa 3 (nome/e-mail/unidades no momento do voto),
// nunca o cadastro atual, pelo mesmo motivo de getParticipantesByAssembleia:
// preservar a integridade histórica mesmo que o proprietário seja editado
// depois. `votado_em` foi liberado aqui a pedido do usuário — mostrar quando
// cada voto foi registrado ajuda a afastar suspeita de fraude (voto
// retroativo/fora de hora). Quem chama isto pro link público NÃO deve
// exibir `email` (é PII de outro morador) nem a tabela inteira quando
// `pauta.sigiloso` — a mesma regra já aplicada nos relatórios PDF/XLSX.
export async function getVotosDetalhados(assembleiaId: string): Promise<VotoDetalhado[]> {
  const db = createServerClient()

  type RawUnidadeSnapshot = { numero: string; bloco: string | null }

  type RespostaRow = {
    pauta_id: string
    resposta: "Sim" | "Não" | "Abstenção" | null
    opcao_id: string | null
    assembleia_sends: {
      nome_snapshot: string | null
      email_snapshot: string | null
      unidades_snapshot: RawUnidadeSnapshot[] | null
      votado_em: string | null
      participante_nome: string | null
    } | null
    pauta_opcoes: { label: string } | null
  }

  const { data, error } = await db
    .from("assembleia_respostas")
    .select(
      "pauta_id, resposta, opcao_id, assembleia_sends!inner(assembleia_id, nome_snapshot, email_snapshot, unidades_snapshot, votado_em, participante_nome), pauta_opcoes(label)"
    )
    .eq("assembleia_sends.assembleia_id", assembleiaId)

  if (error) throw new Error(error.message)

  const votos = ((data ?? []) as unknown as RespostaRow[]).map((r) => {
    const unidadesSnapshot = r.assembleia_sends?.unidades_snapshot ?? []
    const unidades = [...unidadesSnapshot]
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))
      .map((u) => u.numero)
      .join(", ")

    return {
      pauta_id: r.pauta_id,
      unidades: unidades || "—",
      nome: r.assembleia_sends?.nome_snapshot ?? "—",
      email: r.assembleia_sends?.email_snapshot ?? null,
      resposta: r.opcao_id ? (r.pauta_opcoes?.label ?? "—") : (r.resposta ?? "—"),
      votado_em: r.assembleia_sends?.votado_em ?? null,
      participante: r.assembleia_sends?.participante_nome ?? null,
    }
  })

  return votos.sort((a, b) => a.unidades.localeCompare(b.unidades, undefined, { numeric: true }))
}

export async function getUnidadesRelatorio(condominioId: string): Promise<UnidadeRelatorio[]> {
  const proprietarios = await getAllProprietarios(condominioId)
  const unidades: UnidadeRelatorio[] = []

  for (const p of proprietarios) {
    for (const u of p.unidades ?? []) {
      unidades.push({
        numero: u.numero,
        bloco: u.bloco ?? null,
        proprietario: p.nome,
        email: p.email,
      })
    }
  }

  return unidades.sort((a, b) => {
    const blocoCmp = (a.bloco ?? "").localeCompare(b.bloco ?? "")
    if (blocoCmp !== 0) return blocoCmp
    return a.numero.localeCompare(b.numero, undefined, { numeric: true })
  })
}
