"use server"

import { revalidatePath } from "next/cache"
import {
  createProcuracao,
  deleteProcuracao,
  getProcuracoesByAssembleia,
} from "@/services/procuracoes"
import { getProprietariosSemVoto } from "@/services/assembleia-votos"
import { getAssembleiaById } from "@/services/assembleias"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"
import { isVotacaoAberta } from "@/lib/assembleia-status"
import type { ProcuracaoComNomes } from "@/types"
import type { ProprietarioSemVoto } from "@/services/assembleia-votos"

export async function getProcuracoesAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; procuracoes: ProcuracaoComNomes[]; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, procuracoes: [], error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, procuracoes: [], error: acesso.error }

  try {
    const procuracoes = await getProcuracoesByAssembleia(assembleiaId)
    return { success: true, procuracoes }
  } catch (err) {
    return { success: false, procuracoes: [], error: err instanceof Error ? err.message : "Erro ao buscar procurações." }
  }
}

// Elegível pra outorgar OU receber procuração = ainda não votou nesta
// assembleia (mesma lista usada pro registro manual de voto — Fase 7:
// getProprietariosSemVoto). Quem já votou não pode mais entrar numa
// procuração nova, pro mesmo motivo em ambos os casos: o peso já foi
// congelado e não é recalculado depois (ver lib/peso.ts).
export async function getElegiveisParaProcuracaoAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; proprietarios: ProprietarioSemVoto[]; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, proprietarios: [], error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, proprietarios: [], error: acesso.error }

  try {
    const proprietarios = await getProprietariosSemVoto(condominioId, assembleiaId)
    return { success: true, proprietarios }
  } catch (err) {
    return {
      success: false,
      proprietarios: [],
      error: err instanceof Error ? err.message : "Erro ao buscar proprietários.",
    }
  }
}

export async function createProcuracaoAction(
  assembleiaId: string,
  condominioId: string,
  outorganteId: string,
  outorgadoId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    const assembleia = await getAssembleiaById(assembleiaId)
    if (!assembleia) return { success: false, error: "Assembleia não encontrada." }
    if (!isVotacaoAberta(assembleia.status)) {
      return { success: false, error: "Só é possível registrar procuração enquanto a assembleia estiver aberta." }
    }

    await createProcuracao(assembleiaId, outorganteId, outorgadoId)
    revalidatePath(ROUTES.condominioAssembleia(condominioId, assembleiaId))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao registrar procuração." }
  }
}

export async function deleteProcuracaoAction(
  id: string,
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    await deleteProcuracao(id)
    revalidatePath(ROUTES.condominioAssembleia(condominioId, assembleiaId))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao remover procuração." }
  }
}
