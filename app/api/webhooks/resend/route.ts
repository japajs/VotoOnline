import { NextResponse } from "next/server"
import { Resend } from "resend"
import { marcarEventoEntregaResend } from "@/services/assembleia-votos"

// Webhook do Resend: prova de ENTREGA dos e-mails de disparo (pedido do Carlos).
// Recebe os eventos de entrega e atualiza o envio correspondente (casado pelo
// resend_id gravado no disparo). A autenticação é a ASSINATURA do webhook
// (Standard Webhooks / Svix) — sem sessão. Sem assinatura válida, recusa.
//
// Configuração (feita no painel, não no código): no Resend, criar um webhook
// apontando pra <APP_URL>/api/webhooks/resend com os eventos email.delivered,
// email.bounced, email.complained; e no Vercel definir RESEND_WEBHOOK_SECRET
// com o Signing Secret do webhook.

type ResendEvent = {
  type?: string
  created_at?: string
  data?: { email_id?: string; created_at?: string }
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    // Sem o secret configurado, não dá pra verificar — não processa (mas não
    // estoura: responde 500 pra o Resend tentar de novo quando configurarem).
    return new NextResponse("webhook secret não configurado", { status: 500 })
  }

  // IMPORTANTE: verificar contra o corpo CRU (sem reparsear) — parsear e
  // re-serializar quebra a assinatura.
  const payload = await req.text()
  const headers = {
    id: req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? "",
    timestamp: req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp") ?? "",
    signature: req.headers.get("svix-signature") ?? req.headers.get("webhook-signature") ?? "",
  }

  let event: ResendEvent
  try {
    // verify() não usa a API key — só o webhookSecret. Lança se a assinatura
    // for inválida (ou o timestamp fora da janela de replay).
    event = new Resend(process.env.RESEND_API_KEY ?? "re_placeholder").webhooks.verify({
      payload,
      webhookSecret: secret,
      headers,
    }) as ResendEvent
  } catch {
    return new NextResponse("assinatura inválida", { status: 400 })
  }

  const emailId = event.data?.email_id
  const em = event.created_at ?? new Date().toISOString()

  // Só os eventos de ENTREGA interessam; os demais (sent, delivery_delayed,
  // opened, clicked…) são ignorados de propósito. marcarEventoEntregaResend é
  // idempotente (retry do webhook regrava a mesma data) e ignora com segurança
  // um id que não é nosso (ou já sobrescrito por um reenvio).
  try {
    if (emailId) {
      if (event.type === "email.delivered") await marcarEventoEntregaResend(emailId, "entregue", em)
      else if (event.type === "email.bounced") await marcarEventoEntregaResend(emailId, "bounce", em)
      else if (event.type === "email.complained") await marcarEventoEntregaResend(emailId, "spam", em)
    }
  } catch {
    // Falha ao gravar não deve pedir retry infinito de algo já verificado —
    // responde 200; o próximo evento/retry reconcilia.
  }

  return NextResponse.json({ ok: true })
}
