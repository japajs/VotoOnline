"use server"

import { revalidatePath } from "next/cache"
import { hash } from "bcryptjs"
import {
  createUsuario,
  getUsuarioById,
  updateUsuario,
  updateUsuarioSenha,
  getCondominiosAutorizados,
  setCondominiosAutorizados,
} from "@/services/usuarios"
import { sendSenhaAlteradaEmail } from "@/services/email"
import { requirePerfil } from "@/lib/auth"
import { normalizarCelular, validarEmailFormato } from "@/lib/format"
import { EMAIL_ALERTA_SENHA_ALTERADA, ROUTES } from "@/lib/constants"
import type { UserPerfil } from "@/types"

// Gestão de usuários (escopo MASTER/PESSOAL) é uma ação administrativa —
// mesmo gate de perfil já usado para as demais operações sensíveis do
// sistema (nenhum papel novo criado só para isto).
async function requireAdmin() {
  return requirePerfil(["administrador"])
}

interface UsuarioInput {
  nome: string
  email: string
  cpf?: string
  celular?: string
  perfil: UserPerfil
  acessoTotal: boolean
  condominioIds: string[]
}

function validarCamposComuns(input: UsuarioInput): string | null {
  if (!input.nome.trim()) return "Nome obrigatório."
  if (!input.email.trim() || !validarEmailFormato(input.email)) return "E-mail em formato inválido."
  if (!input.acessoTotal && input.condominioIds.length === 0) {
    return "Selecione ao menos um condomínio para um usuário com acesso restrito."
  }
  return null
}

export async function createUsuarioAction(
  input: UsuarioInput & { senha: string }
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const erro = validarCamposComuns(input)
  if (erro) return { success: false, error: erro }
  if (input.senha.length < 8) return { success: false, error: "Senha deve ter ao menos 8 caracteres." }

  let celularNormalizado: string | null = null
  if (input.celular?.trim()) {
    celularNormalizado = normalizarCelular(input.celular)
    if (!celularNormalizado) return { success: false, error: "Celular em formato inválido." }
  }

  try {
    const senha_hash = await hash(input.senha, 12)
    const usuario = await createUsuario({
      nome: input.nome.trim(),
      email: input.email.trim(),
      senha_hash,
      cpf: input.cpf?.trim() || null,
      celular: celularNormalizado,
      perfil: input.perfil,
      acesso_total: input.acessoTotal,
    })
    if (!input.acessoTotal) {
      await setCondominiosAutorizados(usuario.id, input.condominioIds)
    }
    revalidatePath(ROUTES.usuarios)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar usuário."
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return { success: false, error: "Já existe um usuário com esse e-mail." }
    }
    return { success: false, error: msg }
  }
}

export async function updateUsuarioAction(
  id: string,
  input: UsuarioInput
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const erro = validarCamposComuns(input)
  if (erro) return { success: false, error: erro }

  let celularNormalizado: string | null = null
  if (input.celular?.trim()) {
    celularNormalizado = normalizarCelular(input.celular)
    if (!celularNormalizado) return { success: false, error: "Celular em formato inválido." }
  }

  try {
    await updateUsuario(id, {
      nome: input.nome.trim(),
      email: input.email.trim(),
      cpf: input.cpf?.trim() || null,
      celular: celularNormalizado,
      perfil: input.perfil,
      acesso_total: input.acessoTotal,
    })
    await setCondominiosAutorizados(id, input.acessoTotal ? [] : input.condominioIds)
    revalidatePath(ROUTES.usuarios)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar usuário."
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return { success: false, error: "Já existe um usuário com esse e-mail." }
    }
    return { success: false, error: msg }
  }
}

export async function updateUsuarioAtivoAction(
  id: string,
  ativo: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  try {
    await updateUsuario(id, { ativo })
    revalidatePath(ROUTES.usuarios)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao atualizar usuário." }
  }
}

export async function redefinirSenhaUsuarioAction(
  id: string,
  novaSenha: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (novaSenha.length < 8) return { success: false, error: "Senha deve ter ao menos 8 caracteres." }
  try {
    const senha_hash = await hash(novaSenha, 12)
    await updateUsuarioSenha(id, senha_hash)

    const usuario = await getUsuarioById(id)
    if (usuario?.email === EMAIL_ALERTA_SENHA_ALTERADA) {
      try {
        await sendSenhaAlteradaEmail(usuario.email)
      } catch {
        // Best-effort: a senha já foi trocada, uma falha no aviso não desfaz isso.
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao redefinir senha." }
  }
}

export async function getCondominiosAutorizadosAction(usuarioId: string): Promise<string[]> {
  const auth = await requireAdmin()
  if (!auth.ok) return []
  return getCondominiosAutorizados(usuarioId)
}
