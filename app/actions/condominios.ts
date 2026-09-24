"use server"

import { revalidatePath } from "next/cache"
import {
  createCondominio,
  deleteCondominio,
  getCondominioById,
  updateCondominio,
  updateCondominioInfo,
} from "@/services/condominios"
import { condominioTemVotoRegistrado, hasAssembleiaAberta } from "@/services/assembleias"
import { getUnidadesByCondominioId, updateUnidade } from "@/services/unidades"
import { converterEscalaFracaoIdeal, detectarDivisorEscalaFracaoIdeal } from "@/lib/peso"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"
import type { CriterioPeso } from "@/types"

export async function createCondominioAction(
  nome: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  // Criar/excluir condomínio é exclusivo de quem tem acesso total (MASTER)
  // — um usuário PESSOAL só opera dentro dos condomínios já vinculados a ele.
  if (!auth.session.acessoTotal) {
    return { success: false, error: "Apenas usuários com acesso total podem criar condomínios." }
  }
  if (!nome.trim()) return { success: false, error: "Nome obrigatório." }
  try {
    const condo = await createCondominio({ nome: nome.trim() })
    revalidatePath(ROUTES.condominios)
    return { success: true, id: condo.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao criar condomínio." }
  }
}

export async function updateCondominioAction(
  id: string,
  nome: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(id)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!nome.trim()) return { success: false, error: "Nome obrigatório." }
  try {
    await updateCondominio(id, { nome: nome.trim() })
    revalidatePath(ROUTES.condominios)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao atualizar condomínio." }
  }
}

export async function deleteCondominioAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  if (!auth.session.acessoTotal) {
    return { success: false, error: "Apenas usuários com acesso total podem excluir condomínios." }
  }
  try {
    await deleteCondominio(id)
    revalidatePath(ROUTES.condominios)
    revalidatePath(`${ROUTES.condominios}/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao excluir condomínio." }
  }
}

export async function updateCondominioInfoAction(
  id: string,
  nome: string,
  info: {
    endereco: string
    sindico_nome: string
    sindico_contato: string
    criterio_peso: CriterioPeso
  }
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(id)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!nome.trim()) return { success: false, error: "Nome obrigatório." }

  // Auditoria de assembleias — Fase 1: trocar o critério de peso muda o
  // resultado de qualquer votação em andamento (o peso "ao vivo" de cada
  // proprietário mudaria no meio da apuração). Mesma trava já usada pra
  // transferência de unidade (hasAssembleiaAberta).
  const atual = await getCondominioById(id)
  if (atual && atual.criterio_peso !== info.criterio_peso && (await hasAssembleiaAberta(id))) {
    return {
      success: false,
      error:
        "Este condomínio tem uma assembleia aberta ou pausada — não é possível trocar o critério de peso agora, pois mudaria o resultado da votação em andamento.",
    }
  }

  // Trocar pra fração ideal sem toda unidade ter o campo preenchido faria
  // unidade sem valor contar peso 0 silenciosamente — bloqueia e avisa em
  // vez disso.
  if (info.criterio_peso === "fracao_ideal") {
    const unidades = await getUnidadesByCondominioId(id)
    const semFracao = unidades.filter((u) => u.fracao_ideal === null).length
    if (semFracao > 0) {
      return {
        success: false,
        error: `${semFracao} unidade(s) deste condomínio ainda não têm fração ideal cadastrada. Preencha todas antes de mudar o critério de peso.`,
      }
    }

    // O sistema trata fracao_ideal como fração de 1 (soma ≈ 1) em tudo que
    // mostra pro usuário (e-mail de convite, resultado, PDF). Planilha real
    // costuma vir em porcentagem (soma ≈ 100) — trocar o critério assim
    // faria o convite dizer "peso de voto: 36,4%" pra quem tem 0,364%.
    if (atual && atual.criterio_peso !== "fracao_ideal") {
      const soma = unidades.reduce((acc, u) => acc + (u.fracao_ideal ?? 0), 0)
      const divisor = detectarDivisorEscalaFracaoIdeal(soma)
      if (divisor !== 1) {
        const somaTxt = soma.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
        return {
          success: false,
          error:
            divisor === null
              ? `As frações ideais das unidades somam ${somaTxt}, que não parece fração (≈ 1), porcentagem (≈ 100) nem milésimo (≈ 1000). Confira os valores cadastrados antes de trocar o critério de peso.`
              : `As frações ideais das unidades somam ${somaTxt} — parecem estar em porcentagem/milésimo, mas o sistema usa fração de 1 (soma ≈ 1). Use "Converter frações" logo abaixo das informações do condomínio antes de trocar o critério de peso.`,
        }
      }
    }
  }

  try {
    await updateCondominio(id, { nome: nome.trim() })
    await updateCondominioInfo(id, {
      endereco: info.endereco.trim() || null,
      sindico_nome: info.sindico_nome.trim() || null,
      sindico_contato: info.sindico_contato.trim() || null,
      criterio_peso: info.criterio_peso,
    })
    revalidatePath(ROUTES.condominios)
    revalidatePath(`${ROUTES.condominios}/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao atualizar." }
  }
}

// Converte a fração ideal de TODAS as unidades do condomínio da escala em
// que vieram (porcentagem/milésimo) pra fração de 1 — ver
// detectarDivisorEscalaFracaoIdeal em lib/peso.ts. Precisa rodar ANTES de
// qualquer voto: o peso de cada voto é congelado na escala vigente na hora.
export async function converterEscalaFracoesAction(
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    if (await hasAssembleiaAberta(condominioId)) {
      return {
        success: false,
        error: "Este condomínio tem uma assembleia aberta ou pausada — não é possível converter as frações agora.",
      }
    }
    if (await condominioTemVotoRegistrado(condominioId)) {
      return {
        success: false,
        error:
          "Este condomínio já tem voto registrado em alguma assembleia — converter a escala agora deixaria as apurações antigas inconsistentes.",
      }
    }

    const unidades = await getUnidadesByCondominioId(condominioId)
    const comFracao = unidades.filter((u) => u.fracao_ideal !== null)
    const soma = comFracao.reduce((acc, u) => acc + (u.fracao_ideal ?? 0), 0)
    const divisor = detectarDivisorEscalaFracaoIdeal(soma)
    const somaTxt = soma.toLocaleString("pt-BR", { maximumFractionDigits: 4 })

    if (divisor === null) {
      return {
        success: false,
        error: `As frações somam ${somaTxt}, fora de qualquer escala conhecida — não converto no chute. Confira os valores.`,
      }
    }
    if (divisor === 1) {
      return { success: false, error: `As frações já estão em fração de 1 (soma ${somaTxt}) — nada a converter.` }
    }

    const CHUNK = 20
    for (let i = 0; i < comFracao.length; i += CHUNK) {
      await Promise.all(
        comFracao
          .slice(i, i + CHUNK)
          .map((u) =>
            updateUnidade(u.id, { fracao_ideal: converterEscalaFracaoIdeal(u.fracao_ideal as number, divisor) })
          )
      )
    }

    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao converter as frações." }
  }
}
