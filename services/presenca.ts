import { createServerClient } from "@/lib/supabase/server"
import { normalizarChaveUnidade } from "@/lib/unidade-format"
import { generateSurveyToken } from "@/lib/tokens"
import { isEmAndamento } from "@/lib/assembleia-status"
import { getAllProprietarios } from "@/services/proprietarios"
import { outorgouProcuracao, getProcuracoesByAssembleia } from "@/services/procuracoes"
import { normalizarCpf, cpfCompleto } from "@/lib/format"
import type { AssembleiaStatus } from "@/types"

export type RegistrarPresencaResult =
  | { ok: true; token: string }
  // `aguardando`: identidade confere (unidade + CPF), mas a mesa ainda não
  // marcou presente. O link fica "aguardando" e entra sozinho quando a mesa
  // confirmar (ver verificarEntradaAction + EntrarForm). Erros de identidade
  // (CPF/unidade errados) vêm SEM aguardando.
  | { ok: false; error: string; aguardando?: boolean }

// Presença online (Opção A — auto check-in). A partir do link público de
// entrada (/entrar/[assembleiaId]), o próprio proprietário se identifica por
// UNIDADE + CPF e "entra" na assembleia: marcamos `presente_em` (que vira a
// lista de presença online e o filtro de quem recebe e-mail) e devolvemos o
// token de voto, reaproveitando o mesmo mecanismo do /v/[token].
//
// A integridade do voto continua no fluxo de voto (constraint única, bloqueio
// de inadimplente/procuração) — aqui só confirmamos identidade o suficiente
// pra liberar o acesso. Mensagem de erro UNIFORME de propósito: não revela se
// a unidade existe nem se o CPF existe (mesma postura anti-enumeração do
// resto do sistema; quem chama ainda aplica rate limit por IP).
export async function registrarPresenca(
  assembleiaId: string,
  input: { numero: string; bloco: string | null; cpf: string }
): Promise<RegistrarPresencaResult> {
  const db = createServerClient()
  const erroGenerico = "Unidade ou CPF não confere. Confira os dados e tente de novo."

  const { data: assembleia, error: aErr } = await db
    .from("assembleias")
    .select("id, condominio_id, status, exige_presenca")
    .eq("id", assembleiaId)
    .maybeSingle()
  if (aErr) return { ok: false, error: aErr.message }
  if (!assembleia) return { ok: false, error: "Assembleia não encontrada." }
  if (!isEmAndamento(assembleia.status as AssembleiaStatus)) {
    return { ok: false, error: "Esta assembleia não está aberta para entrada no momento." }
  }

  const chave = normalizarChaveUnidade({ numero: input.numero, bloco: input.bloco })
  if (!chave) return { ok: false, error: "Informe a sua unidade." }

  // Unidade deste condomínio, pela chave normalizada (mesma regra de
  // duplicidade do cadastro — ver lib/unidade-format.ts).
  const { data: unidade, error: uErr } = await db
    .from("unidades")
    .select("proprietario_id")
    .eq("condominio_id", assembleia.condominio_id)
    .eq("numero_normalizado", chave)
    .limit(1)
    .maybeSingle()
  if (uErr) return { ok: false, error: uErr.message }
  if (!unidade) return { ok: false, error: erroGenerico }

  const { data: prop, error: pErr } = await db
    .from("proprietarios")
    .select("id, cpf")
    .eq("id", unidade.proprietario_id)
    .maybeSingle()
  if (pErr) return { ok: false, error: pErr.message }
  if (!prop) return { ok: false, error: erroGenerico }

  const cpfInformado = normalizarCpf(input.cpf)
  const cpfCadastro = normalizarCpf(prop.cpf ?? "")
  if (cpfCadastro.length !== 11) {
    // Sem CPF (ou CPF incompleto) no cadastro — autoatendimento não consegue
    // confirmar identidade. Cai pro caminho assistido (síndico lança o voto).
    return {
      ok: false,
      error:
        "Não foi possível confirmar sua identidade por aqui. Procure a administração/síndico para registrar seu voto.",
    }
  }
  if (cpfInformado !== cpfCadastro) return { ok: false, error: erroGenerico }

  // Outorgante não entra/vota por si: ao dar procuração, passou a representação
  // (presença e voto) ao procurador. Deixar entrar marcaria presença dele e o
  // imóvel seria contado 2x (aqui e no voto do procurador). Mensagem clara — a
  // pessoa já provou a identidade (unidade+CPF), então não há enumeração.
  if (await outorgouProcuracao(assembleiaId, prop.id)) {
    return {
      ok: false,
      error:
        "Você outorgou procuração nesta assembleia — quem participa e vota é o seu representante.",
    }
  }

  const { data: existente, error: exErr } = await db
    .from("assembleia_sends")
    .select("id, token, presente_em")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", prop.id)
    .maybeSingle()
  if (exErr) return { ok: false, error: exErr.message }

  // Presença controlada pela mesa: quando a assembleia exige presença, o link
  // NÃO libera o voto sozinho pelo CPF — a pessoa só vota se a MESA já a marcou
  // como presente (presente_em preenchido via a tela de Chamada). Aqui só
  // confirmamos a identidade (unidade+CPF, acima) e devolvemos o token de quem
  // está na lista de presença; quem não está, recebe o aviso pra assinar.
  if (assembleia.exige_presenca) {
    if (existente && existente.presente_em) {
      return { ok: true, token: existente.token }
    }
    // Registra a tentativa pra a mesa VER que tem alguém esperando ser
    // confirmado (a Chamada destaca). Não libera o voto — segue dependendo da
    // mesa marcar presente. Defensivo: se a coluna tentou_entrar_em ainda não
    // existir (migração não rodada), o erro é ignorado e a entrada não quebra.
    //
    // Grava SÓ na 1ª tentativa: no update, o filtro `.is(tentou_entrar_em,
    // null)` casa 0 linhas quando já está preenchido — a página de entrada
    // pesquisa a cada ~7s, então sem isso cada eleitor aguardando reescreveria
    // a coluna toda vez (write amplification) e o "tentou entrar HH:MM" da mesa
    // andaria pra ~agora, perdendo o horário de chegada real.
    const agora = new Date().toISOString()
    const tent = existente
      ? await db
          .from("assembleia_sends")
          .update({ tentou_entrar_em: agora })
          .eq("id", existente.id)
          .is("tentou_entrar_em", null)
      : await db.from("assembleia_sends").insert({
          assembleia_id: assembleiaId,
          proprietario_id: prop.id,
          token: generateSurveyToken(),
          status: "pending",
          tentou_entrar_em: agora,
        })
    // Falha aqui NÃO quebra a entrada (a pessoa só vê o aviso pra assinar a
    // lista), mas logamos pra rastrear em produção — ex.: migração não rodada,
    // ou corrida de 2 toques simultâneos (um cai no unique de
    // assembleia_id+proprietario_id, esperado e inofensivo).
    if (tent.error) {
      console.error("[registrarPresenca] não registrou tentou_entrar_em:", tent.error.message)
    }
    return {
      ok: false,
      aguardando: true,
      error:
        "Você ainda não foi marcado como presente pela mesa. Assine a lista na mesa de entrada para poder votar.",
    }
  }

  // Autoatendimento (exige_presenca = false): a própria entrada marca presença.
  // Reaproveita um send já existente SEM rotacionar o token; `presente_em`
  // grava só a 1ª entrada e nunca é sobrescrito.
  const agora = new Date().toISOString()

  if (existente) {
    if (!existente.presente_em) {
      const { error } = await db
        .from("assembleia_sends")
        .update({ presente_em: agora })
        .eq("id", existente.id)
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true, token: existente.token }
  }

  const token = generateSurveyToken()
  const { error } = await db.from("assembleia_sends").insert({
    assembleia_id: assembleiaId,
    proprietario_id: prop.id,
    token,
    status: "pending",
    presente_em: agora,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, token }
}

export interface PresenteItem {
  sendId: string
  nome: string
  email: string | null
  unidades: { numero: string; bloco: string | null }[]
  presenteEm: string
  votou: boolean
}

// Lista de presença online: quem ENTROU nesta assembleia pelo link de entrada
// (presente_em preenchido). Usa snapshot (nome/unidades congelados no voto)
// quando já votou; senão o cadastro atual. Ordenado por ordem de chegada.
export async function getPresencaAssembleia(assembleiaId: string): Promise<PresenteItem[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select(
      "id, presente_em, votado_em, nome_snapshot, unidades_snapshot, email_snapshot, proprietarios(nome, email, unidades(numero, bloco))"
    )
    .eq("assembleia_id", assembleiaId)
    .not("presente_em", "is", null)

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    presente_em: string | null
    votado_em: string | null
    nome_snapshot: string | null
    email_snapshot: string | null
    unidades_snapshot: { numero: string; bloco: string | null }[] | null
    proprietarios: {
      nome: string
      email: string | null
      unidades: { numero: string; bloco: string | null }[] | null
    } | null
  }

  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      sendId: r.id,
      nome: r.nome_snapshot ?? r.proprietarios?.nome ?? "—",
      email: r.email_snapshot ?? r.proprietarios?.email ?? null,
      unidades: r.unidades_snapshot ?? r.proprietarios?.unidades ?? [],
      presenteEm: r.presente_em as string,
      votou: r.votado_em !== null,
    }))
    .sort((a, b) => a.presenteEm.localeCompare(b.presenteEm))
}

export interface ChamadaItem {
  proprietarioId: string
  nome: string
  email: string | null
  temCpf: boolean
  unidades: { numero: string; bloco: string | null }[]
  presente: boolean
  votou: boolean
  // Outorgou procuração nesta assembleia — não pode ser marcado presente (a
  // presença é representada pelo procurador): o toggle fica desabilitado.
  outorgante: boolean
  // Tentou entrar pelo link/QR (unidade + CPF corretos) e ainda NÃO foi marcado
  // presente pela mesa — a Chamada destaca pra confirmação rápida. null quando
  // não tentou, ou quando já está presente.
  tentouEntrarEm: string | null
  // Token de voto — existe só pra quem tem send (presente/convidado). Permite
  // a mesa copiar o link direto de voto da pessoa (útil pra quem não tem CPF).
  token: string | null
}

export interface ChamadaData {
  exigePresenca: boolean
  itens: ChamadaItem[]
}

// Chamada: lista TODOS os condôminos pra a mesa marcar presença. Junta o
// cadastro completo do condomínio com os sends desta assembleia (presente_em /
// votado_em) e devolve também se a assembleia exige presença.
export async function getChamada(assembleiaId: string): Promise<ChamadaData> {
  const db = createServerClient()

  const { data: assembleia, error: aErr } = await db
    .from("assembleias")
    .select("condominio_id, exige_presenca")
    .eq("id", assembleiaId)
    .single()
  if (aErr) throw new Error(aErr.message)

  const [proprietarios, procuracoes] = await Promise.all([
    getAllProprietarios(assembleia.condominio_id),
    getProcuracoesByAssembleia(assembleiaId),
  ])
  const outorgantes = new Set(procuracoes.map((p) => p.outorgante_id))

  type SendRow = {
    proprietario_id: string
    token: string
    presente_em: string | null
    votado_em: string | null
    tentou_entrar_em?: string | null
  }
  const comTentou = await db
    .from("assembleia_sends")
    .select("proprietario_id, token, presente_em, votado_em, tentou_entrar_em")
    .eq("assembleia_id", assembleiaId)
  // Resiliência: se a coluna tentou_entrar_em ainda não existe (migração
  // pendente), refaz o select sem ela — a Chamada continua funcionando, só sem
  // o alerta de "tentando entrar". Loga pra distinguir "coluna faltando" de
  // um erro transitório do banco em produção.
  if (comTentou.error) {
    console.warn("[getChamada] select com tentou_entrar_em falhou, usando fallback:", comTentou.error.message)
  }
  const semTentou = comTentou.error
    ? await db
        .from("assembleia_sends")
        .select("proprietario_id, token, presente_em, votado_em")
        .eq("assembleia_id", assembleiaId)
    : null
  const sErr = semTentou ? semTentou.error : comTentou.error
  if (sErr) throw new Error(sErr.message)
  const sendsData = (semTentou ? semTentou.data : comTentou.data) as SendRow[] | null

  const porProp = new Map<
    string,
    { presente: boolean; votou: boolean; token: string; tentouEntrarEm: string | null }
  >()
  for (const s of (sendsData ?? []) as SendRow[]) {
    porProp.set(s.proprietario_id, {
      presente: s.presente_em !== null,
      votou: s.votado_em !== null,
      token: s.token,
      tentouEntrarEm: s.tentou_entrar_em ?? null,
    })
  }

  const itens: ChamadaItem[] = proprietarios.map((p) => {
    const st = porProp.get(p.id)
    return {
      proprietarioId: p.id,
      nome: p.nome,
      email: p.email,
      temCpf: cpfCompleto(p.cpf),
      unidades: (p.unidades ?? []).map((u) => ({ numero: u.numero, bloco: u.bloco })),
      presente: st?.presente ?? false,
      votou: st?.votou ?? false,
      outorgante: outorgantes.has(p.id),
      // Tentou entrar pelo link e ainda não foi marcado presente — a mesa vê o
      // destaque e confirma rápido. Zera quando marcado presente (irrelevante aí).
      tentouEntrarEm: st && !st.presente ? st.tentouEntrarEm : null,
      token: st?.token ?? null,
    }
  })

  return { exigePresenca: assembleia.exige_presenca, itens }
}

// Proprietários que tentaram entrar pelo link/QR (unidade + CPF corretos) e
// ainda NÃO foram marcados presentes pela mesa. Usado pra alertar a mesa EM
// TEMPO REAL também na tela geral de cadastro (não só na Chamada) — é onde a
// secretária fica a maior parte do tempo (pedido do Carlos). Resiliente: se a
// coluna tentou_entrar_em não existir (migração pendente) ou houver erro
// transitório, devolve lista vazia sem quebrar a tela.
export async function getProprietariosTentandoEntrar(
  assembleiaId: string
): Promise<{ id: string; em: string }[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select("proprietario_id, tentou_entrar_em")
    .eq("assembleia_id", assembleiaId)
    .not("tentou_entrar_em", "is", null)
    .is("presente_em", null)
  if (error) {
    console.warn("[getProprietariosTentandoEntrar] consulta falhou, devolvendo vazio:", error.message)
    return []
  }
  return ((data ?? []) as { proprietario_id: string; tentou_entrar_em: string | null }[])
    .filter((r) => r.tentou_entrar_em)
    .map((r) => ({ id: r.proprietario_id, em: r.tentou_entrar_em! }))
}

// Status AO VIVO pra a tela de gestão sincronizar entre dispositivos (duas
// secretárias ao mesmo tempo — pedido do Carlos). Numa consulta só devolve quem
// está PRESENTE, quem já VOTOU e quem está TENTANDO ENTRAR (link/QR, ainda sem
// presença). Leve (só ids) e resiliente à coluna tentou_entrar_em ausente
// (migração pendente); falha dura LANÇA (ver abaixo) pra não zerar a tela.
export async function getStatusPresencaLive(
  assembleiaId: string
): Promise<{ presentes: string[]; votaram: string[]; tentando: { id: string; em: string }[] }> {
  const db = createServerClient()
  type Row = {
    proprietario_id: string
    presente_em: string | null
    votado_em: string | null
    tentou_entrar_em?: string | null
  }

  const comTentou = await db
    .from("assembleia_sends")
    .select("proprietario_id, presente_em, votado_em, tentou_entrar_em")
    .eq("assembleia_id", assembleiaId)

  let rows: Row[] | null
  if (comTentou.error) {
    console.warn(
      "[getStatusPresencaLive] select com tentou_entrar_em falhou, usando fallback:",
      comTentou.error.message
    )
    const semTentou = await db
      .from("assembleia_sends")
      .select("proprietario_id, presente_em, votado_em")
      .eq("assembleia_id", assembleiaId)
    if (semTentou.error) {
      // Falha DURA (os dois selects falharam = banco fora/timeout, não é só a
      // coluna faltando). LANÇA em vez de devolver vazio: devolver [] faria a
      // action responder success:true com presentes=[], e o polling da lista
      // ZERARIA todas as marcações de presença na tela por ~7s num soluço do
      // banco (pânico na mesa). Lançando, a action cai no catch (success:false)
      // e o cliente PRESERVA o estado atual até o próximo ciclo bem-sucedido.
      console.error("[getStatusPresencaLive] consulta falhou:", semTentou.error.message)
      throw new Error(semTentou.error.message)
    }
    rows = semTentou.data as Row[] | null
  } else {
    rows = comTentou.data as Row[] | null
  }

  const presentes: string[] = []
  const votaram: string[] = []
  const tentando: { id: string; em: string }[] = []
  for (const r of rows ?? []) {
    if (r.votado_em) votaram.push(r.proprietario_id)
    if (r.presente_em) presentes.push(r.proprietario_id)
    // "Tentando entrar" = abriu o link/QR (tentou_entrar_em) e ainda NÃO está
    // presente — mesma regra do getProprietariosTentandoEntrar.
    else if (r.tentou_entrar_em) tentando.push({ id: r.proprietario_id, em: r.tentou_entrar_em })
  }
  return { presentes, votaram, tentando }
}

// Marca/desmarca um proprietário como presente (a "chamada" da mesa). Marcar
// cria o send se preciso (com token, pra pessoa conseguir votar pelo link) e
// grava presente_em; desmarcar limpa presente_em — nunca de quem já votou.
export async function marcarPresenca(
  assembleiaId: string,
  proprietarioId: string,
  presente: boolean
): Promise<void> {
  const db = createServerClient()

  const { data: existente, error } = await db
    .from("assembleia_sends")
    .select("id, presente_em, votado_em")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", proprietarioId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (presente) {
    // Não marca presente quem outorgou procuração: a presença dele é
    // representada pelo procurador (regra validada com o Carlos). Marcar
    // contaria o imóvel 2x (aqui e no voto do procurador). Desmarcar (abaixo)
    // continua livre — inclusive pra tirar da lista quem delegou depois.
    if (await outorgouProcuracao(assembleiaId, proprietarioId)) {
      throw new Error(
        "Este proprietário outorgou procuração nesta assembleia — a presença é representada pelo procurador."
      )
    }
    const agora = new Date().toISOString()
    if (existente) {
      if (!existente.presente_em) {
        // Marca presente e zera a "tentativa de entrada" (já foi confirmado,
        // some o alerta da Chamada).
        const { error: upErr } = await db
          .from("assembleia_sends")
          .update({ presente_em: agora, tentou_entrar_em: null })
          .eq("id", existente.id)
        if (upErr) throw new Error(upErr.message)
      }
    } else {
      const { error: insErr } = await db.from("assembleia_sends").insert({
        assembleia_id: assembleiaId,
        proprietario_id: proprietarioId,
        token: generateSurveyToken(),
        status: "pending",
        presente_em: agora,
      })
      if (insErr) throw new Error(insErr.message)
    }
    return
  }

  // Desmarcar presença — não dá pra "despresentar" quem já votou.
  if (existente) {
    if (existente.votado_em) {
      throw new Error("Este proprietário já votou e não pode sair da lista de presença.")
    }
    const { error: upErr } = await db
      .from("assembleia_sends")
      .update({ presente_em: null })
      .eq("id", existente.id)
    if (upErr) throw new Error(upErr.message)
  }
}

// Anota (ou limpa) o NOME de quem realmente participou pelo imóvel quando não é
// o dono do cadastro (ex.: cadastro no marido, quem veio foi a esposa — também
// dona; diferente de procuração). Fica no send desta assembleia e sai no
// boletim/ata. Cria o send se ainda não existir; nome vazio → null (limpa).
export async function setParticipanteNome(
  assembleiaId: string,
  proprietarioId: string,
  nome: string | null
): Promise<void> {
  const db = createServerClient()
  const valor = nome?.trim() || null

  const { data: existente, error } = await db
    .from("assembleia_sends")
    .select("id")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", proprietarioId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (existente) {
    const { error: upErr } = await db
      .from("assembleia_sends")
      .update({ participante_nome: valor })
      .eq("id", existente.id)
    if (upErr) throw new Error(upErr.message)
  } else {
    const { error: insErr } = await db.from("assembleia_sends").insert({
      assembleia_id: assembleiaId,
      proprietario_id: proprietarioId,
      token: generateSurveyToken(),
      status: "pending",
      participante_nome: valor,
    })
    if (insErr) throw new Error(insErr.message)
  }
}

// proprietario_id → nome do participante (co-dono presente), pra semear a lista
// de gestão. Resiliente: se a coluna não existir (migração pendente) ou houver
// erro, devolve vazio sem quebrar a tela.
export async function getParticipantesNaAberta(
  assembleiaId: string
): Promise<Map<string, string>> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select("proprietario_id, participante_nome")
    .eq("assembleia_id", assembleiaId)
    .not("participante_nome", "is", null)
  if (error) {
    console.warn("[getParticipantesNaAberta] consulta falhou, devolvendo vazio:", error.message)
    return new Map()
  }
  const map = new Map<string, string>()
  for (const r of (data ?? []) as { proprietario_id: string; participante_nome: string | null }[]) {
    if (r.participante_nome) map.set(r.proprietario_id, r.participante_nome)
  }
  return map
}

// Liga/desliga "exigir presença confirmada pela mesa" numa assembleia.
export async function setExigePresenca(assembleiaId: string, value: boolean): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from("assembleias")
    .update({ exige_presenca: value })
    .eq("id", assembleiaId)
  if (error) throw new Error(error.message)
}

// Lê só a flag exige_presenca de uma assembleia — pra a página de entrada
// avisar o morador, de antemão, que precisa estar na lista de presença da mesa.
export async function getExigePresenca(assembleiaId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleias")
    .select("exige_presenca")
    .eq("id", assembleiaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.exige_presenca ?? false
}
