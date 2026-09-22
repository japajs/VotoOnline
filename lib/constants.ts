export const APP_NAME = "VotoOnline"
export const APP_VERSION = "1.0"

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  condominios: "/condominios",
  usuarios: "/usuarios",
  configuracoes: "/configuracoes",
  importacao: "/importacao",
  relatorios: "/relatorios",
  publicCondoVoto: (token: string) => `/v/${token}`,
  condominioAssembleia: (condominioId: string, assembleiaId: string) =>
    `/condominios/${condominioId}/assembleias/${assembleiaId}`,
} as const

export const AUTH_COOKIE_NAME = "pf_session"
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX_REQUESTS = 20

// Segurança: qualquer "administrador" pode redefinir a senha de qualquer
// outro usuário, inclusive de outro administrador, sem aviso nenhum pro dono
// da conta (ver redefinirSenhaUsuarioAction/updateSenhaAction) — decisão de
// design que faz sentido pra dois admins que operam juntos (ver
// services/email.ts, sendSenhaAlteradaEmail). Por pedido explícito, o aviso
// por e-mail quando a senha muda só dispara pra esta conta, não pra todas.
export const EMAIL_ALERTA_SENHA_ALTERADA = "cleitonsalazargomes@gmail.com"
