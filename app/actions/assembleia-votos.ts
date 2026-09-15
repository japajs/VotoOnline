"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getProprietarioById } from "@/services/proprietarios"
import { getPesoParticipante } from "@/lib/peso"
import {
  upsertAssembleiaSend,
  updateAssembleiaSendStatus,
  createAssembleiaRespostas,
  getSendsJaVotaram,
  getSendsNaoVotaram,
  getProprietariosSemVoto,
  type RespostaInput,
  type ProprietarioSemVoto,
} from "@/services/assembleia-votos"
import { sendAssembleiaEmailBatch, sendNovaPautaEmailBatch, sendLembreteVotoEmailBatch } from "@/services/email"
import { generateSurveyToken } from "@/lib/tokens"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limit"
import { isVotacaoAberta } from "@/lib/assembleia-status"

export interface EnviarAssembleiaResult {
  sent: number
  failed: number
  error?: string
}

// Item 5: PDF opcional anexado ao disparo (edital/orçamento/memorial
// descritivo/convocação). Vai em Base64 porque Server Actions só aceitam
// argumentos serializáveis — o corpo decodificado é validado abaixo antes de
// seguir para o envio de e-mail.
export interface AnexoDisparo {
  filename: string
  contentBase64: string
}

const ANEXO_TAMANHO_MAXIMO = 8 * 1024 * 1024 // 8MB

function validarAnexoPdf(anexo: AnexoDisparo): { buffer: Buffer; filename: string } | { error: string } {
  if (!anexo.filename.toLowerCase().endsWith(".pdf")) {
    return { error: "O anexo precisa ser um arquivo PDF." }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(anexo.contentBase64, "base64")
  } catch {
    return { error: "Não foi possível ler o arquivo anexado." }
  }

  if (buffer.length === 0) {
    return { error: "O arquivo anexado está vazio." }
  }
  if (buffer.length > ANEXO_TAMANHO_MAXIMO) {
    return { error: "O PDF anexado excede o limite de 8MB." }
  }
  // Confere a assinatura do PDF ("%PDF-") independente da extensão do
  // arquivo — defesa extra caso um arquivo renomeado chegue até aqui.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { error: "O arquivo anexado não é um PDF válido." }
  }

  return { buffer, filename: anexo.filename }
}

export async function enviarAssembleiaAction(
  assembleiaId: string,
  proprietarioIds: string[],
  anexo?: AnexoDisparo
): Promise<EnviarAssembleiaResult> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { sent: 0, failed: 0, error: auth.error }
  if (!assembleiaId || proprietarioIds.length === 0) {
    return { sent: 0, failed: 0, error: "Selecione pelo menos um proprietário." }
  }

  let anexoValidado: { buffer: Buffer; filename: string } | undefined
  if (anexo) {
    const resultado = validarAnexoPdf(anexo)
    if ("error" in resultado) return { sent: 0, failed: 0, error: resultado.error }
    anexoValidado = resultado
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  let assembleia
  try {
    assembleia = await getAssembleiaById(assembleiaId)
    if (!assembleia) return { sent: 0, failed: 0, error: "Assembleia não encontrada." }
  } catch (err) {
    return {
      sent: 0,
      failed: 0,
      error: err instanceof Error ? err.message : "Erro ao buscar assembleia.",
    }
  }

  const acesso = await requireAcessoCondominio(assembleia.condominio_id)
  if (!acesso.ok) return { sent: 0, failed: 0, error: acesso.error }

  const pautas = (assembleia.pautas ?? []).map((p) => ({ titulo: p.titulo }))

  // Achado de usabilidade: o e-mail de convite não dizia por qual(is)
  // unidade(s) a pessoa está votando nem qual o peso do voto dela — quem
  // recebia não tinha como conferir se o cadastro está certo antes de
  // votar (e, como vimos hoje com unidades mal vinculadas na importação,
  // essa conferência é justamente o que ajudaria a pegar um erro cedo).
  // criterio_peso é do condomínio inteiro, não muda por proprietário — busca
  // uma vez só, fora do loop por destinatário.
  const condominio = await getCondominioById(assembleia.condominio_id).catch(() => null)
  const criterioPeso = condominio?.criterio_peso ?? "unidade"

  const emailInputs: Parameters<typeof sendAssembleiaEmailBatch>[0] = []
  const failedIds: string[] = []

  await Promise.all(
    proprietarioIds.map(async (proprietarioId) => {
      try {
        const proprietario = await getProprietarioById(proprietarioId)
        if (!proprietario || !proprietario.email) { failedIds.push(proprietarioId); return }

        const token = generateSurveyToken()
        const send = await upsertAssembleiaSend({
          assembleia_id: assembleiaId,
          proprietario_id: proprietarioId,
          token,
        })

        const unidades = proprietario.unidades ?? []
        emailInputs.push({
          sendId: send.id,
          to: proprietario.email,
          proprietarioNome: proprietario.nome,
          assembleiaTitulo: assembleia!.titulo,
          assembleiaDescricao: assembleia!.descricao,
          pautas,
          votoUrl: `${appUrl}${ROUTES.publicCondoVoto(token)}`,
          unidades: unidades.map((u) => ({ numero: u.numero, bloco: u.bloco })),
          peso: getPesoParticipante({ unidades }, criterioPeso),
          criterioPeso,
        })
      } catch {
        failedIds.push(proprietarioId)
      }
    })
  )

  if (emailInputs.length === 0) {
    return {
      sent: 0,
      failed: failedIds.length,
      error: "Não foi possível preparar nenhum envio.",
    }
  }

  const now = new Date().toISOString()
  const { sent: sentIds, failed: failedEmailIds } = await sendAssembleiaEmailBatch(
    emailInputs,
    anexoValidado ? { filename: anexoValidado.filename, content: anexoValidado.buffer } : undefined
  )

  await Promise.all([
    ...sentIds.map((id) => updateAssembleiaSendStatus(id, "sent", now)),
    ...failedEmailIds.map((id) => updateAssembleiaSendStatus(id, "failed")),
  ])

  revalidatePath(ROUTES.dashboard)

  return {
    sent: sentIds.length,
    failed: failedEmailIds.length + failedIds.length,
  }
}

export interface NotificarNovaPautaResult {
  success: boolean
  sent: number
  failed: number
  error?: string
}

// Item 5: avisa quem já votou (parcial ou totalmente) sobre uma pauta nova
// adicionada depois — chamada só após confirmação explícita na tela (ver
// AdicionarPautaDialog). Reaproveita o token já existente de cada send, sem
// rotacionar: o mesmo link volta a funcionar e passa a mostrar a pauta
// pendente automaticamente (app/v/[token]/page.tsx).
export async function notificarNovaPautaAction(
  assembleiaId: string,
  pautaId: string
): Promise<NotificarNovaPautaResult> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, sent: 0, failed: 0, error: auth.error }

  try {
    const assembleia = await getAssembleiaById(assembleiaId)
    if (!assembleia) return { success: false, sent: 0, failed: 0, error: "Assembleia não encontrada." }

    const acesso = await requireAcessoCondominio(assembleia.condominio_id)
    if (!acesso.ok) return { success: false, sent: 0, failed: 0, error: acesso.error }

    const pauta = (assembleia.pautas ?? []).find((p) => p.id === pautaId)
    if (!pauta) return { success: false, sent: 0, failed: 0, error: "Pauta não encontrada." }

    const sends = await getSendsJaVotaram(assembleiaId)
    const comEmail = sends.filter((s) => s.proprietarioEmail)
    if (comEmail.length === 0) return { success: true, sent: 0, failed: 0 }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const { sent, failed } = await sendNovaPautaEmailBatch(
      comEmail.map((s) => ({
        sendId: s.id,
        to: s.proprietarioEmail!,
        proprietarioNome: s.proprietarioNome,
        assembleiaTitulo: assembleia.titulo,
        pautaTitulo: pauta.titulo,
        votoUrl: `${appUrl}${ROUTES.publicCondoVoto(s.token)}`,
      }))
    )

    return {
      success: true,
      sent: sent.length,
      failed: failed.length + (sends.length - comEmail.length),
    }
  } catch (err) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: err instanceof Error ? err.message : "Erro ao notificar participantes.",
    }
  }
}

export interface NotificarNaoVotaramResult {
  success: boolean
  sent: number
  failed: number
  error?: string
}

// Auditoria de assembleias — Fase 6: lembrete manual pra quem ainda não
// registrou nenhum voto — disparado pelo síndico clicando um botão na tela
// da assembleia (não existe cron/agendamento neste projeto). Reaproveita o
// token já existente de cada send, sem rotacionar.
export async function notificarNaoVotaramAction(
  assembleiaId: string
): Promise<NotificarNaoVotaramResult> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, sent: 0, failed: 0, error: auth.error }

  try {
    const assembleia = await getAssembleiaById(assembleiaId)
    if (!assembleia) return { success: false, sent: 0, failed: 0, error: "Assembleia não encontrada." }

    const acesso = await requireAcessoCondominio(assembleia.condominio_id)
    if (!acesso.ok) return { success: false, sent: 0, failed: 0, error: acesso.error }

    if (!isVotacaoAberta(assembleia.status)) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        error: "Só é possível notificar enquanto a assembleia estiver aberta.",
      }
    }

    const sends = await getSendsNaoVotaram(assembleiaId)
    const comEmail = sends.filter((s) => s.proprietarioEmail)
    if (comEmail.length === 0) return { success: true, sent: 0, failed: 0 }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const condominio = await getCondominioById(assembleia.condominio_id).catch(() => null)
    const criterioPeso = condominio?.criterio_peso ?? "unidade"

    const { sent, failed } = await sendLembreteVotoEmailBatch(
      comEmail.map((s) => ({
        sendId: s.id,
        to: s.proprietarioEmail!,
        proprietarioNome: s.proprietarioNome,
        assembleiaTitulo: assembleia.titulo,
        dataEncerramento: assembleia.data_encerramento,
        votoUrl: `${appUrl}${ROUTES.publicCondoVoto(s.token)}`,
        unidades: s.unidades,
        peso: getPesoParticipante({ unidades: s.unidades }, criterioPeso),
        criterioPeso,
      }))
    )

    return {
      success: true,
      sent: sent.length,
      failed: failed.length + (sends.length - comEmail.length),
    }
  } catch (err) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      error: err instanceof Error ? err.message : "Erro ao notificar participantes.",
    }
  }
}

export async function registrarVotosAction(
  sendId: string,
  respostas: RespostaInput[]
): Promise<{ success: boolean; error?: string }> {
  if (!sendId || respostas.length === 0) {
    return { success: false, error: "Dados inválidos." }
  }

  // Cada pauta deve ter exatamente uma resposta fixa (Sim/Não/Abstenção) OU
  // uma opção escolhida — nunca as duas, nunca nenhuma. Mesma regra que a
  // constraint XOR do banco garante, mas com uma mensagem amigável aqui.
  const invalida = respostas.some((r) => Boolean(r.resposta) === Boolean(r.opcao_id))
  if (invalida) {
    return { success: false, error: "Dados de voto inválidos." }
  }

  try {
    // Melhor esforço: IP/user-agent viram parte do snapshot histórico do
    // voto (Etapa 3), mas nunca bloqueiam o registro do voto se faltarem.
    const h = await headers()
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const userAgent = h.get("user-agent") ?? null

    // Achado de auditoria LGPD: o envio de voto em si não tinha nenhum
    // limite de tentativas (só a página de leitura do token agora tem).
    if (!(await checkRateLimit(`voto-submit:${ip ?? "unknown"}`))) {
      return { success: false, error: "Muitas tentativas. Aguarde um momento e tente novamente." }
    }

    await createAssembleiaRespostas(sendId, respostas, { ip, userAgent })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao registrar votos."
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      return { success: false, error: "Você já votou nesta assembleia." }
    }
    return { success: false, error: msg }
  }
}

// Auditoria de assembleias — Fase 7: quem não tem e-mail cadastrado nunca
// recebe link de voto (achado da auditoria) — sem fallback, ficava
// permanentemente excluído da votação eletrônica. Lista todo proprietário
// do condomínio que ainda não votou nesta assembleia, com ou sem e-mail,
// pra alimentar o dialog de registro manual (voto presencial/por
// procuração em papel, lançado pelo síndico).
export async function getProprietariosSemVotoAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; proprietarios: ProprietarioSemVoto[]; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, proprietarios: [], error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, proprietarios: [], error: acesso.error }

  try {
    const proprietarios = await getProprietariosSemVoto(condominioId, assembleiaId)
    return { success: true, proprietarios }
  } catch (err) {
    return {
      success: false,
      proprietarios: [],
      error: err instanceof Error ? err.message : "Erro ao buscar proprietários.",
    }
  }
}

// Cria (ou reaproveita, se já existir) o `send` de um proprietário nesta
// assembleia, sem enviar nenhum e-mail — é só o "assento" que
// registrarVotoManualAction depois usa pra gravar as respostas. O token
// gerado nunca é comunicado a ninguém (o proprietário não vota sozinho
// aqui, o síndico lança em nome dele).
export async function iniciarVotoManualAction(
  assembleiaId: string,
  condominioId: string,
  proprietarioId: string
): Promise<{ success: boolean; sendId?: string; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    const assembleia = await getAssembleiaById(assembleiaId)
    if (!assembleia) return { success: false, error: "Assembleia não encontrada." }
    if (!isVotacaoAberta(assembleia.status)) {
      return { success: false, error: "Só é possível registrar votos enquanto a assembleia estiver aberta." }
    }

    const proprietario = await getProprietarioById(proprietarioId)
    if (!proprietario || proprietario.condominio_id !== condominioId) {
      return { success: false, error: "Proprietário não encontrado neste condomínio." }
    }
    if (proprietario.inadimplente) {
      return { success: false, error: "Proprietário inadimplente não pode votar." }
    }

    const send = await upsertAssembleiaSend({
      assembleia_id: assembleiaId,
      proprietario_id: proprietarioId,
      token: generateSurveyToken(),
    })
    return { success: true, sendId: send.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao iniciar registro." }
  }
}

// Versão administrativa de registrarVotosAction — mesma lógica de
// integridade (createAssembleiaRespostas), mas exige perfil autorizado e
// acesso ao condomínio (a versão pública não checa isso, de propósito: o
// token já é a prova de identidade lá). Marca no snapshot que este voto
// foi lançado manualmente por um administrador, e por quem — nunca deixa
// esse registro se passar por um voto "self-service" comum na auditoria.
export async function registrarVotoManualAction(
  sendId: string,
  assembleiaId: string,
  condominioId: string,
  respostas: RespostaInput[]
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  if (!sendId || respostas.length === 0) {
    return { success: false, error: "Dados inválidos." }
  }
  const invalida = respostas.some((r) => Boolean(r.resposta) === Boolean(r.opcao_id))
  if (invalida) {
    return { success: false, error: "Dados de voto inválidos." }
  }

  try {
    await createAssembleiaRespostas(sendId, respostas, {
      ip: null,
      userAgent: `Registrado manualmente por ${auth.session.nome} <${auth.session.email}>`,
    })
    revalidatePath(ROUTES.condominioAssembleia(condominioId, assembleiaId))
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao registrar votos."
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      return { success: false, error: "Este proprietário já votou nesta assembleia." }
    }
    return { success: false, error: msg }
  }
}
