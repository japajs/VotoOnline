import { compare } from "bcryptjs"
import { getSession } from "@/lib/auth"
import { findUsuarioByEmail } from "@/services/usuarios"

// Confirmação por senha antes de qualquer exclusão (pedido do Carlos): um
// clique sem querer durante a assembleia não pode apagar trabalho em
// andamento. A verificação é feita AQUI, no servidor, dentro da própria ação
// de excluir — nunca só na tela —, senão bastaria chamar a ação direto pra
// burlar. Usa a mesma senha de login do usuário (mesmo mecanismo de trocar
// senha em Configurações). Mensagens genéricas de propósito.
export async function verificarSenhaUsuarioAtual(
  senha: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!senha?.trim()) {
    return { ok: false, error: "Digite sua senha para confirmar a exclusão." }
  }
  const session = await getSession()
  if (!session) return { ok: false, error: "Sessão expirada. Entre novamente." }

  const user = await findUsuarioByEmail(session.email)
  if (!user) return { ok: false, error: "Usuário não encontrado." }

  const correta = await compare(senha, user.senha_hash)
  if (!correta) return { ok: false, error: "Senha incorreta." }

  return { ok: true }
}
