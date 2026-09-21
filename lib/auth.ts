import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from "./constants"
import { createServerClient } from "@/lib/supabase/server"
import { getCondominiosAutorizados } from "@/services/usuarios"
import type { SessionUser, UserPerfil } from "@/types"

function getSecret(): Uint8Array {
  const password = process.env.AUTH_PASSWORD
  if (!password) throw new Error("AUTH_PASSWORD não está configurado")
  return new TextEncoder().encode(password)
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    userId: user.userId,
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    acessoTotal: user.acessoTotal,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${AUTH_COOKIE_MAX_AGE}s`)
    .sign(getSecret())

  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
  })
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(AUTH_COOKIE_NAME)
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(AUTH_COOKIE_NAME)?.value
}

export async function getSession(): Promise<SessionUser | null> {
  const token = await getSessionToken()
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const { userId, email, nome, perfil, acessoTotal } = payload
    if (
      typeof userId !== "string" ||
      typeof email !== "string" ||
      typeof nome !== "string" ||
      typeof perfil !== "string"
    ) {
      return null
    }

    // Achado de auditoria: desativar um usuário (updateUsuarioAtivoAction)
    // só bloqueava um LOGIN NOVO (findUsuarioByEmail já filtra ativo=true) —
    // quem já estava logado continuava com sessão válida e acesso total até
    // o cookie expirar sozinho, até AUTH_COOKIE_MAX_AGE (7 dias), porque o
    // JWT nunca carregou `ativo` e nada revalidava contra o banco depois do
    // login. Reconsultar aqui é o único jeito de "desativar" surtir efeito
    // imediato numa sessão já aberta.
    const db = createServerClient()
    const { data: usuario, error } = await db
      .from("usuarios")
      .select("ativo")
      .eq("id", userId)
      .maybeSingle()
    if (error || !usuario || usuario.ativo === false) return null

    // Sessões emitidas antes desta claim existir não têm `acessoTotal` no
    // token — trata como acesso total (mesmo comportamento de sempre) até o
    // usuário logar de novo, em vez de derrubar todo mundo no deploy.
    return {
      userId,
      email,
      nome,
      perfil: perfil as UserPerfil,
      acessoTotal: typeof acessoTotal === "boolean" ? acessoTotal : true,
    }
  } catch {
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null
}

// Escopo por condomínio (MASTER/PESSOAL): resolve, a partir da sessão atual,
// a lista de condomínio_id que o usuário pode ver — `undefined` pra MASTER
// (acessoTotal: true) ou sessão antiga/inexistente, mantendo o comportamento
// de sempre (sem filtro); um array pra PESSOAL, vindo de usuario_condominios.
// Centraliza a decisão "quais condomínios este usuário enxerga" pra não
// precisar reescrever `session && !session.acessoTotal ? ... : undefined`
// em cada página/rota que lista dados por condomínio (ver
// app/(dashboard)/condominios/page.tsx e app/(dashboard)/dashboard/page.tsx).
export async function resolveCondominioScope(): Promise<string[] | undefined> {
  const session = await getSession()
  if (session && !session.acessoTotal) {
    return getCondominiosAutorizados(session.userId)
  }
  return undefined
}

// Auditoria de segurança: os 3 perfis (administrador/operador/visualizador)
// só eram checados na interface e em 3 rotas de exportação — nenhuma server
// action validava perfil, então um "visualizador" conseguia excluir/editar
// qualquer coisa chamando a action diretamente. Toda action que muda dados
// deve chamar isto antes de executar.
export async function requirePerfil(
  allowed: UserPerfil[]
): Promise<{ ok: true; session: SessionUser } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Não autenticado." }
  if (!allowed.includes(session.perfil)) {
    return { ok: false, error: "Você não tem permissão para realizar esta ação." }
  }
  return { ok: true, session }
}

// Escopo por condomínio (MASTER/PESSOAL): MASTER (`acessoTotal: true`) passa
// direto; PESSOAL só passa se este condomínio estiver em usuario_condominios
// para ele. Independente de `requirePerfil` — uma action que precisa das
// duas coisas chama as duas.
export async function requireAcessoCondominio(
  condominioId: string
): Promise<{ ok: true; session: SessionUser } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Não autenticado." }
  if (session.acessoTotal) return { ok: true, session }

  const db = createServerClient()
  const { data, error } = await db
    .from("usuario_condominios")
    .select("condominio_id")
    .eq("usuario_id", session.userId)
    .eq("condominio_id", condominioId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) {
    return { ok: false, error: "Você não tem acesso a este condomínio." }
  }
  return { ok: true, session }
}
