"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  registrarPresenca,
  getPresencaAssembleia,
  getChamada,
  getProprietariosTentandoEntrar,
  getStatusPresencaLive,
  marcarPresenca,
  setParticipanteNome,
  setExigePresenca,
  type PresenteItem,
  type ChamadaData,
} from "@/services/presenca"
import { getPautasVotadasPorProprietario } from "@/services/assembleia-votos"
import { getProcuracoesByAssembleia } from "@/services/procuracoes"
import { getAssembleiaById } from "@/services/assembleias"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit"
import { normalizarChaveUnidade } from "@/lib/unidade-format"
import { ROUTES } from "@/lib/constants"

export type EntrarState = {
  error?: string
  // Identidade confere, mas a mesa ainda não confirmou presença: o form fica
  // "aguardando" e entra sozinho quando confirmarem (polling com estes dados).
  aguardando?: boolean
  numero?: string
  bloco?: string | null
  cpf?: string
} | null

// Ação do link público de entrada (Opção A). Recebe o assembleiaId via bind
// (não por campo do formulário). Em caso de sucesso, redireciona pro /v/[token]
// de sempre — reaproveitando todo o fluxo/telas de voto já existentes.
export async function entrarAssembleiaAction(
  assembleiaId: string,
  _prev: EntrarState,
  formData: FormData
): Promise<EntrarState> {
  const numero = String(formData.get("numero") ?? "").trim()
  const bloco = String(formData.get("bloco") ?? "").trim() || null
  const cpf = String(formData.get("cpf") ?? "").trim()

  // Rota pública: limita tentativas pra não virar oráculo de força-bruta de
  // CPF (a mensagem de erro já é uniforme no serviço). Conta por IP + UNIDADE,
  // não só por IP: numa assembleia presencial todo mundo sai pelo mesmo IP
  // (wi-fi do salão), então limitar por IP sozinho bloquearia condôminos de
  // verdade. Por unidade, o brute-force de CPF de UMA unidade continua travado,
  // mas dezenas de unidades diferentes entram sem problema do mesmo IP.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const chaveUnidade = normalizarChaveUnidade({ numero, bloco })
  if (!(await checkRateLimit(rateLimitKey.entrada(ip, chaveUnidade)))) {
    return { error: "Muitas tentativas. Aguarde um momento e tente novamente." }
  }

  if (!numero || !cpf) return { error: "Preencha a sua unidade e o CPF." }

  const result = await registrarPresenca(assembleiaId, { numero, bloco, cpf })
  if (!result.ok) {
    // Identidade confere mas falta a mesa confirmar → devolve "aguardando" +
    // os dados pra o form pollar e entrar sozinho quando confirmarem. Erro de
    // identidade (CPF/unidade) volta como erro normal.
    if (result.aguardando) return { aguardando: true, numero, bloco, cpf, error: result.error }
    return { error: result.error }
  }

  // redirect() lança NEXT_REDIRECT — fica fora de qualquer try/catch de propósito.
  redirect(ROUTES.publicCondoVoto(result.token))
}

// Polling do form de entrada enquanto a mesa não confirma a presença: re-checa
// identidade + presença e, quando a mesa confirmar, devolve o token (o cliente
// redireciona pro /v/[token] sem re-digitar). Mesmo rate limit por IP+unidade
// (intervalo ~7s no cliente fica bem abaixo do teto).
export async function verificarEntradaAction(
  assembleiaId: string,
  numero: string,
  bloco: string | null,
  cpf: string
): Promise<{ ok: boolean; token?: string; aguardando?: boolean; error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const chaveUnidade = normalizarChaveUnidade({ numero, bloco })
  if (!(await checkRateLimit(rateLimitKey.entrada(ip, chaveUnidade)))) {
    return { ok: false, error: "Muitas tentativas. Aguarde um momento." }
  }
  if (!numero || !cpf) return { ok: false, error: "Dados incompletos." }

  const result = await registrarPresenca(assembleiaId, { numero, bloco, cpf })
  if (result.ok) return { ok: true, token: result.token }
  return { ok: false, aguardando: result.aguardando ?? false, error: result.error }
}

// Lista de presença pro admin (read-only). Visualizador também pode ver (é só
// leitura, como a apuração); o envio de lembrete é que exige admin/operador
// (ver notificarNaoVotaramAction).
export async function getPresencaAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; presentes: PresenteItem[]; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador", "visualizador"])
  if (!auth.ok) return { success: false, presentes: [], error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, presentes: [], error: acesso.error }

  try {
    const presentes = await getPresencaAssembleia(assembleiaId)
    return { success: true, presentes }
  } catch (err) {
    return {
      success: false,
      presentes: [],
      error: err instanceof Error ? err.message : "Erro ao carregar a lista de presença.",
    }
  }
}

// ── Chamada (presença controlada pela mesa) ───────────────────────────────────

export async function getChamadaAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; data?: ChamadaData; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    const data = await getChamada(assembleiaId)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao carregar a chamada." }
  }
}

// Alerta "tentando entrar" na tela geral de cadastro (polling leve, pedido do
// Carlos): quem abriu o link/QR e ainda não foi marcado presente. Falha devolve
// lista vazia (não atrapalha a gestão).
export async function getTentandoEntrarAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; tentando: { id: string; em: string }[] }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, tentando: [] }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, tentando: [] }
  try {
    const tentando = await getProprietariosTentandoEntrar(assembleiaId)
    return { success: true, tentando }
  } catch {
    return { success: false, tentando: [] }
  }
}

export type EstadoVotacaoLive = {
  success: boolean
  presentes: string[]
  votaram: string[]
  // Quantas pautas DISTINTAS cada proprietário respondeu — pares [id, nº] pra
  // serializar (o cliente remonta o Map). Distingue voto total de parcial.
  pautasVotadas: [string, number][]
  outorgantes: string[]
  // Denominador do voto total: nº de pautas em votação (todas, ou só as já
  // abertas pela mesa no modo pauta-por-pauta). Muda ao vivo nesse modo.
  totalPautasVotaveis: number
  tentando: { id: string; em: string }[]
}

const ESTADO_VOTACAO_VAZIO: EstadoVotacaoLive = {
  success: false,
  presentes: [],
  votaram: [],
  pautasVotadas: [],
  outorgantes: [],
  totalPautasVotaveis: 0,
  tentando: [],
}

// Estado de votação AO VIVO pra a tela de gestão sincronizar entre dispositivos
// (duas secretárias) — presença, quem votou, voto total vs parcial, procurações
// e "tentando entrar", tudo numa rodada. Visualizador também lê (read-only).
// IMPORTANTE: em QUALQUER falha devolve success:false SEM dados — o polling do
// cliente ignora (`if (!r.success) return`) e PRESERVA o estado atual, em vez de
// zerar presença/votos na tela por um soluço do banco.
export async function getEstadoVotacaoLiveAction(
  assembleiaId: string,
  condominioId: string
): Promise<EstadoVotacaoLive> {
  const auth = await requirePerfil(["administrador", "operador", "visualizador"])
  if (!auth.ok) return ESTADO_VOTACAO_VAZIO
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return ESTADO_VOTACAO_VAZIO
  try {
    const [status, pautasMap, procuracoes, assembleia] = await Promise.all([
      getStatusPresencaLive(assembleiaId),
      getPautasVotadasPorProprietario(assembleiaId),
      getProcuracoesByAssembleia(assembleiaId),
      getAssembleiaById(assembleiaId),
    ])
    // Mesmo cálculo da página (condominios/[id]): no modo pauta-por-pauta só
    // contam as pautas já abertas pela mesa; no normal, todas.
    const totalPautasVotaveis = assembleia
      ? assembleia.votacao_por_pauta
        ? (assembleia.pautas ?? []).filter((p) => p.votacao_aberta_em != null).length
        : (assembleia.pautas ?? []).length
      : 0
    return {
      success: true,
      presentes: status.presentes,
      votaram: status.votaram,
      pautasVotadas: [...pautasMap.entries()],
      outorgantes: procuracoes.map((p) => p.outorgante_id),
      totalPautasVotaveis,
      tentando: status.tentando,
    }
  } catch {
    return ESTADO_VOTACAO_VAZIO
  }
}

// Anota o nome de quem participou pelo imóvel (co-dono presente que não é o
// dono do cadastro). Sai no boletim/ata. Nome vazio limpa (pedido do Carlos).
export async function setParticipanteNomeAction(
  assembleiaId: string,
  condominioId: string,
  proprietarioId: string,
  nome: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await setParticipanteNome(assembleiaId, proprietarioId, nome)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar o participante." }
  }
}

export async function marcarPresencaAction(
  assembleiaId: string,
  condominioId: string,
  proprietarioId: string,
  presente: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await marcarPresenca(assembleiaId, proprietarioId, presente)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao marcar presença." }
  }
}

export async function setExigePresencaAction(
  assembleiaId: string,
  condominioId: string,
  value: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await setExigePresenca(assembleiaId, value)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao atualizar a opção." }
  }
}
