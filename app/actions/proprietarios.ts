"use server"

import { revalidatePath } from "next/cache"
import {
  createProprietario,
  deleteProprietario,
  getProprietarioById,
  registrarHistoricoAlteracao,
  updateProprietario,
} from "@/services/proprietarios"
import {
  createUnidade,
  deleteUnidade,
  getUnidadeById,
  updateUnidade,
} from "@/services/unidades"
import { getAssembleiaIdsEmAndamento, pesoJaFoiCongeladoEmAssembleiaAtiva } from "@/services/assembleias"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"
import { normalizarCelular, validarEmailFormato } from "@/lib/format"

// Auditoria funcional: antes, qualquer erro de constraint única virava
// sempre "já existe... com esse e-mail", mesmo quando o CPF é que estava
// duplicado — o usuário perdia tempo tentando corrigir o campo errado.
function mensagemErroDuplicidade(msg: string): string | null {
  const lower = msg.toLowerCase()
  if (!lower.includes("unique") && !lower.includes("duplicate")) return null
  if (lower.includes("cpf")) {
    return "Já existe um proprietário com esse CPF neste condomínio."
  }
  if (lower.includes("email")) {
    return "Já existe um proprietário com esse e-mail neste condomínio."
  }
  return "Já existe um proprietário com esses dados neste condomínio."
}

export async function createProprietarioAction(input: {
  condominio_id: string
  nome: string
  email: string
  telefone?: string
  unidades: string[] // numeros de apartamento
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominio_id)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.nome.trim()) return { success: false, error: "Nome obrigatório." }
  if (!input.email.trim()) return { success: false, error: "E-mail obrigatório." }
  if (!validarEmailFormato(input.email)) {
    return { success: false, error: "E-mail em formato inválido." }
  }

  let telefoneNormalizado: string | null = null
  if (input.telefone?.trim()) {
    telefoneNormalizado = normalizarCelular(input.telefone)
    if (!telefoneNormalizado) {
      return { success: false, error: "Celular em formato inválido. Use apenas um número de celular." }
    }
  }

  try {
    const proprietario = await createProprietario({
      condominio_id: input.condominio_id,
      nome: input.nome.trim(),
      email: input.email.trim() || null,
      telefone: telefoneNormalizado,
    })

    // Cria as unidades em paralelo
    await Promise.all(
      input.unidades
        .map((n) => n.trim())
        .filter(Boolean)
        .map((numero) =>
          createUnidade({ proprietario_id: proprietario.id, numero, bloco: null })
        )
    )

    revalidatePath(`${ROUTES.condominios}/${input.condominio_id}`)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar proprietário."
    const duplicidade = mensagemErroDuplicidade(msg)
    if (duplicidade) return { success: false, error: duplicidade }
    return { success: false, error: msg }
  }
}

export async function deleteProprietarioAction(
  id: string,
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await deleteProprietario(id)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao excluir proprietário." }
  }
}

export async function addUnidadeAction(
  proprietarioId: string,
  condominioId: string,
  numero: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!numero.trim()) return { success: false, error: "Número da unidade obrigatório." }
  try {
    await createUnidade({ proprietario_id: proprietarioId, numero: numero.trim(), bloco: null })
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao adicionar unidade." }
  }
}

// Auditoria de assembleias — Fase 1: fração ideal da unidade (usada quando
// o condomínio tem criterio_peso = "fracao_ideal" — ver lib/peso.ts).
export async function updateFracaoIdealAction(
  unidadeId: string,
  condominioId: string,
  fracaoIdeal: number | null
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (fracaoIdeal !== null && (Number.isNaN(fracaoIdeal) || fracaoIdeal < 0)) {
    return { success: false, error: "Fração ideal precisa ser um número maior ou igual a zero." }
  }
  try {
    await updateUnidade(unidadeId, { fracao_ideal: fracaoIdeal })
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao salvar fração ideal." }
  }
}

export async function removeUnidadeAction(
  unidadeId: string,
  condominioId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  try {
    await deleteUnidade(unidadeId)
    revalidatePath(`${ROUTES.condominios}/${condominioId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao remover unidade." }
  }
}

// ─── Etapa 2: correção de cadastro sem interromper a assembleia ──────────────

// Campo-chave (item 6): CPF/CNPJ não é mais alterável por aqui — só nome,
// e-mail, celular e observações. Ver updateCpfProprietarioAction abaixo para
// a ação administrativa específica de alteração de CPF/CNPJ.
export async function updateProprietarioAction(input: {
  id: string
  condominioId: string
  nome: string
  email: string
  telefone: string
  observacoes: string
  inadimplente: boolean
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.nome.trim()) return { success: false, error: "Nome obrigatório." }

  try {
    const atual = await getProprietarioById(input.id)
    if (!atual) return { success: false, error: "Proprietário não encontrado." }

    const novoNome = input.nome.trim()
    const novoEmail = input.email.trim() || null
    const novasObservacoes = input.observacoes.trim() || null

    // Só valida formato quando o valor de fato muda — um cadastro antigo com
    // e-mail/celular fora do formato atual continua editável nos outros
    // campos sem ser barrado por um dado legado que não foi tocado agora.
    if (novoEmail !== (atual.email ?? null) && novoEmail && !validarEmailFormato(novoEmail)) {
      return { success: false, error: "E-mail em formato inválido." }
    }

    let novoTelefone = atual.telefone ?? null
    const telefoneBruto = input.telefone.trim()
    if (telefoneBruto !== (atual.telefone ?? "")) {
      if (!telefoneBruto) {
        novoTelefone = null
      } else {
        const normalizado = normalizarCelular(telefoneBruto)
        if (!normalizado) {
          return {
            success: false,
            error: "Celular em formato inválido. Use apenas um número de celular.",
          }
        }
        novoTelefone = normalizado
      }
    }

    const mudancas: {
      campo: string
      valorAnterior: string | null
      valorNovo: string | null
    }[] = []
    if (novoNome !== atual.nome)
      mudancas.push({ campo: "nome", valorAnterior: atual.nome, valorNovo: novoNome })
    if (novoEmail !== (atual.email ?? null))
      mudancas.push({ campo: "email", valorAnterior: atual.email, valorNovo: novoEmail })
    if (novoTelefone !== (atual.telefone ?? null))
      mudancas.push({ campo: "telefone", valorAnterior: atual.telefone, valorNovo: novoTelefone })
    if (novasObservacoes !== (atual.observacoes ?? null))
      mudancas.push({
        campo: "observacoes",
        valorAnterior: atual.observacoes,
        valorNovo: novasObservacoes,
      })
    if (input.inadimplente !== atual.inadimplente)
      mudancas.push({
        campo: "inadimplente",
        valorAnterior: String(atual.inadimplente),
        valorNovo: String(input.inadimplente),
      })

    if (mudancas.length === 0) {
      return { success: false, error: "Nenhuma alteração para salvar." }
    }

    await updateProprietario(input.id, {
      nome: novoNome,
      email: novoEmail,
      telefone: novoTelefone,
      observacoes: novasObservacoes,
      inadimplente: input.inadimplente,
    })

    await registrarHistoricoAlteracao(
      input.id,
      mudancas.map((m) => ({
        campo: m.campo,
        valor_anterior: m.valorAnterior,
        valor_novo: m.valorNovo,
      }))
    )

    revalidatePath(`${ROUTES.condominios}/${input.condominioId}`)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar proprietário."
    const duplicidade = mensagemErroDuplicidade(msg)
    if (duplicidade) return { success: false, error: duplicidade }
    return { success: false, error: msg }
  }
}

// Ação administrativa específica (item 6): alterar CPF/CNPJ é sensível o
// bastante (pode mudar a identidade legal do proprietário) para exigir
// perfil administrador e confirmação explícita sempre — não só quando o
// proprietário já votou. Separada de updateProprietarioAction de propósito,
// para não ficar escondida dentro de uma edição "de rotina".
export async function updateCpfProprietarioAction(input: {
  id: string
  condominioId: string
  novoCpf: string
  confirmar: boolean
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.confirmar) {
    return { success: false, error: "Confirme explicitamente a alteração do CPF/CNPJ." }
  }

  try {
    const atual = await getProprietarioById(input.id)
    if (!atual) return { success: false, error: "Proprietário não encontrado." }

    const novoCpf = input.novoCpf.trim() || null
    if (novoCpf === (atual.cpf ?? null)) {
      return { success: false, error: "Nenhuma alteração para salvar." }
    }

    await updateProprietario(input.id, { cpf: novoCpf })
    await registrarHistoricoAlteracao(input.id, [
      { campo: "cpf", valor_anterior: atual.cpf, valor_novo: novoCpf },
    ])

    revalidatePath(`${ROUTES.condominios}/${input.condominioId}`)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar CPF/CNPJ."
    const duplicidade = mensagemErroDuplicidade(msg)
    if (duplicidade) return { success: false, error: duplicidade }
    return { success: false, error: msg }
  }
}

export async function transferUnidadeAction(input: {
  unidadeId: string
  condominioId: string
  novoProprietarioId?: string
  novoProprietario?: { nome: string; email: string; telefone?: string }
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(input.condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }
  if (!input.novoProprietarioId && !input.novoProprietario) {
    return { success: false, error: "Selecione o proprietário de destino ou crie um novo." }
  }

  try {
    const unidade = await getUnidadeById(input.unidadeId)
    if (!unidade) return { success: false, error: "Unidade não encontrada." }

    // Auditoria funcional: transferir unidade com assembleia aberta só é
    // arriscado (peso contado duas vezes) se o peso do dono atual ou o de
    // destino já estiver congelado em algum voto — sem isso, o peso é
    // recalculado "ao vivo" a partir do dono corrente e a transferência é
    // segura mesmo com votação em curso. "Congelado" inclui ter votado
    // diretamente OU ter outorgado procuração pra alguém que já votou (ver
    // pesoJaFoiCongeladoEmAssembleiaAtiva).
    const assembleiaIdsEmAndamento = await getAssembleiaIdsEmAndamento(input.condominioId)
    const [donoAtualCongelado, donoDestinoCongelado] = await Promise.all([
      pesoJaFoiCongeladoEmAssembleiaAtiva(assembleiaIdsEmAndamento, unidade.proprietario_id),
      input.novoProprietarioId
        ? pesoJaFoiCongeladoEmAssembleiaAtiva(assembleiaIdsEmAndamento, input.novoProprietarioId)
        : Promise.resolve(false),
    ])
    if (donoAtualCongelado) {
      return {
        success: false,
        error:
          "O proprietário atual desta unidade já votou (ou outorgou procuração a alguém que já votou) em uma assembleia em andamento neste condomínio. Aguarde o encerramento ou pause a assembleia antes de transferir.",
      }
    }
    if (donoDestinoCongelado) {
      return {
        success: false,
        error:
          "O proprietário de destino já votou (ou outorgou procuração a alguém que já votou) em uma assembleia em andamento neste condomínio. Aguarde o encerramento ou pause a assembleia antes de transferir.",
      }
    }

    const proprietarioAntigo = await getProprietarioById(unidade.proprietario_id)

    let novoProprietarioId = input.novoProprietarioId
    let novoProprietarioNome: string

    if (!novoProprietarioId) {
      const dados = input.novoProprietario!
      if (!dados.nome.trim()) return { success: false, error: "Nome do novo proprietário obrigatório." }
      if (!dados.email.trim()) return { success: false, error: "E-mail do novo proprietário obrigatório." }
      if (!validarEmailFormato(dados.email)) {
        return { success: false, error: "E-mail do novo proprietário em formato inválido." }
      }

      let telefoneNormalizado: string | null = null
      if (dados.telefone?.trim()) {
        telefoneNormalizado = normalizarCelular(dados.telefone)
        if (!telefoneNormalizado) {
          return {
            success: false,
            error: "Celular do novo proprietário em formato inválido. Use apenas um número de celular.",
          }
        }
      }

      const criado = await createProprietario({
        condominio_id: input.condominioId,
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        telefone: telefoneNormalizado,
      })
      novoProprietarioId = criado.id
      novoProprietarioNome = criado.nome
    } else {
      const existente = await getProprietarioById(novoProprietarioId)
      if (!existente) return { success: false, error: "Proprietário de destino não encontrado." }
      novoProprietarioNome = existente.nome
    }

    if (novoProprietarioId === unidade.proprietario_id) {
      return { success: false, error: "A unidade já pertence a este proprietário." }
    }

    await updateUnidade(input.unidadeId, { proprietario_id: novoProprietarioId })
    revalidatePath(`${ROUTES.condominios}/${input.condominioId}`)

    const nomeAntigo = proprietarioAntigo?.nome ?? "proprietário anterior"

    await Promise.all([
      registrarHistoricoAlteracao(unidade.proprietario_id, [
        {
          campo: "unidades",
          valor_anterior: unidade.numero,
          valor_novo: `Transferida para ${novoProprietarioNome}`,
        },
      ]),
      registrarHistoricoAlteracao(novoProprietarioId, [
        {
          campo: "unidades",
          valor_anterior: null,
          valor_novo: `${unidade.numero} (de ${nomeAntigo})`,
        },
      ]),
    ])

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao transferir unidade."
    const duplicidade = mensagemErroDuplicidade(msg)
    if (duplicidade) return { success: false, error: duplicidade }
    return { success: false, error: msg }
  }
}
