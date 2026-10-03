"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { compare } from "bcryptjs"
import { headers } from "next/headers"
import { createSession } from "@/lib/auth"
import { findUsuarioByEmail, hasAnyUsuario } from "@/services/usuarios"
import { checkRateLimit } from "@/lib/rate-limit"

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha obrigatória"),
  from: z.string().optional(),
})

// Hash bcrypt (custo 12, o mesmo dos hashes reais) de uma senha que não
// corresponde a nenhuma conta. Serve só para gastar o mesmo tempo de CPU do
// compare real quando o e-mail digitado não existe, fechando o canal de
// enumeração de usuários por tempo de resposta (ver uso em loginAction).
// Não é segredo nenhum — é proposital que nunca bata com senha de ninguém.
const DUMMY_SENHA_HASH = "$2b$12$UEGYa2dodfUp96XMcKW6EO.P576Gultews2ulgXjiRqt8EWJAL1sW"

export type LoginState = { error?: string } | null

// Auditoria de segurança: "from" vem direto da URL (?from=...), então não
// basta checar startsWith("/") — "//evil.com" e "/\evil.com" também começam
// com "/" mas o navegador os trata como redirecionamento para outro domínio
// (Open Redirect). Só aceita um caminho relativo de verdade.
function isSafeRedirectPath(path: string): boolean {
  return /^\/(?!\/|\\)/.test(path)
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  if (!(await checkRateLimit(`login:${ip}`))) {
    return { error: "Muitas tentativas. Aguarde um momento e tente novamente." }
  }

  const hasUsers = await hasAnyUsuario()
  if (!hasUsers) redirect("/setup")

  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    from: formData.get("from"),
  })

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Dados inválidos" }
  }

  const { email, password, from } = result.data

  // Throttle também por conta, não só por IP: sem isto, um ataque distribuído
  // (muitos IPs, cada um abaixo do limite por IP) contra um e-mail conhecido
  // não era limitado por conta nenhuma. Reusa de propósito a MESMA janela
  // curta (60s) do limite por IP — corta o credential stuffing distribuído
  // sem virar uma trava sustentada da conta (o bloqueio se renova a cada
  // minuto, então não dá pra manter um admin fora durante uma assembleia ao
  // vivo). Checado antes do lookup e com a mesma mensagem genérica: não
  // revela se o e-mail existe.
  if (!(await checkRateLimit(`login-email:${email.toLowerCase()}`))) {
    return { error: "Muitas tentativas. Aguarde um momento e tente novamente." }
  }

  // Delay artificial para dificultar enumeração de usuários por tempo de resposta
  await new Promise((r) => setTimeout(r, 400))

  const user = await findUsuarioByEmail(email)

  // Enumeração por timing: sem usuário não havia bcrypt pra rodar, então a
  // resposta voltava ~250ms mais rápido que pra um e-mail cadastrado — dava
  // pra distinguir e-mails válidos apesar da mensagem genérica. Rodar o
  // compare contra um hash fixo quando o usuário não existe iguala o tempo
  // de resposta nos dois casos (o resultado contra o hash dummy é sempre
  // descartado logo abaixo pelo `!user`).
  const senhaCorreta = await compare(password, user?.senha_hash ?? DUMMY_SENHA_HASH)
  if (!user || !senhaCorreta) {
    return { error: "E-mail ou senha incorretos." }
  }

  const sessionUser = {
    userId: user.id,
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    acessoTotal: user.acesso_total,
  }

  await createSession(sessionUser)

  redirect(from && isSafeRedirectPath(from) ? from : "/dashboard")
}
