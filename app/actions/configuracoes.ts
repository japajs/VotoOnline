"use server"

import { revalidatePath } from "next/cache"
import { Resend } from "resend"
import { compare, hash } from "bcryptjs"
import { APP_NAME, EMAIL_ALERTA_SENHA_ALTERADA, ROUTES } from "@/lib/constants"
import { getConfiguracao, setConfiguracao } from "@/services/configuracoes"
import { getSession, requirePerfil } from "@/lib/auth"
import { findUsuarioByEmail } from "@/services/usuarios"
import { updateUsuarioSenha } from "@/services/usuarios"
import { sendSenhaAlteradaEmail } from "@/services/email"

// ─── Conta ───────────────────────────────────────────────────────────────────

export async function updateAdminNomeAction(
  nome: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  if (!nome.trim()) return { success: false, error: "Nome obrigatório." }
  try {
    await setConfiguracao("admin_nome", nome.trim())
    revalidatePath(ROUTES.configuracoes)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar." }
  }
}

export async function updateAdminEmailAction(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  if (!email.trim() || !email.includes("@"))
    return { success: false, error: "E-mail inválido." }
  try {
    await setConfiguracao("admin_email", email.trim())
    revalidatePath(ROUTES.configuracoes)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar." }
  }
}

export async function updateSenhaAction(
  senhaAtual: string,
  novaSenha: string
): Promise<{ success: boolean; error?: string }> {
  if (!novaSenha || novaSenha.length < 8)
    return { success: false, error: "Nova senha deve ter pelo menos 8 caracteres." }

  const session = await getSession()
  if (!session) return { success: false, error: "Não autenticado." }

  const user = await findUsuarioByEmail(session.email)
  if (!user) return { success: false, error: "Usuário não encontrado." }

  const correta = await compare(senhaAtual, user.senha_hash)
  if (!correta) return { success: false, error: "Senha atual incorreta." }

  try {
    const novaSenhaHash = await hash(novaSenha, 12)
    await updateUsuarioSenha(user.id, novaSenhaHash)

    if (user.email === EMAIL_ALERTA_SENHA_ALTERADA) {
      try {
        await sendSenhaAlteradaEmail(user.email)
      } catch {
        // Best-effort: a senha já foi trocada, uma falha no aviso não desfaz isso.
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar." }
  }
}

// ─── E-mail ───────────────────────────────────────────────────────────────────

export async function updateEmailNomeRemetenteAction(
  nome: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  if (!nome.trim()) return { success: false, error: "Nome obrigatório." }
  try {
    await setConfiguracao("email_nome_remetente", nome.trim())
    revalidatePath(ROUTES.configuracoes)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar." }
  }
}

export async function enviarEmailTesteAction(
  destinatario?: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const apiKey = process.env.RESEND_API_KEY
  const fromEnv = process.env.RESEND_FROM_EMAIL
  if (!apiKey) return { success: false, error: "RESEND_API_KEY não configurado." }
  if (!fromEnv) return { success: false, error: "RESEND_FROM_EMAIL não configurado." }

  let to = destinatario?.trim()
  if (!to) {
    const adminEmail = await getConfiguracao("admin_email")
    to = adminEmail?.trim() || "admin@exemplo.com"
  }

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: fromEnv,
      to,
      subject: `[${APP_NAME}] Teste de e-mail`,
      html: `<p>Este é um e-mail de teste enviado pelo sistema <strong>${APP_NAME}</strong>.</p><p>Se você recebeu esta mensagem, a configuração de e-mail está funcionando corretamente.</p>`,
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao enviar." }
  }
}

// ─── Votação defaults ─────────────────────────────────────────────────────────

export async function updateVotacaoDefaultsAction(defaults: {
  votacao_encerramento_automatico: boolean
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  try {
    await setConfiguracao(
      "votacao_encerramento_automatico",
      String(defaults.votacao_encerramento_automatico)
    )
    revalidatePath(ROUTES.configuracoes)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar." }
  }
}
