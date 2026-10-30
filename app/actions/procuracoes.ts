"use server"

import { revalidatePath } from "next/cache"
import {
  createProcuracao,
  deleteProcuracao,
  getProcuracoesByAssembleia,
  getOutorgantesIds,
} from "@/services/procuracoes"
import { getProprietariosSemVoto } from "@/services/assembleia-votos"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { verificarSenhaUsuarioAtual } from "@/lib/confirmar-senha"
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
  outorgadoId: string,
  // Confirmação explícita pra superar o limite de procurações da convenção
  // (pedido do Carlos: é aviso, não bloqueio seco). A tela liga isso depois do
  // operador confirmar.
  permitirExcederLimite = false
): Promise<{
  success: boolean
  error?: string
  // Sinaliza pra tela que o representante bateria o limite da convenção — ela
  // mostra o aviso e deixa confirmar. `atual` = quantas já tem; `limite` = o máx.
  limiteExcedido?: boolean
  atual?: number
  limite?: number
}> {
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

    // Limite de procurações por representante (convenção do condomínio). AVISO,
    // não bloqueio: se o outorgado já bateria o limite, devolve `limiteExcedido`
    // pra tela confirmar; com permitirExcederLimite=true, segue (pula a consulta).
    if (!permitirExcederLimite) {
      const condominio = await getCondominioById(condominioId)
      const limite = condominio?.limite_procuracoes ?? null
      if (limite != null) {
        const atuais = await getOutorgantesIds(assembleiaId, outorgadoId)
        if (atuais.length + 1 > limite) {
          return { success: false, limiteExcedido: true, atual: atuais.length, limite }
        }
      }
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
    await deleteProcuracao(id)
    revalidatePath(ROUTES.condominioAssembleia(condominioId, assembleiaId))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao remover procuração." }
  }
}
