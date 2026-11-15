// Base pública do app pra montar links COMPARTILHÁVEIS (link de entrada da
// assembleia e link /v de voto presencial). Prefere SEMPRE o domínio da marca
// (NEXT_PUBLIC_APP_URL = https://votoonline.online) pra o link nunca sair com o
// endereço `*.vercel.app` que o operador por acaso abriu — que passava cara de
// link de teste (pedido do Cleiton). Como é uma var NEXT_PUBLIC_, o valor é
// embutido no bundle do navegador. Só cai pro endereço atual quando não há env
// (ex.: algum ambiente local sem .env) e, no servidor, pra localhost.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || null

export function appBaseUrl(): string {
  if (APP_URL) return APP_URL
  if (typeof window !== "undefined") return window.location.origin
  return "http://localhost:3000"
}

// Link público de entrada (um por assembleia; o condômino se identifica por
// unidade + CPF/CNPJ). É o link divulgado no grupo do WhatsApp / impresso no QR.
export function linkEntrada(assembleiaId: string): string {
  return `${appBaseUrl()}/entrar/${assembleiaId}`
}

// Link individual de voto por token (/v/[token]) — usado no modo presencial
// pela mesa. Mesma base canônica do link de entrada.
export function linkVotoToken(token: string): string {
  return `${appBaseUrl()}/v/${token}`
}
