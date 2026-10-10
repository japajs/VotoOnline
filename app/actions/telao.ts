"use server"

import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { getTelaoData, type TelaoData } from "@/services/telao"

// Polling do telão (a cada poucos segundos). Read-only; visualizador também
// pode, já que é só a projeção do resultado (mesma postura da apuração).
export async function getTelaoDataAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; data?: TelaoData; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador", "visualizador"])
  if (!auth.ok) return { success: false, error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, error: acesso.error }

  try {
    const data = await getTelaoData(assembleiaId)
    if (!data) return { success: false, error: "Assembleia não encontrada." }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao carregar o telão." }
  }
}
