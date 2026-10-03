"use server"

import { revalidatePath } from "next/cache"
import { executarLoteImportacao } from "@/services/importacao"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"
import type { ProprietarioImport } from "@/types"

export interface ImportacaoResultado {
  success: boolean
  condominioId: string
  proprietariosCriados: number
  proprietariosAtualizados: number
  unidadesCriadas: number
  unidadesIgnoradas: number
  erros: string[]
  error?: string
}

export async function executarImportacaoAction(
  condominioId: string,
  proprietarios: ProprietarioImport[]
): Promise<ImportacaoResultado> {
  const auth = await requirePerfil(["administrador", "operador"])
  if (!auth.ok) {
    return {
      success: false,
      condominioId: condominioId || "",
      proprietariosCriados: 0,
      proprietariosAtualizados: 0,
      unidadesCriadas: 0,
      unidadesIgnoradas: 0,
      erros: [],
      error: auth.error,
    }
  }
  if (!condominioId) {
    return {
      success: false,
      condominioId: "",
      proprietariosCriados: 0,
      proprietariosAtualizados: 0,
      unidadesCriadas: 0,
      unidadesIgnoradas: 0,
      erros: [],
      error: "Condomínio não selecionado.",
    }
  }

  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) {
    return {
      success: false,
      condominioId,
      proprietariosCriados: 0,
      proprietariosAtualizados: 0,
      unidadesCriadas: 0,
      unidadesIgnoradas: 0,
      erros: [],
      error: acesso.error,
    }
  }

  if (!proprietarios.length) {
    return {
      success: false,
      condominioId,
      proprietariosCriados: 0,
      proprietariosAtualizados: 0,
      unidadesCriadas: 0,
      unidadesIgnoradas: 0,
      erros: [],
      error: "Nenhum proprietário para importar.",
    }
  }

  // Defesa em profundidade: o parse do arquivo acontece no cliente e só a
  // lista pronta chega aqui, então um operador autenticado poderia mandar um
  // lote gigante (limitado só pelo bodySizeLimit do Next) e forçar uma
  // enxurrada de escritas no banco. Um teto explícito corta isso — nenhum
  // condomínio real chega perto de 5.000 proprietários num único import.
  const MAX_PROPRIETARIOS_IMPORT = 5000
  if (proprietarios.length > MAX_PROPRIETARIOS_IMPORT) {
    return {
      success: false,
      condominioId,
      proprietariosCriados: 0,
      proprietariosAtualizados: 0,
      unidadesCriadas: 0,
      unidadesIgnoradas: 0,
      erros: [],
      error: `Importação muito grande (${proprietarios.length} linhas). O limite é ${MAX_PROPRIETARIOS_IMPORT} proprietários por vez — divida o arquivo e importe em partes.`,
    }
  }

  const resultado = await executarLoteImportacao(condominioId, proprietarios)

  revalidatePath(`${ROUTES.condominios}/${condominioId}`)
  revalidatePath(ROUTES.condominios)
  revalidatePath(ROUTES.dashboard)

  return {
    success: true,
    condominioId,
    ...resultado,
  }
}
