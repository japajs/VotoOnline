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

// Histórico COMPLETO de disparos de e-mail (pedido do Carlos/síndica do Águas
// da Serra: provar TODOS os envios de um imóvel, não só o último). Lê da tabela
// de LOG append-only `assembleia_disparos` — UMA linha por disparo, com data e
// status próprios — e não mais da assembleia_sends (que é upsert e só guarda o
// último envio a cada pessoa). A prova de ENTREGA (entregue/spam/bounce) chega
// pelo webhook do Resend e vem nos campos *_em, casada por disparo.
export type DisparoTipo = "convocacao" | "nova_pauta" | "lembrete" | "backfill"

export interface DisparoHistorico {
  // Que envio foi esse: convocação, aviso de nova pauta, lembrete — ou
  // "backfill" (registro do último disparo conhecido migrado do modelo antigo,
  // de antes do log existir).
  tipo: DisparoTipo
  nome: string
  email: string | null
  // Imóvel(is) congelado(s) no momento do disparo.
  unidades: string
  status: "sent" | "failed"
  sentAt: string | null
  // Prova de entrega via webhook do Resend (null enquanto não chega o evento).
  entregueEm: string | null
  bounceEm: string | null
  spamEm: string | null
}

// Formata o imóvel como o resto do app: "A-101" quando há bloco separado, só o
// número quando o bloco está embutido (ex.: "A0101"). Ordena natural (numérico).
type UnidadeRaw = { numero: string; bloco: string | null }
function fmtUnidade(u: UnidadeRaw): string {
  return u.bloco ? `${u.bloco}-${u.numero}` : u.numero
}
function fmtUnidades(us: UnidadeRaw[]): string {
  return [...us]
    .map(fmtUnidade)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join(", ")
}

// Filtro opcional por período (pedido do Carlos: "solicitar a data antes de
// filtrar"). `de`/`ate` são instantes ISO (timestamptz) — a camada de cima
// converte o dia escolhido pra o começo/fim do dia no fuso de Brasília.
export async function getHistoricoDisparos(
  assembleiaId: string,
  opts?: { de?: string | null; ate?: string | null }
): Promise<DisparoHistorico[]> {
  const db = createServerClient()
  let query = db
    .from("assembleia_disparos")
    .select("tipo, status, sent_at, entregue_em, bounce_em, spam_em, email_enviado, nome_snapshot, unidades_snapshot")
    .eq("assembleia_id", assembleiaId)
  if (opts?.de) query = query.gte("sent_at", opts.de)
  if (opts?.ate) query = query.lte("sent_at", opts.ate)
  const { data, error } = await query.order("sent_at", { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)

  type Row = {
    tipo: DisparoTipo
    status: "sent" | "failed"
    sent_at: string | null
    entregue_em: string | null
    bounce_em: string | null
    spam_em: string | null
    email_enviado: string | null
    nome_snapshot: string | null
    unidades_snapshot: UnidadeRaw[] | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const unidades = r.unidades_snapshot ?? []
    return {
      tipo: r.tipo,
      nome: r.nome_snapshot ?? "—",
      email: r.email_enviado ?? null,
      unidades: unidades.length > 0 ? fmtUnidades(unidades) : "—",
      status: r.status,
      sentAt: r.sent_at,
      entregueEm: r.entregue_em,
      bounceEm: r.bounce_em,
      spamEm: r.spam_em,
    }
  })
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
