import {
  getProprietarioIdsVotaram,
  getProprietarioIdsPresentes,
  getPautasVotadasPorProprietario,
  getEmailProblemaPorProprietario,
} from "@/services/assembleia-votos"
import { getProcuracoesByAssembleia } from "@/services/procuracoes"
import { getParticipantesNaAberta } from "@/services/presenca"
import type { Assembleia } from "@/types"

// Dados por-proprietário que a ProprietariosList usa pra mostrar a "chamada"
// (presença, quem votou, voto total vs parcial, procurações, e-mail com
// problema). Todos opcionais: sem assembleia, vêm vazios.
export interface DadosParticipantes {
  votou?: Set<string>
  presentes?: Set<string>
  pautasVotadas?: Map<string, number>
  outorgantes?: Set<string>
  outorgantesComRepVotou?: Map<string, number>
  participantes?: Map<string, string>
  emailProblema?: Map<string, "bounce" | "spam">
  totalPautasVotaveis?: number
}

const VAZIO: DadosParticipantes = {}

// Reúne, para UMA assembleia, todos os dados por-proprietário da chamada. É a
// MESMA lógica que a página de gestão do condomínio calcula inline para a
// assembleia aberta (app/(dashboard)/condominios/[id]/page.tsx) — extraída aqui
// pra a tela de apuração mostrar a chamada na aba "Participantes" sem o operador
// trocar de tela (pedido do Carlos: "Modo exibir", fundir gestão + apuração).
//
// Observação sobre procuração (pedido do Carlos): quem outorgou procuração não
// é marcado presente (quem participa é o procurador); o imóvel conta como
// PRESENTE quando o representante vota e AUSENTE enquanto não vota — por isso
// `outorgantesComRepVotou` só tem a chave quando o representante já votou.
//
// TODO(dry): fazer a página de gestão consumir este helper também (hoje ela
// mantém a cópia inline; esta função nasceu idêntica a ela).
export async function getDadosParticipantes(
  assembleia: Assembleia | null
): Promise<DadosParticipantes> {
  if (!assembleia) return VAZIO

  const [votou, presentes, pautasVotadas, procuracoes, participantes, emailProblema] =
    await Promise.all([
      getProprietarioIdsVotaram(assembleia.id).catch(() => new Set<string>()),
      getProprietarioIdsPresentes(assembleia.id).catch(() => new Set<string>()),
      getPautasVotadasPorProprietario(assembleia.id).catch(() => new Map<string, number>()),
      getProcuracoesByAssembleia(assembleia.id).catch(() => []),
      getParticipantesNaAberta(assembleia.id).catch(() => new Map<string, string>()),
      getEmailProblemaPorProprietario(assembleia.id).catch(
        () => new Map<string, "bounce" | "spam">()
      ),
    ])

  const outorgantes = new Set(procuracoes.map((p) => p.outorgante_id))
  const outorgantesComRepVotou = new Map<string, number>(
    procuracoes
      .filter((p) => votou.has(p.outorgado_id))
      .map((p) => [p.outorgante_id, pautasVotadas.get(p.outorgado_id) ?? 0])
  )

  // Denominador do "voto total" (vs. parcial): no modo pauta-por-pauta só contam
  // as pautas já abertas pela mesa; no modo normal, todas.
  const totalPautasVotaveis = assembleia.votacao_por_pauta
    ? (assembleia.pautas ?? []).filter((p) => p.votacao_aberta_em != null).length
    : (assembleia.pautas ?? []).length

  return {
    votou,
    presentes,
    pautasVotadas,
    outorgantes,
    outorgantesComRepVotou,
    participantes,
    emailProblema,
    totalPautasVotaveis,
  }
}
