import { getAssembleiaById } from "@/services/assembleias"
import { getApuracaoAssembleia } from "@/services/assembleia-votos"
import { getCondominioById } from "@/services/condominios"
import { getVotosDetalhados, type VotoDetalhado } from "@/services/relatorios"
import type { AssembleiaApuracao, AssembleiaStatus, CriterioPeso } from "@/types"

// Dados do telão ao vivo (projeção da assembleia). É exatamente o que a tela
// de "resultado parcial" já mostra (apuração + detalhamento), empacotado num
// só objeto pra a página projetar e o polling re-buscar a cada poucos
// segundos. `email` dos votos é removido (PII de outro morador) — mesma regra
// do link público (ver app/v/[token]/page.tsx).
export interface TelaoData {
  titulo: string
  status: AssembleiaStatus
  condominioNome: string | null
  criterioPeso: CriterioPeso
  dataAbertura: string | null
  dataEncerramento: string | null
  apuracao: AssembleiaApuracao
  votosDetalhados: Omit<VotoDetalhado, "email">[]
}

export async function getTelaoData(assembleiaId: string): Promise<TelaoData | null> {
  const assembleia = await getAssembleiaById(assembleiaId)
  if (!assembleia) return null

  const pautas = assembleia.pautas ?? []
  const [apuracao, condominio, votos] = await Promise.all([
    getApuracaoAssembleia(assembleiaId, pautas, assembleia.condominio_id),
    getCondominioById(assembleia.condominio_id),
    getVotosDetalhados(assembleiaId),
  ])

  return {
    titulo: assembleia.titulo,
    status: assembleia.status,
    condominioNome: condominio?.nome ?? null,
    criterioPeso: condominio?.criterio_peso ?? "unidade",
    dataAbertura: assembleia.data_abertura,
    dataEncerramento: assembleia.data_encerramento,
    apuracao,
    // Sem o `email` (PII de outro morador) — monta explicitamente o resto.
    votosDetalhados: votos.map((v) => ({
      pauta_id: v.pauta_id,
      unidades: v.unidades,
      nome: v.nome,
      resposta: v.resposta,
      votado_em: v.votado_em,
      participante: v.participante,
    })),
  }
}
