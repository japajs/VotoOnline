import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getApuracaoAssembleia } from "@/services/assembleia-votos"
import { getHistoricoParticipacao } from "@/services/relatorios"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { ApuracaoAssembleia } from "@/components/assembleias/apuracao-assembleia"
import { HistoricoParticipacao } from "@/components/assembleias/historico-participacao"
import { APP_NAME } from "@/lib/constants"

interface Props {
  params: Promise<{ assembleiaId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assembleiaId } = await params
  try {
    const a = await getAssembleiaById(assembleiaId)
    return { title: a ? `Apuração — ${a.titulo}` : APP_NAME }
  } catch {
    return { title: APP_NAME }
  }
}

// Apuração (resultados) em TELA CHEIA, fora do layout do dashboard (sem menu
// lateral) — abre em NOVA ABA pelo "Relatórios ▾" da tela da assembleia (pedido
// do Carlos 2026-11-13: mesmo rito do Telão). SÓ LEITURA (`somenteLeitura`): sem
// a fileira de ações, só o boletim (funil, pautas, quórum, histórico) — pode ser
// projetada ou compartilhada à parte sem trocar a tela principal. Protegida por
// login (/apuracao em proxy.ts) + acesso ao condomínio aqui.
export default async function ApuracaoPage({ params }: Props) {
  const { assembleiaId } = await params

  const assembleia = await getAssembleiaById(assembleiaId).catch(() => null)
  if (!assembleia) notFound()

  // Escopo por condomínio (MASTER/PESSOAL): mesma checagem das outras telas —
  // sem ela, saber a URL já mostraria a apuração de um condomínio fora do escopo.
  const acesso = await requireAcessoCondominio(assembleia.condominio_id)
  if (!acesso.ok) notFound()

  // Operador controla a VOTAÇÃO por aqui (pauta por pauta: liga/desliga + abrir/
  // fechar cada pauta) — a aba /apuracao é o centro de controle, já que os
  // resultados saíram da tela principal. Visualizador vê só leitura.
  const session = await getSession()
  const podeOperar = session?.perfil !== "visualizador"

  const condominio = await getCondominioById(assembleia.condominio_id).catch(() => null)
  if (!condominio) notFound()

  const pautas = assembleia.pautas ?? []
  const [apuracao, historicoParticipacao] = await Promise.all([
    getApuracaoAssembleia(assembleiaId, pautas, assembleia.condominio_id).catch(() => null),
    getHistoricoParticipacao(assembleiaId, pautas.length).catch(() => []),
  ])
  if (!apuracao) notFound()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">
            Apuração — {condominio.nome}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{assembleia.titulo}</h1>
        </div>
        {/* proprietarios=[] de propósito: em somenteLeitura a fileira de ações
            (que usaria a lista pro Disparar/Anular) não é renderada. `canExport`
            por perfil habilita o controle pauta-por-pauta (toggle + abrir/fechar
            cada pauta) pro operador; visualizador vê só leitura. */}
        <ApuracaoAssembleia
          assembleia={assembleia}
          condominioId={assembleia.condominio_id}
          apuracao={apuracao}
          proprietarios={[]}
          canExport={podeOperar}
          criterioPeso={condominio.criterio_peso}
          somenteLeitura
          historicoSlot={<HistoricoParticipacao historico={historicoParticipacao} />}
        />
      </div>
    </div>
  )
}
