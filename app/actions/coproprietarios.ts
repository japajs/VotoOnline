"use server"

import { revalidatePath } from "next/cache"
import {
  createCoproprietario,
  deleteCoproprietario,
  getCoproprietariosByUnidades,
} from "@/services/coproprietarios"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { verificarSenhaUsuarioAtual } from "@/lib/confirmar-senha"
import { ROUTES } from "@/lib/constants"
import type { CoproprietarioComNome } from "@/types"

// Auditoria de assembleias — Fase 9: busca os coproprietários de várias
// unidades de uma vez (todas as unidades de um proprietário) — usado ao
// abrir o diálogo de edição de cadastro.
export async function getCoproprietariosPorUnidadesAction(
  unidadeIds: string[],
  condominioId: string
): Promise<{ success: boolean; porUnidade: Record<string, CoproprietarioComNome[]>; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, porUnidade: {}, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, porUnidade: {}, error: acesso.error }

  try {
    const porUnidade = await getCoproprietariosByUnidades(unidadeIds, condominioId)
    return { success: true, porUnidade }
  } catch (err) {
    return {
      success: false,
      porUnidade: {},
      error: err instanceof Error ? err.message : "Erro ao buscar coproprietários.",
    }
  }
}

export async function createCoproprietarioAction(
  unidadeId: string,
  proprietarioId: string,
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    await createCoproprietario(unidadeId, proprietarioId, condominioId)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao registrar coproprietário." }
  }
}

export async function deleteCoproprietarioAction(
  id: string,
  condominioId: string,
  senha: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  const senhaOk = await verificarSenhaUsuarioAtual(senha)
  if (!senhaOk.ok) return { success: false, error: senhaOk.error }

  try {
    await deleteCoproprietario(id, condominioId)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao remover coproprietário." }
  }
}
