import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCondominioById } from "@/services/condominios"
import { getAllProprietarios } from "@/services/proprietarios"
import { getAllAssembleias } from "@/services/assembleias"
import {
  getProprietariosQueJaVotaram,
  getProprietarioIdsVotaram,
  getProprietarioIdsPresentes,
  getPautasVotadasPorProprietario,
} from "@/services/assembleia-votos"
import { getProcuracoesByAssembleia } from "@/services/procuracoes"
import { isEmAndamento } from "@/lib/assembleia-status"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { CriarProprietarioDialog } from "@/components/proprietarios/criar-proprietario-dialog"
import { ProprietariosList } from "@/components/proprietarios/proprietarios-list"
import { CriarAssembleiaDialog } from "@/components/assembleias/criar-assembleia-dialog"
import { AssembleiasList } from "@/components/assembleias/assembleias-list"
import { CondominioInfoCard } from "@/components/condominios/condominio-info-card"
import { ExportarProprietariosButton } from "@/components/condominios/exportar-proprietarios-button"
import { FracaoEscalaAviso } from "@/components/condominios/fracao-escala-aviso"
import { detectarDivisorEscalaFracaoIdeal } from "@/lib/peso"
import { ROUTES } from "@/lib/constants"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const condo = await getCondominioById(id)
    return { title: condo?.nome ?? "Condomínio" }
  } catch {
    return { title: "Condomínio" }
  }
}

export default async function CondominioDetailPage({ params }: Props) {
  const { id } = await params

  const condominio = await getCondominioById(id).catch(() => null)
  if (!condominio) notFound()

  // Escopo por condomínio (MASTER/PESSOAL): a listagem de condomínios já só
  // mostra o que o usuário tem acesso, mas isso sozinho não impede acesso
  // direto por URL — a checagem real precisa estar aqui também.
  const acesso = await requireAcessoCondominio(id)
  if (!acesso.ok) notFound()

  const [proprietarios, assembleias, proprietariosQueJaVotaram, session] = await Promise.all([
    getAllProprietarios(id).catch(() => []),
    getAllAssembleias(id).catch(() => []),
    getProprietariosQueJaVotaram(id).catch(() => new Set<string>()),
    getSession(),
  ])

  // Marcar quem já votou NA ASSEMBLEIA ABERTA agora (não "em qualquer") direto
  // na lista de proprietários, pra filtrar/cobrar sem precisar ir à apuração.
  const assembleiaAberta = assembleias.find((a) => isEmAndamento(a.status))
  const [votouNaAberta, presentesNaAberta, pautasVotadasNaAberta, outorgantesNaAberta] =
    assembleiaAberta
      ? await Promise.all([
          getProprietarioIdsVotaram(assembleiaAberta.id).catch(() => new Set<string>()),
          getProprietarioIdsPresentes(assembleiaAberta.id).catch(() => new Set<string>()),
          getPautasVotadasPorProprietario(assembleiaAberta.id).catch(() => new Map<string, number>()),
          // Quem outorgou procuração: não pode ser marcado presente (quem
          // participa é o procurador) — a presença fica desabilitada na lista.
          getProcuracoesByAssembleia(assembleiaAberta.id)
            .then((ps) => new Set(ps.map((p) => p.outorgante_id)))
            .catch(() => new Set<string>()),
        ])
      : [undefined, undefined, undefined, undefined]

  // Denominador do "voto total" (vs. parcial): no modo pauta-por-pauta só
  // contam as pautas já abertas pela mesa — as demais ninguém poderia ter
  // votado ainda, então quem votou em tudo que estava disponível aparece como
  // "Votou" (total), não "Parcial". No modo normal, todas as pautas valem.
  const totalPautasVotaveis = assembleiaAberta
    ? assembleiaAberta.votacao_por_pauta
      ? (assembleiaAberta.pautas ?? []).filter((p) => p.votacao_aberta_em != null).length
      : (assembleiaAberta.pautas ?? []).length
    : undefined

  // Escala das frações ideais cadastradas (ver FracaoEscalaAviso).
  const fracoesCadastradas = proprietarios
    .flatMap((p) => p.unidades ?? [])
    .map((u) => u.fracao_ideal)
    .filter((f): f is number => f !== null && f !== undefined)
  const somaFracoes = fracoesCadastradas.reduce((acc, f) => acc + f, 0)
  const divisorEscalaFracao = detectarDivisorEscalaFracaoIdeal(somaFracoes)

  return (
    <div className="flex flex-col gap-6 p-6 pt-8">
      {/* Back */}
      <Link
        href={ROUTES.condominios}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Condomínios
      </Link>

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{condominio.nome}</h1>
      </div>

      {/* Informações do condomínio */}
      <CondominioInfoCard condominio={condominio} />

      {fracoesCadastradas.length > 0 && divisorEscalaFracao !== 1 && (
        <FracaoEscalaAviso condominioId={id} soma={somaFracoes} divisor={divisorEscalaFracao} />
      )}

      {/* Assembleias */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Assembleias</h2>
            <p className="text-sm text-muted-foreground">
              {assembleias.length}{" "}
              {assembleias.length === 1 ? "assembleia criada" : "assembleias criadas"}
            </p>
          </div>
          <div className="shrink-0">
            <CriarAssembleiaDialog condominioId={id} />
          </div>
        </div>
        <AssembleiasList
          assembleias={assembleias}
          condominioId={id}
          proprietarios={proprietarios}
          podeOperar={session?.perfil !== "visualizador"}
        />
      </section>

      {/* Proprietários */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Proprietários</h2>
            <p className="text-sm text-muted-foreground">
              {proprietarios.length}{" "}
              {proprietarios.length === 1 ? "proprietário" : "proprietários"} · o peso de cada voto{" "}
              {condominio.criterio_peso === "fracao_ideal"
                ? "é calculado pela fração ideal das unidades vinculadas"
                : "é calculado pelo número de unidades vinculadas"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {proprietarios.length > 0 && (
              <ExportarProprietariosButton condominioId={id} condominioNome={condominio.nome} />
            )}
            <CriarProprietarioDialog condominioId={id} />
          </div>
        </div>
        <ProprietariosList
          proprietarios={proprietarios}
          condominioId={id}
          proprietariosQueJaVotaram={proprietariosQueJaVotaram}
          votouNaAberta={votouNaAberta}
          presentesNaAberta={presentesNaAberta}
          pautasVotadasNaAberta={pautasVotadasNaAberta}
          outorgantesNaAberta={outorgantesNaAberta}
          totalPautasVotaveis={totalPautasVotaveis}
          assembleiaAbertaId={assembleiaAberta?.id}
          assembleiaAbertaTitulo={assembleiaAberta?.titulo}
          isAdmin={session?.perfil === "administrador"}
          podeEditar={session?.perfil !== "visualizador"}
          criterioPeso={condominio.criterio_peso}
        />
      </section>
    </div>
  )
}
