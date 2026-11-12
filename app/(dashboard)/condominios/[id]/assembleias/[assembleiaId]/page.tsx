import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getApuracaoAssembleia, getProprietariosQueJaVotaram } from "@/services/assembleia-votos"
import { getHistoricoParticipacao } from "@/services/relatorios"
import { getAllProprietarios } from "@/services/proprietarios"
import { getDadosParticipantes, type DadosParticipantes } from "@/services/participantes"
import { ApuracaoAssembleia } from "@/components/assembleias/apuracao-assembleia"
import { ApuracaoTela } from "@/components/assembleias/apuracao-tela"
import { HistoricoParticipacao } from "@/components/assembleias/historico-participacao"
import { ProprietariosList } from "@/components/proprietarios/proprietarios-list"
import { isEmAndamento } from "@/lib/assembleia-status"
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
      empate: false,
    })),
    total_enviados: 0,
    total_respondidos: 0,
    imoveis_cadastrados: 0,
    imoveis_votantes: 0,
    imoveis_presentes: 0,
    imoveis_votaram_tudo: 0,
    imoveis_parcial: 0,
    imoveis_nao_votaram: 0,
    peso_total_condominio: 0,
    peso_representado: 0,
    percentual_quorum: null,
    quorum_atingido: null,
    convocacao_aplicada: null,
    quorum_aplicavel: null,
  }))

  // Participação (ordenada por imóvel), a lista de proprietários (botão
  // "Disparar" + aba "Participantes" do Modo exibir) e os dados da chamada
  // (presença/votos/procurações) pra essa aba. Em paralelo.
  const emAndamento = isEmAndamento(assembleia.status)
  const [historicoParticipacao, proprietarios, dados, proprietariosQueJaVotaram] =
    await Promise.all([
      getHistoricoParticipacao(assembleiaId, pautas.length).catch(() => []),
      getAllProprietarios(condominioId).catch(() => []),
      // Só carrega os dados da chamada quando a assembleia está em andamento: a
      // ProprietariosList só mostra voto/presença com assembleiaAbertaId (abaixo),
      // que fica undefined fora de aberta/pausada — então pra encerrada/rascunho
      // esses dados seriam ignorados. Evita as queries à toa.
      getDadosParticipantes(emAndamento ? assembleia : null).catch((): DadosParticipantes => ({})),
      getProprietariosQueJaVotaram(condominioId).catch(() => new Set<string>()),
    ])

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
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Assembleia</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{assembleia.titulo}</h1>
      </div>

      {/* Tela da assembleia FUNDIDA (letra B, validada pelo Carlos): UMA tela
          principal — a LISTA (participantes/chamada) — com a barra de ações
          sempre no topo; a APURAÇÃO (resultados) virou um item do "Relatórios ▾"
          que alterna a visão, não mais uma aba. Encerrada abre direto nos
          resultados; em andamento/rascunho abre na lista (operação ao vivo).
          A lista é plena com a assembleia em andamento (aberta/pausada) — fora
          disso vira a lista simples, sem os badges de voto/presença (a
          ProprietariosList os gateia por assembleiaAbertaId). */}
      <ApuracaoTela
        apuracaoInicial={assembleia.status === "encerrada"}
        apuracao={
          <ApuracaoAssembleia
            assembleia={assembleia}
            condominioId={condominioId}
            apuracao={apuracao}
            proprietarios={proprietarios}
            canExport={session?.perfil !== "visualizador"}
            criterioPeso={condominio.criterio_peso}
            historicoSlot={<HistoricoParticipacao historico={historicoParticipacao} />}
          />
        }
        participantes={
          <ProprietariosList
            proprietarios={proprietarios}
            condominioId={condominioId}
            condominioNome={condominio.nome}
            proprietariosQueJaVotaram={proprietariosQueJaVotaram}
            votouNaAberta={dados.votou}
            presentesNaAberta={dados.presentes}
            pautasVotadasNaAberta={dados.pautasVotadas}
            totalPautasVotaveis={dados.totalPautasVotaveis}
            outorgantesNaAberta={dados.outorgantes}
            outorgantesComRepVotouNaAberta={dados.outorgantesComRepVotou}
            participantesNaAberta={dados.participantes}
            emailProblemaNaAberta={dados.emailProblema}
            assembleiaAbertaId={emAndamento ? assembleia.id : undefined}
            assembleiaAbertaTitulo={emAndamento ? assembleia.titulo : undefined}
            pautasDaAberta={emAndamento ? assembleia.pautas : undefined}
            isAdmin={session?.perfil === "administrador"}
            podeEditar={session?.perfil !== "visualizador"}
            criterioPeso={condominio.criterio_peso}
          />
        }
      />
    </div>
  )
}
