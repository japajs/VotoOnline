"use server"

import { revalidatePath } from "next/cache"
import {
  createAssembleia,
  deleteAssembleia,
  updateAssembleiaStatus,
  updateAssembleiaCompleta,
  reabrirAssembleia,
} from "@/services/assembleias"
import {
  createPautasBatch,
  getNextOrdem,
  updatePautaIndividual,
  deletePautaIndividual,
} from "@/services/pautas"
import { getAssembleiaById, contarParticipantesJaVotaram } from "@/services/assembleias"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"
import type { AssembleiaStatus, PautaTipo } from "@/types"

interface PautaInput {
  titulo: string
  descricao: string
  tipo?: PautaTipo
  permite_abstencao?: boolean
  // Fração (0–1) de Sim sobre Sim+Não exigida pra aprovar — 0.5 = maioria
  // simples (padrão), 0.6667 ≈ 2/3, 1 = unanimidade.
  quorum_aprovacao?: number
  // Auditoria de assembleias — Fase 5: pauta sigilosa (ex.: eleição de
  // síndico) — PDF/Excel omitem o vínculo nome↔voto no detalhamento.
  sigiloso?: boolean
  opcoes?: string[]
}

function validarQuorum(valor: number | undefined | null, campo: string): string | null {
  if (valor === undefined || valor === null) return null
  if (Number.isNaN(valor) || valor <= 0 || valor > 1) {
    return `${campo} precisa ser maior que 0% e no máximo 100%.`
  }
  return null
}

// Auditoria de assembleias — Fase 2: 1ª/2ª convocação. Se data_1a_convocacao
// e data_encerramento estão as duas preenchidas, a 1ª precisa vir antes (ou
// igual) — senão a janela da 2ª convocação (depois da 1ª, até o
// encerramento) fica vazia ou invertida, o que não faz sentido.
function validarConvocacao(
  dataAbertura: string | null,
  data1aConvocacao: string | null | undefined,
  dataEncerramento: string | null
): string | null {
  if (!data1aConvocacao) return null
  if (dataEncerramento && new Date(data1aConvocacao) > new Date(dataEncerramento)) {
    return "A data da 1ª convocação precisa ser antes (ou igual) da data de encerramento."
  }
  if (dataAbertura && new Date(data1aConvocacao) < new Date(dataAbertura)) {
    return "A data da 1ª convocação precisa ser depois (ou igual) da data de abertura."
  }
  return null
}

export async function createAssembleiaAction(input: {
  condominio_id: string
  titulo: string
  descricao: string
  data_abertura: string | null
  data_encerramento: string | null
  // Fração (0–1) do peso total do condomínio exigida pra assembleia valer
  // na 1ª convocação (ou na única convocação, se data_1a_convocacao for
  // null/undefined). Null/undefined = sem checagem de quórum mínimo.
  quorum_minimo?: number | null
  // Data-limite da 1ª convocação — depois dela, quorum_minimo_2a passa a
  // valer no lugar de quorum_minimo. Null/undefined = sem 1ª/2ª convocação.
  data_1a_convocacao?: string | null
  quorum_minimo_2a?: number | null
  pautas: PautaInput[]
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominio_id)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.titulo.trim()) return { success: false, error: "Título obrigatório." }
  if (input.pautas.length === 0) return { success: false, error: "Adicione pelo menos uma pauta." }
  if (input.pautas.length > 9) return { success: false, error: "Máximo de 9 pautas por assembleia." }
  if (input.pautas.some((p) => !p.titulo.trim()))
    return { success: false, error: "Todas as pautas precisam ter título." }

  const erroQuorumMinimo = validarQuorum(input.quorum_minimo, "Quórum mínimo")
  if (erroQuorumMinimo) return { success: false, error: erroQuorumMinimo }
  const erroQuorumMinimo2a = validarQuorum(input.quorum_minimo_2a, "Quórum mínimo da 2ª convocação")
  if (erroQuorumMinimo2a) return { success: false, error: erroQuorumMinimo2a }
  const erroConvocacao = validarConvocacao(
    input.data_abertura,
    input.data_1a_convocacao,
    input.data_encerramento
  )
  if (erroConvocacao) return { success: false, error: erroConvocacao }

  for (const p of input.pautas) {
    if (p.tipo === "multipla_escolha") {
      const opcoesValidas = (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
      if (opcoesValidas.length < 2) {
        return {
          success: false,
          error: `A pauta "${p.titulo.trim()}" precisa de pelo menos 2 opções.`,
        }
      }
    }
    const erroQuorumPauta = validarQuorum(p.quorum_aprovacao, `Quórum de aprovação de "${p.titulo.trim()}"`)
    if (erroQuorumPauta) return { success: false, error: erroQuorumPauta }
  }

  let assembleiaId: string | null = null
  try {
    const assembleia = await createAssembleia({
      condominio_id: input.condominio_id,
      titulo: input.titulo.trim(),
      descricao: input.descricao.trim() || null,
      data_abertura: input.data_abertura || null,
      data_encerramento: input.data_encerramento || null,
      quorum_minimo: input.quorum_minimo ?? null,
      data_1a_convocacao: input.data_1a_convocacao || null,
      quorum_minimo_2a: input.quorum_minimo_2a ?? null,
    })
    assembleiaId = assembleia.id

    await createPautasBatch(
      input.pautas.map((p, i) => ({
        assembleia_id: assembleia.id,
        ordem: i + 1,
        titulo: p.titulo.trim(),
        descricao: p.descricao.trim() || null,
        tipo: p.tipo ?? "sim_nao",
        permite_abstencao: p.permite_abstencao ?? true,
        quorum_aprovacao: p.quorum_aprovacao ?? 0.5,
        sigiloso: p.sigiloso ?? false,
        opcoes:
          p.tipo === "multipla_escolha"
            ? (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
            : undefined,
      }))
    )

    revalidatePath(`${ROUTES.condominios}/${input.condominio_id}`)
    return { success: true }
  } catch (err) {
    // Auditoria funcional: criar a assembleia e depois criar as pautas são
    // duas escritas separadas (sem transação). Se a segunda falhar, desfaz a
    // primeira para não deixar uma assembleia "órfã" sem nenhuma pauta.
    if (assembleiaId) {
      await deleteAssembleia(assembleiaId).catch(() => {})
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao criar assembleia.",
    }
  }
}

// Edição de assembleia (Etapa: correção de título/descrição/datas/pautas
// antes da votação comprometer o que já foi respondido). `pautas: null`
// significa "não mexer nas pautas" — usado quando a tela já sabe (pelo
// mesmo sinal que o service reconfirma) que elas estão bloqueadas.
export async function updateAssembleiaAction(input: {
  id: string
  condominio_id: string
  titulo: string
  descricao: string
  data_abertura: string | null
  data_encerramento: string | null
  quorum_minimo?: number | null
  data_1a_convocacao?: string | null
  quorum_minimo_2a?: number | null
  pautas: PautaInput[] | null
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominio_id)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.titulo.trim()) return { success: false, error: "Título obrigatório." }

  const erroQuorumMinimo = validarQuorum(input.quorum_minimo, "Quórum mínimo")
  if (erroQuorumMinimo) return { success: false, error: erroQuorumMinimo }
  const erroQuorumMinimo2a = validarQuorum(input.quorum_minimo_2a, "Quórum mínimo da 2ª convocação")
  if (erroQuorumMinimo2a) return { success: false, error: erroQuorumMinimo2a }
  const erroConvocacao = validarConvocacao(
    input.data_abertura,
    input.data_1a_convocacao,
    input.data_encerramento
  )
  if (erroConvocacao) return { success: false, error: erroConvocacao }

  if (input.pautas !== null) {
    if (input.pautas.length === 0) return { success: false, error: "Adicione pelo menos uma pauta." }
    if (input.pautas.length > 9) return { success: false, error: "Máximo de 9 pautas por assembleia." }
    if (input.pautas.some((p) => !p.titulo.trim()))
      return { success: false, error: "Todas as pautas precisam ter título." }

    for (const p of input.pautas) {
      if (p.tipo === "multipla_escolha") {
        const opcoesValidas = (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
        if (opcoesValidas.length < 2) {
          return {
            success: false,
            error: `A pauta "${p.titulo.trim()}" precisa de pelo menos 2 opções.`,
          }
        }
      }
      const erroQuorumPauta = validarQuorum(p.quorum_aprovacao, `Quórum de aprovação de "${p.titulo.trim()}"`)
      if (erroQuorumPauta) return { success: false, error: erroQuorumPauta }
    }
  }

  try {
    await updateAssembleiaCompleta(
      input.id,
      {
        titulo: input.titulo.trim(),
        descricao: input.descricao.trim() || null,
        data_abertura: input.data_abertura || null,
        data_encerramento: input.data_encerramento || null,
        quorum_minimo: input.quorum_minimo ?? null,
        data_1a_convocacao: input.data_1a_convocacao || null,
        quorum_minimo_2a: input.quorum_minimo_2a ?? null,
      },
      input.pautas === null
        ? null
        : input.pautas.map((p) => ({
            titulo: p.titulo.trim(),
            descricao: p.descricao.trim() || null,
            tipo: p.tipo ?? "sim_nao",
            permite_abstencao: p.permite_abstencao ?? true,
            quorum_aprovacao: p.quorum_aprovacao ?? 0.5,
            sigiloso: p.sigiloso ?? false,
            opcoes:
              p.tipo === "multipla_escolha"
                ? (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
                : undefined,
          }))
    )

    revalidatePath(`${ROUTES.condominios}/${input.condominio_id}`)
    revalidatePath(ROUTES.condominioAssembleia(input.condominio_id, input.id))
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar assembleia.",
    }
  }
}

export async function deleteAssembleiaAction(
  id: string,
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await deleteAssembleia(id)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao excluir assembleia.",
    }
  }
}

// Item B/D do pedido: adicionar pauta com a assembleia já aberta, sem tocar
// nas pautas existentes (nunca chama updateAssembleiaCompleta — aquele
// caminho continua exclusivo da edição completa pré-voto). Retorna quantos
// participantes já votaram, para a tela decidir se mostra a confirmação de
// aviso antes de chamar notificarNovaPautaAction.
export async function adicionarPautaAssembleiaAction(input: {
  assembleiaId: string
  condominioId: string
  pauta: PautaInput
}): Promise<{
  success: boolean
  pautaId?: string
  participantesParaNotificar?: number
  error?: string
}> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  if (!input.pauta.titulo.trim()) return { success: false, error: "Título obrigatório." }
  if (input.pauta.tipo === "multipla_escolha") {
    const opcoesValidas = (input.pauta.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
    if (opcoesValidas.length < 2) {
      return { success: false, error: "A pauta precisa de pelo menos 2 opções." }
    }
  }
  const erroQuorumPauta = validarQuorum(input.pauta.quorum_aprovacao, "Quórum de aprovação")
  if (erroQuorumPauta) return { success: false, error: erroQuorumPauta }

  try {
    const assembleia = await getAssembleiaById(input.assembleiaId)
    if (!assembleia) return { success: false, error: "Assembleia não encontrada." }
    if (assembleia.status !== "aberta") {
      return {
        success: false,
        error: "Só é possível adicionar pautas enquanto a assembleia estiver aberta.",
      }
    }

    const ordem = await getNextOrdem(input.assembleiaId)
    const pautas = await createPautasBatch([
      {
        assembleia_id: input.assembleiaId,
        ordem,
        titulo: input.pauta.titulo.trim(),
        descricao: input.pauta.descricao.trim() || null,
        tipo: input.pauta.tipo ?? "sim_nao",
        permite_abstencao: input.pauta.permite_abstencao ?? true,
        quorum_aprovacao: input.pauta.quorum_aprovacao ?? 0.5,
        sigiloso: input.pauta.sigiloso ?? false,
        opcoes:
          input.pauta.tipo === "multipla_escolha"
            ? (input.pauta.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
            : undefined,
      },
    ])
    const pautaCriada = pautas.find((p) => p.ordem === ordem)

    const participantesParaNotificar = await contarParticipantesJaVotaram(input.assembleiaId)

    revalidatePath(ROUTES.condominioAssembleia(input.condominioId, input.assembleiaId))
    return { success: true, pautaId: pautaCriada?.id, participantesParaNotificar }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao adicionar pauta.",
    }
  }
}

// Item 2 do pedido de evolução: edita uma pauta específica — permitido
// enquanto ELA MESMA (não a assembleia) ainda não tem voto, independente do
// que acontece com as demais pautas da mesma assembleia. Nunca toca em
// updateAssembleiaCompleta (edição em bloco, pré-existente).
export async function editarPautaAction(input: {
  pautaId: string
  condominioId: string
  assembleiaId: string
  titulo: string
  descricao: string
  tipo?: PautaTipo
  permite_abstencao?: boolean
  quorum_aprovacao?: number
  sigiloso?: boolean
  opcoes?: string[]
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.titulo.trim()) return { success: false, error: "Título obrigatório." }

  const tipo = input.tipo ?? "sim_nao"
  if (tipo === "multipla_escolha") {
    const opcoesValidas = (input.opcoes ?? []).map((o) => o.trim()).filter(Boolean)
    if (opcoesValidas.length < 2) {
      return { success: false, error: "A pauta precisa de pelo menos 2 opções." }
    }
  }
  const erroQuorumPauta = validarQuorum(input.quorum_aprovacao, "Quórum de aprovação")
  if (erroQuorumPauta) return { success: false, error: erroQuorumPauta }

  try {
    const assembleia = await getAssembleiaById(input.assembleiaId)
    if (!assembleia) return { success: false, error: "Assembleia não encontrada." }
    if (assembleia.status === "encerrada") {
      return { success: false, error: "Esta assembleia está encerrada e não pode mais ser alterada." }
    }

    await updatePautaIndividual(input.pautaId, {
      titulo: input.titulo.trim(),
      descricao: input.descricao.trim() || null,
      tipo,
      permite_abstencao: input.permite_abstencao ?? true,
      quorum_aprovacao: input.quorum_aprovacao ?? 0.5,
      sigiloso: input.sigiloso ?? false,
      opcoes: tipo === "multipla_escolha" ? (input.opcoes ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    })

    revalidatePath(ROUTES.condominioAssembleia(input.condominioId, input.assembleiaId))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao editar pauta." }
  }
}

export async function excluirPautaAction(input: {
  pautaId: string
  condominioId: string
  assembleiaId: string
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    const assembleia = await getAssembleiaById(input.assembleiaId)
    if (!assembleia) return { success: false, error: "Assembleia não encontrada." }
    if (assembleia.status === "encerrada") {
      return { success: false, error: "Esta assembleia está encerrada e não pode mais ser alterada." }
    }

    await deletePautaIndividual(input.pautaId)
    revalidatePath(ROUTES.condominioAssembleia(input.condominioId, input.assembleiaId))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao excluir pauta." }
  }
}

export async function updateAssembleiaStatusAction(
  id: string,
  condominioId: string,
  status: AssembleiaStatus
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await updateAssembleiaStatus(id, status)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar status.",
    }
  }
}

// Reabertura excepcional (ver reabrirAssembleia em services/assembleias.ts)
// — mesma checagem de perfil/acesso de updateAssembleiaStatusAction, mas
// separada porque bypassa a trava normal de "encerrada é definitiva".
export async function reabrirAssembleiaAction(
  id: string,
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await reabrirAssembleia(id)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao reabrir assembleia.",
    }
  }
}
