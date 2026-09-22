import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { AUTH_COOKIE_NAME } from "@/lib/constants"

// Rotas que não exigem autenticação
const PUBLIC_PREFIXES = ["/login", "/setup", "/v/"]

// Rotas que exigem autenticação
// Achado de auditoria LGPD: /usuarios ficava fora desta lista — a página em
// si já tinha seu próprio getSession()+checagem de perfil, então nunca
// esteve realmente exposta, mas quebrava a camada de defesa que todas as
// outras páginas administrativas têm aqui no proxy.
const PROTECTED_PREFIXES = ["/dashboard", "/condominios", "/calendario", "/configuracoes", "/importacao", "/relatorios", "/usuarios"]

function getSecret(): Uint8Array | null {
  const password = process.env.AUTH_PASSWORD
  if (!password) return null
  return new TextEncoder().encode(password)
}

async function isValidSession(token: string): Promise<boolean> {
  const secret = getSecret()
  if (!secret) return false
  try {
    const { payload } = await jwtVerify(token, secret)
    // JWT precisa ter userId (tokens antigos de senha única serão invalidados)
    return typeof payload.userId === "string"
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))

  // Usuário já autenticado não deve acessar /login ou /setup
  if (isPublic && token) {
    const valid = await isValidSession(token)
    if (valid && (pathname.startsWith("/login") || pathname.startsWith("/setup"))) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  // Rotas protegidas exigem token válido
  if (isProtected) {
    if (!token || !(await isValidSession(token))) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("from", pathname)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete(AUTH_COOKIE_NAME)
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
