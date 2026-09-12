import { createServerClient } from "@/lib/supabase/server"
import { getPesoParticipante, getPesoTotalCondominio, getQuorumEfetivo } from "@/lib/peso"
import { marcarPautaEmVotacaoSeNecessario } from "@/services/pautas"
import { getCondominioById } from "@/services/condominios"
import { getUnidadesByCondominioId } from "@/services/unidades"
import { outorgouProcuracao, getOutorgantesIds } from "@/services/procuracoes"
import { getIdsInadimplentes } from "@/services/proprietarios"
import { isVotacaoAberta } from "@/lib/assembleia-status"
import type {
  AssembleiaSend,
  AssembleiaResposta,
  AssembleiaRespostaValor,
  AssembleiaApuracao,
  AssembleiaStatus,
  CriterioPeso,
  OpcaoApuracao,
  Pauta,
  PautaOpcao,
  PautaStatus,
  SendStatus,
} from "@/types"

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

function rowToPautaOpcao(row: JoinedPautaOpcao): PautaOpcao {
  return {
    id: row.id,
    pauta_id: row.pauta_id,
    ordem: row.ordem,
    label: row.label,
    created_at: row.created_at,
  }
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
  condominios: { nome: string } | null
  pautas: JoinedPauta[] | null
}

type RawUnidadeSnapshot = { numero: string; bloco: string | null }

type JoinedSendSnapshot = {
  nome_snapshot: string | null
  cpf_snapshot: string | null
  email_snapshot: string | null
  telefone_snapshot: string | null
  quantidade_unidades_snapshot: number | null
  unidades_snapshot: RawUnidadeSnapshot[] | null
  peso_snapshot: number | null
  votado_em: string | null
  ip_snapshot: string | null
  user_agent_snapshot: string | null
}

type JoinedSend = JoinedSendSnapshot & {
  id: string
  assembleia_id: string
  proprietario_id: string
  token: string
  status: SendStatus
  sent_at: string | null
  created_at: string
  assembleias: JoinedAssembleia | null
  proprietarios: { id: string; nome: string; email: string } | null
}

const SELECT_SEND_JOINED =
  "*, assembleias(id, condominio_id, titulo, descricao, status, data_abertura, data_encerramento, quorum_minimo, data_1a_convocacao, quorum_minimo_2a, condominios(nome), pautas(id, assembleia_id, ordem, titulo, descricao, ativa, tipo, permite_abstencao, status, quorum_aprovacao, sigiloso, created_at, pauta_opcoes(*))), proprietarios(id, nome, email)"

function rowToSend(row: JoinedSend): AssembleiaSend {
  const a = row.assembleias
  return {
    id: row.id,
    assembleia_id: row.assembleia_id,
    proprietario_id: row.proprietario_id,
    token: row.token,
    status: row.status,
    sent_at: row.sent_at,
    nome_snapshot: row.nome_snapshot,
    cpf_snapshot: row.cpf_snapshot,
    email_snapshot: row.email_snapshot,
    telefone_snapshot: row.telefone_snapshot,
    quantidade_unidades_snapshot: row.quantidade_unidades_snapshot,
    unidades_snapshot: row.unidades_snapshot,
    peso_snapshot: row.peso_snapshot,
    votado_em: row.votado_em,
    ip_snapshot: row.ip_snapshot,
    user_agent_snapshot: row.user_agent_snapshot,
    created_at: row.created_at,
    assembleia: a
      ? {
          id: a.id,
          condominio_id: a.condominio_id,
          titulo: a.titulo,
          descricao: a.descricao,
          status: a.status,
          data_abertura: a.data_abertura,
          data_encerramento: a.data_encerramento,
          quorum_minimo: a.quorum_minimo,
          data_1a_convocacao: a.data_1a_convocacao,
          quorum_minimo_2a: a.quorum_minimo_2a,
          condominio_nome: a.condominios?.nome ?? null,
          pautas: (a.pautas ?? [])
            .map((p) => ({
              id: p.id,
              assembleia_id: p.assembleia_id,
              ordem: p.ordem,
              titulo: p.titulo,
              descricao: p.descricao,
              ativa: p.ativa,
              tipo: p.tipo,
              permite_abstencao: p.permite_abstencao,
              status: p.status,
              quorum_aprovacao: p.quorum_aprovacao,
              sigiloso: p.sigiloso,
              created_at: p.created_at,
              opcoes: p.pauta_opcoes
                ? [...p.pauta_opcoes].sort((x, y) => x.ordem - y.ordem).map(rowToPautaOpcao)
                : undefined,
            }))
            .sort((x, y) => x.ordem - y.ordem),
        }
      : undefined,
    proprietario: row.proprietarios ?? undefined,
  }
}

export async function getAssembleiaSendByToken(token: string): Promise<AssembleiaSend | null> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select(SELECT_SEND_JOINED)
    .eq("token", token)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(error.message)
  }
  return rowToSend(data as unknown as JoinedSend)
}

// Upsert garante que cada proprietário recebe no máximo um send por assembleia.
// Em caso de re-envio, atualiza o token para gerar um novo link.
export async function upsertAssembleiaSend(input: {
  assembleia_id: string
  proprietario_id: string
  token: string
}): Promise<AssembleiaSend> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .upsert({ ...input, status: "pending" as const }, { onConflict: "assembleia_id,proprietario_id" })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return {
    id: data.id,
    assembleia_id: data.assembleia_id,
    proprietario_id: data.proprietario_id,
    token: data.token,
    status: data.status as SendStatus,
    sent_at: data.sent_at,
    nome_snapshot: data.nome_snapshot,
    cpf_snapshot: data.cpf_snapshot,
    email_snapshot: data.email_snapshot,
    telefone_snapshot: data.telefone_snapshot,
    quantidade_unidades_snapshot: data.quantidade_unidades_snapshot,
    unidades_snapshot: data.unidades_snapshot as { numero: string; bloco: string | null }[] | null,
    peso_snapshot: data.peso_snapshot,
    votado_em: data.votado_em,
    ip_snapshot: data.ip_snapshot,
    user_agent_snapshot: data.user_agent_snapshot,
    created_at: data.created_at,
  }
}

export async function updateAssembleiaSendStatus(
  id: string,
  status: SendStatus,
  sent_at?: string
): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from("assembleia_sends")
    .update({ status, ...(sent_at ? { sent_at } : {}) })
    .eq("id", id)

  if (error) throw new Error(error.message)
}

export async function getRespostasBySendId(sendId: string): Promise<AssembleiaResposta[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_respostas")
    .select("*")
    .eq("send_id", sendId)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AssembleiaResposta[]
}

export interface RespostaInput {
  pauta_id: string
  // Para pauta "sim_nao": `resposta` obrigatório. Para "multipla_escolha":
  // ou `opcao_id` (voto na opção), ou `resposta: "Abstenção"` — nunca os dois.
  resposta?: AssembleiaRespostaValor
  opcao_id?: string
}

type SendComProprietarioCompleto = {
  assembleia_id: string
  proprietario_id: string
  votado_em: string | null
  proprietarios: {
    nome: string
    cpf: string | null
    email: string | null
    telefone: string | null
    inadimplente: boolean
    unidades: { numero: string; bloco: string | null; fracao_ideal: number | null }[] | null
  } | null
  assembleias: { status: AssembleiaStatus; condominios: { criterio_peso: CriterioPeso } | null } | null
}

export interface ContextoVoto {
  ip?: string | null
  userAgent?: string | null
}

// Auditoria de segurança: garante que o voto só é aceito enquanto a
// assembleia está "aberta" e que toda pauta respondida pertence a ESSA
// assembleia (nunca a uma outra, mesmo que o chamador tente enviar um
// pauta_id de outro lugar). Sem isso, alguém com um token válido poderia
// votar depois do encerramento ou injetar respostas em pautas alheias.
//
// Votação parcial/complementar: não exige mais responder todas as pautas de
// uma vez (uma pauta pode surgir depois que o participante já votou nas
// outras — ver item 5 do pedido). Em vez disso, garante que nenhuma pauta
// enviada agora já foi respondida por este mesmo send_id — sem essa
// checagem, uma tentativa de reenvio bateria direto na constraint única do
// banco com uma mensagem menos clara, e um voto já registrado nunca pode ser
// alterado.
async function validarVotoOuFalhar(
  db: ReturnType<typeof createServerClient>,
  sendId: string,
  assembleiaId: string,
  proprietarioId: string,
  status: AssembleiaStatus,
  pautaIds: string[],
  inadimplente: boolean
): Promise<void> {
  if (!isVotacaoAberta(status)) {
    throw new Error("Esta assembleia não está aberta para votação.")
  }
  if (pautaIds.length === 0) {
    throw new Error("Nenhuma pauta para registrar.")
  }

  // Código Civil, art. 1.335, §único / convenções condominiais: proprietário
  // inadimplente não vota. Vale tanto pro link de autoatendimento quanto pro
  // lançamento manual do síndico — sem exceção nos dois.
  if (inadimplente) {
    throw new Error("Proprietário inadimplente não pode votar.")
  }

  // Auditoria de assembleias — Fase 8: quem outorgou procuração pra outro
  // proprietário nesta assembleia não vota mais por conta própria — o
  // peso dele já é somado no voto do outorgado (ver mais abaixo).
  if (await outorgouProcuracao(assembleiaId, proprietarioId)) {
    throw new Error(
      "Você outorgou procuração a outro proprietário nesta assembleia — quem vota agora é o seu representante."
    )
  }

  const idsUnicos = [...new Set(pautaIds)]
  const { data: todasPautas, error } = await db
    .from("pautas")
    .select("id")
    .eq("assembleia_id", assembleiaId)

  if (error) throw new Error(error.message)
  const idsValidos = new Set((todasPautas ?? []).map((p) => p.id as string))

  if (idsUnicos.some((id) => !idsValidos.has(id))) {
    throw new Error("Pauta inválida para esta assembleia.")
  }

  const { data: respostasExistentes, error: respostasError } = await db
    .from("assembleia_respostas")
    .select("pauta_id")
    .eq("send_id", sendId)
    .in("pauta_id", idsUnicos)

  if (respostasError) throw new Error(respostasError.message)
  if ((respostasExistentes ?? []).length > 0) {
    throw new Error("Uma ou mais pautas enviadas já foram respondidas anteriormente.")
  }
}

// O peso — e, desde a Etapa 3, a identidade completa do proprietário e suas
// unidades — é capturado UMA ÚNICA VEZ aqui, no momento em que o voto é
// registrado, e gravado como snapshot definitivo (`assembleia_respostas.peso`
// e as colunas `*_snapshot` de `assembleia_sends`). Nunca mais recalculado
// depois: uma transferência de unidade ou uma edição de cadastro após o
// voto não altera nada do que já foi registrado (ver lib/peso.ts).
export async function createAssembleiaRespostas(
  sendId: string,
  respostas: RespostaInput[],
  contexto: ContextoVoto = {}
): Promise<void> {
  const db = createServerClient()

  const { data: sendRow, error: sendError } = await db
    .from("assembleia_sends")
    .select(
      "assembleia_id, proprietario_id, votado_em, proprietarios(nome, cpf, email, telefone, inadimplente, unidades(numero, bloco, fracao_ideal)), assembleias(status, condominios(criterio_peso))"
    )
    .eq("id", sendId)
    .single()

  if (sendError) throw new Error(sendError.message)
  const send = sendRow as unknown as SendComProprietarioCompleto
  const proprietario = send.proprietarios

  await validarVotoOuFalhar(
    db,
    sendId,
    send.assembleia_id,
    send.proprietario_id,
    send.assembleias?.status ?? "encerrada",
    respostas.map((r) => r.pauta_id),
    proprietario?.inadimplente ?? false
  )

  const unidadesProprias = proprietario?.unidades ?? []
  const criterioPeso = send.assembleias?.condominios?.criterio_peso ?? "unidade"

  // Auditoria de assembleias — Fase 8: peso do outorgado soma o peso das
  // unidades de quem outorgou procuração pra ele nesta assembleia — o
  // outorgante em si já está bloqueado de votar por conta própria (ver
  // validarVotoOuFalhar acima). unidades_snapshot também reflete a soma,
  // pra bater com peso_snapshot no histórico.
  const outorgantesIds = await getOutorgantesIds(send.assembleia_id, send.proprietario_id)
  let unidadesDelegadas: { numero: string; bloco: string | null; fracao_ideal: number | null }[] = []
  if (outorgantesIds.length > 0) {
    // Defesa em profundidade: mesmo que uma procuração já exista de antes
    // da checagem em createProcuracao (services/procuracoes.ts), o peso de
    // um outorgante inadimplente nunca entra na soma — "inadimplente não
    // vota" vale mesmo por procuração, sem exceção.
    const inadimplentes = await getIdsInadimplentes(db, outorgantesIds)
    const outorgantesValidos = outorgantesIds.filter((id) => !inadimplentes.has(id))

    if (outorgantesValidos.length > 0) {
      const { data: unidadesOutorgantes, error: outorgantesError } = await db
        .from("unidades")
        .select("numero, bloco, fracao_ideal")
        .in("proprietario_id", outorgantesValidos)
      if (outorgantesError) throw new Error(outorgantesError.message)
      unidadesDelegadas = unidadesOutorgantes ?? []
    }
  }

  const unidades = [...unidadesProprias, ...unidadesDelegadas]
  const peso = getPesoParticipante({ unidades }, criterioPeso)

  const { error } = await db.from("assembleia_respostas").insert(
    respostas.map((r) => ({
      send_id: sendId,
      pauta_id: r.pauta_id,
      resposta: r.resposta ?? null,
      opcao_id: r.opcao_id ?? null,
      peso,
    }))
  )

  if (error) throw new Error(error.message)

  // Votação parcial: cada pauta respondida agora sobe pra "em_votacao" assim
  // que recebe seu 1º voto (nunca reverte, nunca mexe em pauta já
  // encerrada). Isolado por pauta — não depende do restante da assembleia.
  await Promise.all(respostas.map((r) => marcarPautaEmVotacaoSeNecessario(r.pauta_id)))

  // Snapshot em assembleia_sends — os campos de identidade/peso podem ser
  // regravados a cada chamada (refletem o cadastro no momento desta
  // contribuição), mas `votado_em` só é definido na 1ª vez: marca quando o
  // participante começou a votar, não a última vez que complementou.
  const { error: snapshotError } = await db
    .from("assembleia_sends")
    .update({
      nome_snapshot: proprietario?.nome ?? null,
      cpf_snapshot: proprietario?.cpf ?? null,
      email_snapshot: proprietario?.email ?? null,
      telefone_snapshot: proprietario?.telefone ?? null,
      quantidade_unidades_snapshot: unidades.length,
      unidades_snapshot: unidades,
      peso_snapshot: peso,
      votado_em: send.votado_em ?? new Date().toISOString(),
      ip_snapshot: contexto.ip ?? null,
      user_agent_snapshot: contexto.userAgent ?? null,
    })
    .eq("id", sendId)

  if (snapshotError) throw new Error(snapshotError.message)
}

type ApuracaoRow = {
  pauta_id: string
  resposta: AssembleiaRespostaValor | null
  opcao_id: string | null
  peso: number
}

// Auditoria de assembleias — Fase 1: Sim / (Sim + Não), ponderado —
// abstenção não entra no denominador (não conta a favor nem contra, regra
// mais comum em assembleia de condomínio). Comparado com
// pauta.quorum_aprovacao pra decidir `aprovada`. Null se ninguém votou Sim
// nem Não ainda.
function calcularAprovacao(
  ponderadoSim: number,
  ponderadoNao: number,
  quorumAprovacao: number
): { percentual_aprovacao: number | null; aprovada: boolean | null } {
  const base = ponderadoSim + ponderadoNao
  if (base === 0) return { percentual_aprovacao: null, aprovada: null }
  const percentual = ponderadoSim / base
  return { percentual_aprovacao: percentual, aprovada: percentual >= quorumAprovacao }
}

// Apuração de uma pauta "sim_nao" — lê o peso congelado em cada resposta
// (nunca recalculado a partir das unidades atuais do proprietário).
function apurarSimNao(pautaRows: ApuracaoRow[], quorumAprovacao: number) {
  let participantesSim = 0
  let participantesNao = 0
  let participantesAbstencao = 0
  let ponderadoSim = 0
  let ponderadoNao = 0
  let ponderadoAbstencao = 0
  let totalApartamentos = 0

  for (const row of pautaRows) {
    const peso = row.peso
    totalApartamentos += peso

    if (row.resposta === "Sim") {
      participantesSim += 1
      ponderadoSim += peso
    } else if (row.resposta === "Abstenção") {
      participantesAbstencao += 1
      ponderadoAbstencao += peso
    } else {
      participantesNao += 1
      ponderadoNao += peso
    }
  }

  return {
    por_participantes: { sim: participantesSim, nao: participantesNao, abstencao: participantesAbstencao },
    ponderado: { sim: ponderadoSim, nao: ponderadoNao, abstencao: ponderadoAbstencao },
    total_apartamentos_representados: totalApartamentos,
    ...calcularAprovacao(ponderadoSim, ponderadoNao, quorumAprovacao),
  }
}

// Apuração de uma pauta "multipla_escolha" — agrupa por opção votada; quem
// se absteve (resposta = "Abstenção", opcao_id nulo) entra no campo
// `abstencao`, no mesmo formato usado pelas pautas "sim_nao". Peso também
// vem congelado de `row.peso`, nunca recalculado.
function apurarMultiplaEscolha(pauta: Pauta, pautaRows: ApuracaoRow[]) {
  const porOpcao = new Map<string, { participantes: number; ponderado: number }>()
  for (const opcao of pauta.opcoes ?? []) {
    porOpcao.set(opcao.id, { participantes: 0, ponderado: 0 })
  }

  let participantesAbstencao = 0
  let ponderadoAbstencao = 0
  let totalApartamentos = 0

  for (const row of pautaRows) {
    const peso = row.peso
    totalApartamentos += peso

    if (row.opcao_id) {
      const acc = porOpcao.get(row.opcao_id) ?? { participantes: 0, ponderado: 0 }
      acc.participantes += 1
      acc.ponderado += peso
      porOpcao.set(row.opcao_id, acc)
    } else if (row.resposta === "Abstenção") {
      participantesAbstencao += 1
      ponderadoAbstencao += peso
    }
  }

  const opcoes_resultado: OpcaoApuracao[] = (pauta.opcoes ?? []).map((opcao) => {
    const acc = porOpcao.get(opcao.id) ?? { participantes: 0, ponderado: 0 }
    return { opcao_id: opcao.id, label: opcao.label, ...acc }
  })

  return {
    por_participantes: { sim: 0, nao: 0, abstencao: participantesAbstencao },
    ponderado: { sim: 0, nao: 0, abstencao: ponderadoAbstencao },
    total_apartamentos_representados: totalApartamentos,
    // Auditoria de assembleias — Fase 1: "aprovada" (Sim vs Não acima de um
    // quórum) não se aplica a múltipla escolha — aqui o resultado é sempre
    // "qual opção teve mais votos", não um passa/não passa. Ver
    // PautaApuracao.aprovada em types/index.ts.
    percentual_aprovacao: null,
    aprovada: null,
    opcoes_resultado,
  }
}

// O peso de cada resposta já vem congelado em `peso` (ver createAssembleiaRespostas)
// — a apuração só soma o que foi gravado no momento do voto, nunca recalcula
// a partir das unidades atuais do proprietário.
//
// Auditoria de assembleias — Fase 1: `condominioId` é usado só para o
// quórum mínimo (peso_total_condominio) — precisa ser o peso de TODAS as
// unidades do condomínio, não só de quem recebeu convite (ver
// lib/peso.ts:getPesoTotalCondominio), senão um proprietário sem e-mail
// cadastrado infla artificialmente o percentual de quórum atingido.
export async function getApuracaoAssembleia(
  assembleiaId: string,
  pautas: Pauta[],
  condominioId: string
): Promise<AssembleiaApuracao> {
  const db = createServerClient()

  const [respostasRes, sendsCount, respondidosCount, pesoRepresentadoRes, quorumMinimoRes, condominio, unidadesCondominio] =
    await Promise.all([
      db
        .from("assembleia_respostas")
        .select("pauta_id, resposta, opcao_id, peso, assembleia_sends!inner(assembleia_id)")
        .eq("assembleia_sends.assembleia_id", assembleiaId),
      db
        .from("assembleia_sends")
        .select("*", { count: "exact", head: true })
        .eq("assembleia_id", assembleiaId),
      // Votação parcial: um participante pode responder só parte das pautas,
      // então "quem respondeu" não é mais igual a "quantos responderam a
      // primeira pauta" (suposição antiga, só válida quando tudo era
      // respondido de uma vez só). `votado_em` é gravado uma única vez, no 1º
      // voto de cada send (ver createAssembleiaRespostas) — contar por ele dá
      // o total de participantes distintos que já votaram, sem depender de
      // nenhuma pauta específica.
      db
        .from("assembleia_sends")
        .select("*", { count: "exact", head: true })
        .eq("assembleia_id", assembleiaId)
        .not("votado_em", "is", null),
      // Peso representado = peso_snapshot (congelado 1x por participante, ver
      // createAssembleiaRespostas), somado por participante distinto — nunca
      // somar assembleia_respostas.peso aqui, que é por PAUTA e dobraria/
      // triplicaria a contagem de quem votou em mais de uma pauta.
      db
        .from("assembleia_sends")
        .select("peso_snapshot")
        .eq("assembleia_id", assembleiaId)
        .not("votado_em", "is", null),
      db
        .from("assembleias")
        .select("quorum_minimo, data_1a_convocacao, quorum_minimo_2a, data_encerramento")
        .eq("id", assembleiaId)
        .single(),
      getCondominioById(condominioId),
      getUnidadesByCondominioId(condominioId),
    ])

  if (respostasRes.error) throw new Error(respostasRes.error.message)
  if (sendsCount.error) throw new Error(sendsCount.error.message)
  if (respondidosCount.error) throw new Error(respondidosCount.error.message)
  if (pesoRepresentadoRes.error) throw new Error(pesoRepresentadoRes.error.message)
  if (quorumMinimoRes.error) throw new Error(quorumMinimoRes.error.message)

  const rows = (respostasRes.data ?? []) as unknown as ApuracaoRow[]
  const total_enviados = sendsCount.count ?? 0
  const total_respondidos = respondidosCount.count ?? 0

  const criterioPeso: CriterioPeso = condominio?.criterio_peso ?? "unidade"
  const peso_total_condominio = getPesoTotalCondominio(unidadesCondominio, criterioPeso)
  const peso_representado = (
    (pesoRepresentadoRes.data ?? []) as { peso_snapshot: number | null }[]
  ).reduce((soma, s) => soma + (s.peso_snapshot ?? 0), 0)

  // Auditoria de assembleias — Fase 2: getQuorumEfetivo decide se vale o
  // quórum da 1ª ou da 2ª convocação, com base em data_1a_convocacao vs. o
  // momento de referência (data_encerramento se já encerrada — decisão
  // definitiva e congelada — ou "agora" se ainda aberta, visão ao vivo).
  const quorumRow = quorumMinimoRes.data as {
    quorum_minimo: number | null
    data_1a_convocacao: string | null
    quorum_minimo_2a: number | null
    data_encerramento: string | null
  } | null
  const dataReferencia = quorumRow?.data_encerramento ? new Date(quorumRow.data_encerramento) : new Date()
  const { quorumAplicavel, convocacaoAplicada } = getQuorumEfetivo({
    quorum_minimo: quorumRow?.quorum_minimo ?? null,
    quorum_minimo_2a: quorumRow?.quorum_minimo_2a ?? null,
    data_1a_convocacao: quorumRow?.data_1a_convocacao ?? null,
    dataReferencia,
  })

  // quorumAplicavel null = sem checagem configurada (nem 1ª nem 2ª
  // convocação têm quórum aqui) — percentual/atingido ficam null (não é
  // "quórum não atingido", é "não se aplica"). As telas (admin, pública) e
  // os relatórios (PDF/XLSX) usam essa mesma regra, nunca decidem sozinhos
  // quando mostrar a seção de quórum.
  let percentual_quorum: number | null = null
  let quorum_atingido: boolean | null = null
  if (quorumAplicavel !== null && peso_total_condominio > 0) {
    percentual_quorum = peso_representado / peso_total_condominio
    quorum_atingido = percentual_quorum >= quorumAplicavel
  }

  // Agrupa respostas por pauta
  const byPauta = new Map<string, ApuracaoRow[]>()
  for (const row of rows) {
    const list = byPauta.get(row.pauta_id) ?? []
    list.push(row)
    byPauta.set(row.pauta_id, list)
  }

  const pautaApuracoes = pautas.map((pauta) => {
    const pautaRows = byPauta.get(pauta.id) ?? []
    const resultado =
      pauta.tipo === "multipla_escolha"
        ? apurarMultiplaEscolha(pauta, pautaRows)
        : apurarSimNao(pautaRows, pauta.quorum_aprovacao)

    return { pauta, ...resultado }
  })

  return {
    pautas: pautaApuracoes,
    total_enviados,
    total_respondidos,
    peso_total_condominio,
    peso_representado,
    percentual_quorum,
    quorum_atingido,
    convocacao_aplicada: quorumAplicavel !== null ? convocacaoAplicada : null,
    quorum_aplicavel: quorumAplicavel,
  }
}

// Proprietários que já registraram voto em QUALQUER assembleia deste
// condomínio (passada ou em andamento) — usado para restringir a edição de
// CPF (Etapa 2: só editável livremente antes do primeiro voto).
export async function getProprietariosQueJaVotaram(condominioId: string): Promise<Set<string>> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_respostas")
    .select("assembleia_sends!inner(proprietario_id, assembleias!inner(condominio_id))")
    .eq("assembleia_sends.assembleias.condominio_id", condominioId)

  if (error) throw new Error(error.message)

  type Row = { assembleia_sends: { proprietario_id: string } | null }
  return new Set(
    ((data ?? []) as unknown as Row[])
      .map((r) => r.assembleia_sends?.proprietario_id)
      .filter((id): id is string => Boolean(id))
  )
}

export interface SendJaVotado {
  id: string
  token: string
  proprietarioNome: string
  proprietarioEmail: string | null
}

// Item 5 do pedido de evolução: quem já votou nesta assembleia (mesmo que
// parcialmente) — usado para notificar sobre uma pauta nova, reaproveitando
// o token de cada um (sem rotacionar) já que o link continua válido e passa
// a mostrar a pauta pendente automaticamente.
export async function getSendsJaVotaram(assembleiaId: string): Promise<SendJaVotado[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select("id, token, nome_snapshot, email_snapshot, proprietarios(nome, email)")
    .eq("assembleia_id", assembleiaId)
    .not("votado_em", "is", null)

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    token: string
    nome_snapshot: string | null
    email_snapshot: string | null
    proprietarios: { nome: string; email: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    token: r.token,
    proprietarioNome: r.nome_snapshot ?? r.proprietarios?.nome ?? "Proprietário",
    proprietarioEmail: r.email_snapshot ?? r.proprietarios?.email ?? null,
  }))
}

// Auditoria de assembleias — Fase 6: quem ainda não registrou nenhum voto
// nesta assembleia — usado pro lembrete manual (botão "notificar quem não
// votou"). Sem snapshot ainda (não votou), então usa sempre o cadastro
// atual do proprietário — nunca *_snapshot, que só existe a partir do 1º
// voto (ver createAssembleiaRespostas).
export async function getSendsNaoVotaram(assembleiaId: string): Promise<SendJaVotado[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select("id, token, proprietarios(nome, email)")
    .eq("assembleia_id", assembleiaId)
    .is("votado_em", null)

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    token: string
    proprietarios: { nome: string; email: string | null } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    token: r.token,
    proprietarioNome: r.proprietarios?.nome ?? "Proprietário",
    proprietarioEmail: r.proprietarios?.email ?? null,
  }))
}

export interface ParticipacaoParcial {
  totalEnviados: number
  totalVotaram: number
  votantes: { nome: string; unidades: { numero: string; bloco: string | null }[] }[]
}

// Achado de auditoria: participante que já votou não tinha NENHUMA
// informação sobre o andamento da votação até o encerramento — pediu-se
// mostrar quem já votou, mas de propósito SEM o placar Sim/Não/Abstenção
// (evita efeito manada em quem ainda vai votar, mesmo risco pelo qual
// eleições não divulgam parcial com a urna aberta). Usa nome_snapshot/
// unidades_snapshot (congelados no voto) em vez do cadastro atual, mesma
// lógica de sempre — mas cai pro cadastro vigente se o snapshot faltar
// (proprietário ainda não votou, não deveria acontecer aqui já que o
// filtro é por votado_em, mas evita null em caso de dado legado).
export async function getParticipacaoParcial(assembleiaId: string): Promise<ParticipacaoParcial> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select("votado_em, nome_snapshot, unidades_snapshot, proprietarios(nome)")
    .eq("assembleia_id", assembleiaId)

  if (error) throw new Error(error.message)

  type Row = {
    votado_em: string | null
    nome_snapshot: string | null
    unidades_snapshot: { numero: string; bloco: string | null }[] | null
    proprietarios: { nome: string } | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const votantes = rows
    .filter((r) => r.votado_em !== null)
    .map((r) => ({
      nome: r.nome_snapshot ?? r.proprietarios?.nome ?? "Proprietário",
      unidades: r.unidades_snapshot ?? [],
    }))

  return {
    totalEnviados: rows.length,
    totalVotaram: votantes.length,
    votantes,
  }
}

export interface ProprietarioSemVoto {
  id: string
  nome: string
  email: string | null
}

// Auditoria de assembleias — Fase 7: proprietários do condomínio que ainda
// não votaram nesta assembleia — inclui tanto quem nunca recebeu convite
// (proprietario sem e-mail, nunca teve assembleia_sends criado) quanto
// quem recebeu mas não votou ainda. Usado pro registro de voto manual
// (síndico lança o voto de quem votou presencialmente/sem e-mail).
export async function getProprietariosSemVoto(
  condominioId: string,
  assembleiaId: string
): Promise<ProprietarioSemVoto[]> {
  const db = createServerClient()

  const [{ data: proprietarios, error: propError }, { data: votados, error: votadosError }] =
    await Promise.all([
      db.from("proprietarios").select("id, nome, email").eq("condominio_id", condominioId),
      db
        .from("assembleia_sends")
        .select("proprietario_id")
        .eq("assembleia_id", assembleiaId)
        .not("votado_em", "is", null),
    ])

  if (propError) throw new Error(propError.message)
  if (votadosError) throw new Error(votadosError.message)

  const idsVotados = new Set((votados ?? []).map((v) => v.proprietario_id as string))

  return ((proprietarios ?? []) as { id: string; nome: string; email: string | null }[])
    .filter((p) => !idsVotados.has(p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
