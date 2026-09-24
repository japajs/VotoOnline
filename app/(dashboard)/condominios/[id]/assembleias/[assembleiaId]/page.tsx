import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getApuracaoAssembleia } from "@/services/assembleia-votos"
import { getHistoricoParticipacao } from "@/services/relatorios"
import { ApuracaoAssembleia } from "@/components/assembleias/apuracao-assembleia"
import { HistoricoParticipacao } from "@/components/assembleias/historico-participacao"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { ROUTES } from "@/lib/constants"

interface Props {
  params: Promise<{ id: string; assembleiaId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assembleiaId } = await params
  try {
    const assembleia = await getAssembleiaById(assembleiaId)
    return { title: assembleia?.titulo ?? "Apuração" }
  } catch {
    return { title: "Apuração" }
  }
}

export default async function ApuracaoAssembleiaPage({ params }: Props) {
  const { id: condominioId, assembleiaId } = await params

  const [session, condominio, assembleia] = await Promise.all([
    getSession(),
    getCondominioById(condominioId).catch(() => null),
    getAssembleiaById(assembleiaId).catch(() => null),
  ])

  if (!condominio || !assembleia) notFound()

  // Escopo por condomínio (MASTER/PESSOAL): mesma checagem da página de
  // detalhe do condomínio — sem ela, um usuário PESSOAL conseguia ver a
  // apuração de uma assembleia fora do seu escopo só sabendo a URL.
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) notFound()

  const pautas = assembleia.pautas ?? []

  const apuracao = await getApuracaoAssembleia(assembleiaId, pautas, condominioId).catch(() => ({
    pautas: pautas.map((p) => ({
      pauta: p,
      por_participantes: { sim: 0, nao: 0, abstencao: 0 },
      ponderado: { sim: 0, nao: 0, abstencao: 0 },
      total_apartamentos_representados: 0,
      percentual_aprovacao: null,
      aprovada: null,
    })),
    total_enviados: 0,
    total_respondidos: 0,
    peso_total_condominio: 0,
    peso_representado: 0,
    percentual_quorum: null,
    quorum_atingido: null,
    convocacao_aplicada: null,
    quorum_aplicavel: null,
  }))

  const historicoParticipacao = await getHistoricoParticipacao(assembleiaId, pautas.length).catch(
    () => []
  )

  return (
    <div className="flex flex-col gap-8 p-6 pt-8">
      {/* Back */}
      <Link
        href={`${ROUTES.condominios}/${condominioId}`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {condominio.nome}
      </Link>

      {/* Heading */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Apuração</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{assembleia.titulo}</h1>
      </div>

      <ApuracaoAssembleia
        assembleia={assembleia}
        condominioId={condominioId}
        apuracao={apuracao}
        canExport={session?.perfil !== "visualizador"}
        criterioPeso={condominio.criterio_peso}
      />

      <HistoricoParticipacao historico={historicoParticipacao} />
    </div>
  )
}
