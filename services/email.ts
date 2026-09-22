import { Resend } from "resend"
import { APP_NAME } from "@/lib/constants"
import type { CriterioPeso } from "@/types"

// Achado de auditoria LGPD: nome do proprietário, título/descrição da
// assembleia e título da pauta vêm de campos de texto livre preenchidos por
// um admin e eram interpolados direto no HTML do e-mail, sem escape — quem
// recebesse um e-mail com um desses campos contendo marcação HTML veria essa
// marcação renderizada de verdade na caixa de entrada (injeção de conteúdo/
// phishing dentro de um e-mail legítimo do sistema).
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("RESEND_API_KEY não está configurado.")
  return new Resend(key)
}

function getFromEmail(): string {
  const from = process.env.RESEND_FROM_EMAIL
  if (!from) throw new Error("RESEND_FROM_EMAIL não está configurado.")
  return from
}

// ─── Send functions ───────────────────────────────────────────────────────────

export interface EmailBatchResult {
  sent: string[]   // sendIds that succeeded
  failed: string[] // sendIds that failed
}

// ─── Assembleia email template ────────────────────────────────────────────────

interface AssembleiaTemplateInput {
  proprietarioNome: string
  assembleiaTitulo: string
  assembleiaDescricao: string | null
  pautas: { titulo: string }[]
  votoUrl: string
  unidades: { numero: string; bloco: string | null }[]
  peso: number
  criterioPeso: CriterioPeso
}

// Formata "A102, B104, C401" — mesma convenção de exibição usada em toda a
// aplicação (bloco-número quando há bloco, só o número quando não há).
function formatUnidadeEmail(u: { numero: string; bloco: string | null }): string {
  return u.bloco ? `${u.bloco}-${u.numero}` : u.numero
}

// Achado de usabilidade: nenhum e-mail dizia por qual(is) unidade(s) a
// pessoa está votando nem qual o peso do voto — mostrar aqui ajuda a
// pessoa a conferir o próprio cadastro antes de votar (pega cedo um erro
// de unidade mal vinculada, por exemplo). Compartilhado entre o convite e
// o lembrete — mesmo texto, pra não divergir entre os dois e-mails.
function buildPesoUnidadesBloco(
  unidades: { numero: string; bloco: string | null }[],
  peso: number,
  criterioPeso: CriterioPeso
): string {
  if (unidades.length === 0) return ""
  const pesoTexto =
    criterioPeso === "fracao_ideal"
      ? `${(peso * 100).toFixed(4)}%`
      : `${peso} ${peso === 1 ? "voto" : "votos"}`
  const unidadesTexto = unidades.map(formatUnidadeEmail).map(escapeHtml).join(", ")
  return `<p style="font-size:13px;color:#6b7280;margin:0 0 24px;line-height:1.6;">
            Seu peso de voto: <strong style="color:#111827;">${pesoTexto}</strong>
            &nbsp;·&nbsp; Unidade${unidades.length === 1 ? "" : "s"} vinculada${unidades.length === 1 ? "" : "s"} ao seu cadastro:
            <strong style="color:#111827;">${unidadesTexto}</strong>
          </p>`
}

function buildAssembleiaEmailHtml({
  proprietarioNome,
  assembleiaTitulo,
  assembleiaDescricao,
  pautas,
  votoUrl,
  unidades,
  peso,
  criterioPeso,
  temAnexo,
}: AssembleiaTemplateInput & { temAnexo: boolean }): string {
  const accent = "#6366f1"
  proprietarioNome = escapeHtml(proprietarioNome)
  assembleiaTitulo = escapeHtml(assembleiaTitulo)
  const description = assembleiaDescricao
    ? `<p style="font-size:15px;color:#6b7280;margin:0 0 20px;line-height:1.6;">${escapeHtml(assembleiaDescricao)}</p>`
    : ""
  const anexoAviso = temAnexo
    ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 0;line-height:1.5;">📎 Este e-mail inclui um documento em anexo.</p>`
    : ""
  const pautasList = pautas
    .map(
      (p, i) =>
        `<li style="font-size:14px;color:#374151;padding:4px 0;line-height:1.5;">${i + 1}. ${escapeHtml(p.titulo)}</li>`
    )
    .join("")

  const pesoBloco = buildPesoUnidadesBloco(unidades, peso, criterioPeso)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${assembleiaTitulo}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:${accent};padding:24px 32px;">
              <p style="margin:0;font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.01em;">
                ${APP_NAME}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">
                Olá, ${proprietarioNome}!
              </h1>
              <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
                Você foi convidado(a) a participar da assembleia
                <strong>&ldquo;${assembleiaTitulo}&rdquo;</strong>.
              </p>
              ${description}
              ${pesoBloco}
              <p style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
                Pautas
              </p>
              <ul style="margin:0 0 28px;padding-left:0;list-style:none;">
                ${pautasList}
              </ul>
              <a href="${votoUrl}"
                 style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;
                        font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;
                        letter-spacing:-0.01em;">
                Votar agora →
              </a>
              ${anexoAviso}
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5;">
                Se o botão não funcionar, acesse:<br/>
                <a href="${votoUrl}" style="color:${accent};word-break:break-all;">${votoUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;">
              <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5;">
                Este e-mail foi enviado por <strong>${APP_NAME}</strong>.
                Se você não esperava recebê-lo, pode ignorar esta mensagem com segurança.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Item 5 do pedido de evolução do fluxo: quando uma pauta nova é adicionada
// a uma assembleia já aberta, quem já votou recebe este e-mail (não o de
// convite normal) — mesmo link de sempre, que agora mostra só a(s) pauta(s)
// pendente(s) (ver app/v/[token]/page.tsx). Reaproveita o mesmo estilo
// visual do e-mail de convite.
interface NovaPautaTemplateInput {
  proprietarioNome: string
  assembleiaTitulo: string
  pautaTitulo: string
  votoUrl: string
}

function buildNovaPautaEmailHtml({
  proprietarioNome,
  assembleiaTitulo,
  pautaTitulo,
  votoUrl,
}: NovaPautaTemplateInput): string {
  const accent = "#6366f1"
  proprietarioNome = escapeHtml(proprietarioNome)
  assembleiaTitulo = escapeHtml(assembleiaTitulo)
  pautaTitulo = escapeHtml(pautaTitulo)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${assembleiaTitulo}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="background:${accent};padding:24px 32px;">
              <p style="margin:0;font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.01em;">
                ${APP_NAME}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">
                Olá, ${proprietarioNome}!
              </h1>
              <p style="font-size:15px;color:#374151;margin:0 0 12px;line-height:1.6;">
                Uma nova pauta foi incluída na assembleia
                <strong>&ldquo;${assembleiaTitulo}&rdquo;</strong>, na qual você já votou:
              </p>
              <p style="font-size:15px;color:#111827;font-weight:600;margin:0 0 24px;line-height:1.5;">
                ${pautaTitulo}
              </p>
              <p style="font-size:13px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
                Seus votos já registrados continuam válidos — basta responder a pauta nova.
              </p>
              <a href="${votoUrl}"
                 style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;
                        font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;
                        letter-spacing:-0.01em;">
                Responder nova pauta →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5;">
                Se o botão não funcionar, acesse:<br/>
                <a href="${votoUrl}" style="color:${accent};word-break:break-all;">${votoUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;">
              <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5;">
                Este e-mail foi enviado por <strong>${APP_NAME}</strong>.
                Se você não esperava recebê-lo, pode ignorar esta mensagem com segurança.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface NovaPautaEmailInput {
  sendId: string
  to: string
  proprietarioNome: string
  assembleiaTitulo: string
  pautaTitulo: string
  votoUrl: string
}

export async function sendNovaPautaEmailBatch(
  emails: NovaPautaEmailInput[]
): Promise<EmailBatchResult> {
  const resend = getResend()
  const from = getFromEmail()
  const sent: string[] = []
  const failed: string[] = []

  const CHUNK = 100
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK)
    try {
      const batch = chunk.map((e) => ({
        from,
        to: e.to,
        subject: `Nova pauta: ${e.assembleiaTitulo}`,
        html: buildNovaPautaEmailHtml({
          proprietarioNome: e.proprietarioNome,
          assembleiaTitulo: e.assembleiaTitulo,
          pautaTitulo: e.pautaTitulo,
          votoUrl: e.votoUrl,
        }),
      }))
      // Achado de auditoria: resend.batch.send nunca rejeita em falha de
      // API, só resolve com { error } — sem checar isso, um lote recusado
      // era registrado como enviado.
      const { error } = await resend.batch.send(batch)
      if (error) chunk.forEach((e) => failed.push(e.sendId))
      else chunk.forEach((e) => sent.push(e.sendId))
    } catch {
      chunk.forEach((e) => failed.push(e.sendId))
    }
  }

  return { sent, failed }
}

// Auditoria de assembleias — Fase 6: lembrete manual pra quem ainda não
// registrou nenhum voto na assembleia — disparado pelo síndico clicando um
// botão na tela (não existe cron/agendamento neste projeto, ver
// lib/rate-limit.ts pro mesmo padrão de "sem infraestrutura de fundo").
// Reaproveita o mesmo estilo visual dos outros e-mails do sistema.
interface LembreteVotoTemplateInput {
  proprietarioNome: string
  assembleiaTitulo: string
  dataEncerramento: string | null
  votoUrl: string
  unidades: { numero: string; bloco: string | null }[]
  peso: number
  criterioPeso: CriterioPeso
}

function buildLembreteVotoEmailHtml({
  proprietarioNome,
  assembleiaTitulo,
  dataEncerramento,
  votoUrl,
  unidades,
  peso,
  criterioPeso,
}: LembreteVotoTemplateInput): string {
  const accent = "#16233F"
  proprietarioNome = escapeHtml(proprietarioNome)
  assembleiaTitulo = escapeHtml(assembleiaTitulo)
  const prazoTexto = dataEncerramento
    ? `O prazo para votar encerra em <strong>${new Date(dataEncerramento).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>.`
    : "A votação continua aberta."
  const pesoBloco = buildPesoUnidadesBloco(unidades, peso, criterioPeso)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${assembleiaTitulo}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="background:${accent};padding:24px 32px;">
              <p style="margin:0;font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.01em;">
                ${APP_NAME}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;line-height:1.3;">
                Olá, ${proprietarioNome}!
              </h1>
              <p style="font-size:15px;color:#374151;margin:0 0 12px;line-height:1.6;">
                Você ainda não registrou seu voto na assembleia
                <strong>&ldquo;${assembleiaTitulo}&rdquo;</strong>.
              </p>
              <p style="font-size:13px;color:#6b7280;margin:0 0 20px;line-height:1.5;">
                ${prazoTexto}
              </p>
              ${pesoBloco}
              <a href="${votoUrl}"
                 style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;
                        font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;
                        letter-spacing:-0.01em;">
                Votar agora →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5;">
                Se o botão não funcionar, acesse:<br/>
                <a href="${votoUrl}" style="color:${accent};word-break:break-all;">${votoUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;">
              <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.5;">
                Este e-mail foi enviado por <strong>${APP_NAME}</strong>.
                Se você não esperava recebê-lo, pode ignorar esta mensagem com segurança.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface LembreteVotoEmailInput {
  sendId: string
  to: string
  proprietarioNome: string
  assembleiaTitulo: string
  dataEncerramento: string | null
  votoUrl: string
  unidades: { numero: string; bloco: string | null }[]
  peso: number
  criterioPeso: CriterioPeso
}

export async function sendLembreteVotoEmailBatch(
  emails: LembreteVotoEmailInput[]
): Promise<EmailBatchResult> {
  const resend = getResend()
  const from = getFromEmail()
  const sent: string[] = []
  const failed: string[] = []

  const CHUNK = 100
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK)
    try {
      const batch = chunk.map((e) => ({
        from,
        to: e.to,
        subject: `Lembrete: vote na assembleia "${e.assembleiaTitulo}"`,
        html: buildLembreteVotoEmailHtml({
          proprietarioNome: e.proprietarioNome,
          assembleiaTitulo: e.assembleiaTitulo,
          dataEncerramento: e.dataEncerramento,
          votoUrl: e.votoUrl,
          unidades: e.unidades,
          peso: e.peso,
          criterioPeso: e.criterioPeso,
        }),
      }))
      // Achado de auditoria: resend.batch.send nunca rejeita em falha de
      // API, só resolve com { error } — sem checar isso, um lote recusado
      // era registrado como enviado.
      const { error } = await resend.batch.send(batch)
      if (error) chunk.forEach((e) => failed.push(e.sendId))
      else chunk.forEach((e) => sent.push(e.sendId))
    } catch {
      chunk.forEach((e) => failed.push(e.sendId))
    }
  }

  return { sent, failed }
}

export interface AssembleiaEmailInput {
  sendId: string
  to: string
  proprietarioNome: string
  assembleiaTitulo: string
  assembleiaDescricao: string | null
  pautas: { titulo: string }[]
  votoUrl: string
  unidades: { numero: string; bloco: string | null }[]
  peso: number
  criterioPeso: CriterioPeso
}

// Item 5: PDF opcional (edital, orçamento, memorial descritivo, convocação)
// anexado ao disparo — o mesmo arquivo é enviado para todos os destinatários
// do lote, junto com o link de votação de cada um.
export interface AssembleiaEmailAnexo {
  filename: string
  content: Buffer
}

// Sends emails in batches of 100 (Resend's batch limit).
//
// Achado: a API de batch send da Resend NÃO suporta anexos (limitação
// documentada — CreateBatchEmailOptions omite `attachments`) — o campo era
// aceito silenciosamente pelo TypeScript (checagem de excesso de
// propriedade não se aplica a um array construído via .map()) e descartado
// silenciosamente pela API, então todo disparo com PDF anexado (Item 5)
// nunca de fato entregava o anexo, sem erro nenhum. Quando há anexo, envia
// um e-mail por vez via `resend.emails.send` (que suporta attachments) em
// vez do batch; sem anexo, continua usando o batch por eficiência.
export async function sendAssembleiaEmailBatch(
  emails: AssembleiaEmailInput[],
  anexo?: AssembleiaEmailAnexo
): Promise<EmailBatchResult> {
  const resend = getResend()
  const from = getFromEmail()
  const sent: string[] = []
  const failed: string[] = []

  if (anexo) {
    for (const e of emails) {
      try {
        // Achado de auditoria: o SDK da Resend nunca REJEITA em falha de
        // API (endereço inválido, anexo grande demais, limite de taxa) —
        // ele sempre resolve com { data, error }. Sem checar `error` aqui,
        // todo envio era registrado como "sent" mesmo quando a Resend
        // recusou, e o síndico via "enviado" achando que o proprietário
        // tinha sido notificado da convocação sem isso ser verdade.
        const { error } = await resend.emails.send({
          from,
          to: e.to,
          subject: `Assembleia: ${e.assembleiaTitulo}`,
          html: buildAssembleiaEmailHtml({
            proprietarioNome: e.proprietarioNome,
            assembleiaTitulo: e.assembleiaTitulo,
            assembleiaDescricao: e.assembleiaDescricao,
            pautas: e.pautas,
            votoUrl: e.votoUrl,
            unidades: e.unidades,
            peso: e.peso,
            criterioPeso: e.criterioPeso,
            temAnexo: true,
          }),
          attachments: [{ filename: anexo.filename, content: anexo.content }],
        })
        if (error) failed.push(e.sendId)
        else sent.push(e.sendId)
      } catch {
        failed.push(e.sendId)
      }
    }
    return { sent, failed }
  }

  const CHUNK = 100
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK)

    try {
      const batch = chunk.map((e) => ({
        from,
        to: e.to,
        subject: `Assembleia: ${e.assembleiaTitulo}`,
        html: buildAssembleiaEmailHtml({
          proprietarioNome: e.proprietarioNome,
          assembleiaTitulo: e.assembleiaTitulo,
          assembleiaDescricao: e.assembleiaDescricao,
          pautas: e.pautas,
          votoUrl: e.votoUrl,
          unidades: e.unidades,
          peso: e.peso,
          criterioPeso: e.criterioPeso,
          temAnexo: false,
        }),
      }))

      const { error } = await resend.batch.send(batch)
      if (error) chunk.forEach((e) => failed.push(e.sendId))
      else chunk.forEach((e) => sent.push(e.sendId))
    } catch {
      chunk.forEach((e) => failed.push(e.sendId))
    }
  }

  return { sent, failed }
}

// ─── Alerta de segurança: senha alterada ───────────────────────────────────────

// Auditoria funcional: qualquer "administrador" pode redefinir a senha de
// qualquer outro usuário, inclusive de outro administrador, sem aviso nenhum
// pro dono da conta (ver redefinirSenhaUsuarioAction/updateSenhaAction) — e
// os dois administradores deste sistema legitimamente precisam poder fazer
// isso um pro outro. Este e-mail não impede a troca, só garante que quem tem
// a senha alterada saiba na hora, mesmo que não tenha sido ela mesma. Só
// dispara pra EMAIL_ALERTA_SENHA_ALTERADA (lib/constants.ts), por pedido
// explícito — não é uma notificação geral pra todo usuário.
export async function sendSenhaAlteradaEmail(email: string): Promise<void> {
  const resend = getResend()
  const from = getFromEmail()

  await resend.emails.send({
    from,
    to: email,
    subject: `[${APP_NAME}] Sua senha foi alterada`,
    html: `
      <p>A senha da sua conta no <strong>${APP_NAME}</strong> foi alterada agora.</p>
      <p>Se foi você, pode ignorar este e-mail. Se não foi, entre em contato imediatamente.</p>
    `,
  })
}

