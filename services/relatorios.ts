import { createServerClient } from "@/lib/supabase/server"
import { getAllProprietarios } from "@/services/proprietarios"
import { getProcuracoesByAssembleia } from "@/services/procuracoes"
import { menorNumeroUnidade } from "@/lib/unidade-format"

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
  // Imóvel(is) do proprietário — pedido do Carlos: a conferência é feita por
  // imóvel, então a lista mostra e ordena por ele. Snapshot do voto quando
  // existe; senão, cadastro atual.
  unidades: string
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
    .select("id, nome_snapshot, votado_em, unidades_snapshot, proprietarios(nome, unidades(numero, bloco))")
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
    unidades_snapshot: UnidadeRaw[] | null
    proprietarios: { nome: string; unidades: UnidadeRaw[] | null } | null
  }

  const linhas = ((sends ?? []) as unknown as SendRow[]).map((s) => {
    const us =
      (s.unidades_snapshot && s.unidades_snapshot.length > 0
        ? s.unidades_snapshot
        : s.proprietarios?.unidades) ?? []
    const item: HistoricoParticipante = {
      proprietarioNome: s.nome_snapshot ?? s.proprietarios?.nome ?? "—",
      unidades: us.length > 0 ? fmtUnidades(us) : "—",
      totalPautas,
      pautasRespondidas: countPorSend.get(s.id) ?? 0,
      ultimaResposta: s.votado_em ?? null,
    }
    // Chave de ordenação = menor número de imóvel (natural). Sem imóvel = null
    // (vai pro fim).
    return { item, ordem: menorNumeroUnidade(us) }
  })

  // Ordena por IMÓVEL (pedido do Carlos: conferência na sequência dos imóveis,
  // não por nome). Sem imóvel vai pro fim; empate de imóvel cai no nome.
  linhas.sort((a, b) => {
    if (a.ordem === null && b.ordem === null)
      return a.item.proprietarioNome.localeCompare(b.item.proprietarioNome, "pt-BR")
    if (a.ordem === null) return 1
    if (b.ordem === null) return -1
    const cmp = a.ordem.localeCompare(b.ordem, undefined, { numeric: true })
    return cmp !== 0 ? cmp : a.item.proprietarioNome.localeCompare(b.item.proprietarioNome, "pt-BR")
  })

  return linhas.map((l) => l.item)
}

// Extrato de participação em PDF (pedido do Carlos: um "extrato da apuração"
// baixável, pra apresentar/auditar — traz data e hora do voto por imóvel). É a
// versão imprimível da tabela "Participação (controle interno)" da tela, com um
// cabeçalho de contadores POR IMÓVEL (regra do Carlos: a assembleia gira em
// torno do imóvel, não da pessoa). Escopo = quem tem send nesta assembleia
// (mesmas linhas da tela). Diferente de getHistoricoParticipacao (que alimenta a
// tela) por trazer também a contagem de imóveis por linha, a presença e o resumo.
export type ParticipacaoStatus = "completo" | "parcial" | "pendente"

export interface ExtratoParticipacaoLinha {
  proprietarioNome: string
  // Imóvel(is) formatado(s) ("A-101, A-102") e a quantidade (pro resumo por imóvel).
  unidades: string
  qtdImoveis: number
  totalPautas: number
  pautasRespondidas: number
  status: ParticipacaoStatus
  // Participou da assembleia: marcado presente pela mesa OU já votou (voto manual
  // não passa pela chamada). Garante Presentes >= Votou geral + parcial.
  presente: boolean
  // Data/hora do voto (votado_em) — o dado de auditoria que o Carlos valoriza.
  ultimaResposta: string | null
  // Este imóvel participou por PROCURAÇÃO: o dono outorgou e quem votou foi o
  // representante. A participação da linha (pautas/status/presença/data) é a do
  // representante — não "Não votou". Evita contar o imóvel 2x (bug do Carlos).
  viaProcuracao?: boolean
  // Nome do representante, quando viaProcuracao.
  representanteNome?: string
}

export interface ExtratoParticipacaoResumo {
  imoveis: number
  presentes: number
  votouGeral: number
  votouParcial: number
  naoVotou: number
}

export interface ExtratoParticipacao {
  linhas: ExtratoParticipacaoLinha[]
  resumo: ExtratoParticipacaoResumo
}

// Linha de send já lida do banco (entrada do núcleo puro do extrato).
export interface ExtratoSendRow {
  id: string
  proprietario_id: string
  nome_snapshot: string | null
  votado_em: string | null
  presente_em: string | null
  unidades_snapshot: UnidadeRaw[] | null
  proprietarios: { nome: string; unidades: UnidadeRaw[] | null } | null
}
// Procuração desta assembleia (só o que o extrato precisa). `outorgante_nome` e
// `outorgante_unidades` servem pra MONTAR uma linha quando o outorgante não tem
// send (ex.: condômino sem e-mail que não compareceu) — senão o imóvel dele,
// que agora não é mais somado no representante, sumiria da contagem.
export interface ExtratoProcuracao {
  outorgante_id: string
  outorgante_nome: string
  outorgante_unidades: UnidadeRaw[]
  outorgado_id: string
  outorgado_nome: string
}

// Núcleo PURO do extrato (sem banco) — testável. Recebe os sends já lidos, a
// contagem de respostas por send e as procurações; monta as linhas por imóvel +
// o resumo. SEPARADO do fetch de propósito: a contagem por imóvel com procuração
// é sutil (já contou errado — bug do Carlos) e merece teste de regressão.
//
// Procuração (bug do Carlos: o extrato dava 310 imóveis em vez de 300,
// "duplicando os procuradores"). Quem OUTORGA procuração não vota por conta
// própria — quem vota é o representante, cujo `unidades_snapshot` do voto vem
// SOMADO com as unidades do outorgante (pra o peso bater). Somar o snapshot de
// cada send contava o imóvel do outorgante 2x: na linha do representante
// (snapshot somado) E na do próprio outorgante. Correção:
//   • conta cada imóvel UMA vez, sob o dono — unidades do CADASTRO, não o
//     snapshot do voto (no representante o snapshot está somado);
//   • a participação do imóvel do outorgante ESPELHA a do representante (quem de
//     fato votou carregando o peso) em vez de cair em "Não votou".
export function montarExtratoParticipacao(
  rows: ExtratoSendRow[],
  countPorSend: Map<string, number>,
  procuracoes: ExtratoProcuracao[],
  totalPautas: number
): ExtratoParticipacao {
  const resumoVazio: ExtratoParticipacaoResumo = {
    imoveis: 0,
    presentes: 0,
    votouGeral: 0,
    votouParcial: 0,
    naoVotou: 0,
  }
  if (rows.length === 0) return { linhas: [], resumo: resumoVazio }

  const repDeOutorgante = new Map<string, { id: string; nome: string }>()
  for (const p of procuracoes) {
    repDeOutorgante.set(p.outorgante_id, { id: p.outorgado_id, nome: p.outorgado_nome })
  }
  const ehRepresentante = new Set(procuracoes.map((p) => p.outorgado_id))

  // Participação por proprietário (o outorgante puxa a do seu representante).
  const partPorProprietario = new Map<
    string,
    { pautasRespondidas: number; votadoEm: string | null; presente: boolean }
  >()
  for (const s of rows) {
    partPorProprietario.set(s.proprietario_id, {
      pautasRespondidas: countPorSend.get(s.id) ?? 0,
      votadoEm: s.votado_em,
      presente: s.presente_em !== null || s.votado_em !== null,
    })
  }

  // Outorgante SEM send (ex.: condômino sem e-mail que não compareceu): como o
  // imóvel dele deixou de ser somado no representante, ele sumiria da contagem.
  // Monta uma linha sintética com as unidades do outorgante — MAS só quando o
  // representante está de fato participando (presente/votou); senão o imóvel não
  // está participando por ninguém e fica fora do escopo (como qualquer imóvel
  // sem send). Pra os dados do Carlos isto fica inerte: lá todo outorgante tem
  // send (por isso o bug somava 310).
  const propIdsComSend = new Set(rows.map((r) => r.proprietario_id))
  const sinteticos: ExtratoSendRow[] = procuracoes
    .filter((p) => {
      if (propIdsComSend.has(p.outorgante_id)) return false // já tem linha real
      if (p.outorgante_unidades.length === 0) return false
      const repPart = partPorProprietario.get(p.outorgado_id)
      return !!repPart && repPart.presente // o representante está participando
    })
    .map((p) => ({
      id: `proc:${p.outorgante_id}`,
      proprietario_id: p.outorgante_id,
      nome_snapshot: p.outorgante_nome,
      votado_em: null,
      presente_em: null,
      unidades_snapshot: null,
      proprietarios: { nome: p.outorgante_nome, unidades: p.outorgante_unidades },
    }))

  // Mesmos três estados da tela: pendente (0 respostas), completo (todas),
  // parcial (algumas).
  const statusDe = (pautasRespondidas: number): ParticipacaoStatus =>
    pautasRespondidas === 0
      ? "pendente"
      : pautasRespondidas === totalPautas && totalPautas > 0
        ? "completo"
        : "parcial"

  const linhas = [...rows, ...sinteticos].map((s) => {
    // Imóveis DO DONO (cadastro). No representante NÃO usamos o snapshot do voto
    // (vem somado com o do outorgante → duplicaria). Fora de representante,
    // snapshot == cadastro (não há mudança de unidade após o voto); o snapshot
    // fica só de resiliência caso o cadastro do dono tenha sumido.
    const us: UnidadeRaw[] = ehRepresentante.has(s.proprietario_id)
      ? (s.proprietarios?.unidades ?? [])
      : (s.unidades_snapshot && s.unidades_snapshot.length > 0
          ? s.unidades_snapshot
          : s.proprietarios?.unidades) ?? []

    const rep = repDeOutorgante.get(s.proprietario_id)
    // Participação EFETIVA deste imóvel: a do próprio, ou — se outorgou — a do
    // representante (o voto que de fato carregou o peso deste imóvel).
    const part = rep
      ? partPorProprietario.get(rep.id) ?? {
          pautasRespondidas: 0,
          votadoEm: null,
          presente: false,
        }
      : {
          pautasRespondidas: countPorSend.get(s.id) ?? 0,
          votadoEm: s.votado_em,
          presente: s.presente_em !== null || s.votado_em !== null,
        }

    const item: ExtratoParticipacaoLinha = {
      proprietarioNome: s.nome_snapshot ?? s.proprietarios?.nome ?? "—",
      unidades: us.length > 0 ? fmtUnidades(us) : "—",
      qtdImoveis: us.length,
      totalPautas,
      pautasRespondidas: part.pautasRespondidas,
      status: statusDe(part.pautasRespondidas),
      presente: part.presente,
      ultimaResposta: part.votadoEm,
      viaProcuracao: !!rep,
      representanteNome: rep?.nome,
    }
    return { item, ordem: menorNumeroUnidade(us) }
  })

  // Ordena por IMÓVEL (como a tabela da tela); sem imóvel vai pro fim.
  linhas.sort((a, b) => {
    if (a.ordem === null && b.ordem === null)
      return a.item.proprietarioNome.localeCompare(b.item.proprietarioNome, "pt-BR")
    if (a.ordem === null) return 1
    if (b.ordem === null) return -1
    const cmp = a.ordem.localeCompare(b.ordem, undefined, { numeric: true })
    return cmp !== 0 ? cmp : a.item.proprietarioNome.localeCompare(b.item.proprietarioNome, "pt-BR")
  })

  const ordenadas = linhas.map((l) => l.item)
  const resumo = ordenadas.reduce((acc, l) => {
    acc.imoveis += l.qtdImoveis
    if (l.presente) acc.presentes += l.qtdImoveis
    if (l.status === "completo") acc.votouGeral += l.qtdImoveis
    else if (l.status === "parcial") acc.votouParcial += l.qtdImoveis
    else acc.naoVotou += l.qtdImoveis
    return acc
  }, { ...resumoVazio })

  return { linhas: ordenadas, resumo }
}

export async function getExtratoParticipacao(
  assembleiaId: string,
  totalPautas: number
): Promise<ExtratoParticipacao> {
  const db = createServerClient()

  const { data: sends, error } = await db
    .from("assembleia_sends")
    .select(
      "id, proprietario_id, nome_snapshot, votado_em, presente_em, unidades_snapshot, proprietarios(nome, unidades(numero, bloco))"
    )
    .eq("assembleia_id", assembleiaId)
  if (error) throw new Error(error.message)

  const rows = (sends ?? []) as unknown as ExtratoSendRow[]
  if (rows.length === 0) {
    return {
      linhas: [],
      resumo: { imoveis: 0, presentes: 0, votouGeral: 0, votouParcial: 0, naoVotou: 0 },
    }
  }

  const { data: respostas, error: respError } = await db
    .from("assembleia_respostas")
    .select("send_id")
    .in(
      "send_id",
      rows.map((s) => s.id)
    )
  if (respError) throw new Error(respError.message)

  const countPorSend = new Map<string, number>()
  for (const r of (respostas ?? []) as { send_id: string }[]) {
    countPorSend.set(r.send_id, (countPorSend.get(r.send_id) ?? 0) + 1)
  }

  const procuracoesRaw = await getProcuracoesByAssembleia(assembleiaId)

  // Unidades dos outorgantes que NÃO têm send — pra montar a linha sintética
  // deles (ver montarExtratoParticipacao). Só busca quando há outorgante sem
  // send; no caso comum (todos têm send) nem roda a query.
  const propIdsComSend = new Set(rows.map((r) => r.proprietario_id))
  const outorganteIdsSemSend = procuracoesRaw
    .map((p) => p.outorgante_id)
    .filter((id) => !propIdsComSend.has(id))
  const unidadesPorOutorgante = new Map<string, UnidadeRaw[]>()
  if (outorganteIdsSemSend.length > 0) {
    const { data: uds, error: udsError } = await db
      .from("unidades")
      .select("proprietario_id, numero, bloco")
      .in("proprietario_id", outorganteIdsSemSend)
    if (udsError) throw new Error(udsError.message)
    for (const u of (uds ?? []) as { proprietario_id: string; numero: string; bloco: string | null }[]) {
      const arr = unidadesPorOutorgante.get(u.proprietario_id) ?? []
      arr.push({ numero: u.numero, bloco: u.bloco })
      unidadesPorOutorgante.set(u.proprietario_id, arr)
    }
  }

  const procuracoes: ExtratoProcuracao[] = procuracoesRaw.map((p) => ({
    outorgante_id: p.outorgante_id,
    outorgante_nome: p.outorgante_nome,
    outorgante_unidades: unidadesPorOutorgante.get(p.outorgante_id) ?? [],
    outorgado_id: p.outorgado_id,
    outorgado_nome: p.outorgado_nome,
  }))

  return montarExtratoParticipacao(rows, countPorSend, procuracoes, totalPautas)
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
