import { cache } from "react"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import type { Assembleia } from "@/types"

export interface EntradaData {
  assembleia: Assembleia | null
  condominioNome: string | null
}

// Carrega a assembleia + o nome do condomínio da página pública de entrada.
// Memoizado com React cache pra que a página e o generateMetadata (que rodam no
// MESMO request) compartilhem a mesma consulta, em vez de bater no banco duas
// vezes. O cartão de compartilhamento (opengraph-image) roda em OUTRO request e
// tem o seu próprio cache — por isso busca de novo lá, o que é esperado.
export const carregarEntrada = cache(async (assembleiaId: string): Promise<EntradaData> => {
  const assembleia = await getAssembleiaById(assembleiaId)
  if (!assembleia) return { assembleia: null, condominioNome: null }
  const condominio = await getCondominioById(assembleia.condominio_id).catch(() => null)
  return { assembleia, condominioNome: condominio?.nome ?? null }
})
