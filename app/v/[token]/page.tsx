import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { CheckCircle2, Clock, PauseCircle } from "lucide-react"
import { isVotacaoAberta } from "@/lib/assembleia-status"
import {
  getAssembleiaSendByToken,
  getRespostasBySendId,
  getApuracaoAssembleia,
  getParticipacaoParcial,
} from "@/services/assembleia-votos"
import { updateAssembleiaStatus } from "@/services/assembleias"
import { getConfiguracao } from "@/services/configuracoes"
import { getCondominioById } from "@/services/condominios"
import { getVotosDetalhados } from "@/services/relatorios"
import { AssembleiaVotoForm } from "@/components/assembleias/assembleia-voto-form"
import { ResultadoAssembleia } from "@/components/assembleias/resultado-assembleia"
import { APP_NAME } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limit"

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  try {
    const send = await getAssembleiaSendByToken(token)
    return { title: send?.assembleia?.titulo ?? APP_NAME }
  } catch {
    return { title: APP_NAME }
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

export default async function PublicVotoPage({ params }: Props) {
  const { token } = await params

  // Achado de auditoria LGPD: esta rota resolvia o token sem nenhum limite de
  // tentativas. Mesmo com o token tendo entropia alta (crypto.randomUUID,
  // 122 bits), fica sem essa camada de defesa a mais. Usa notFound() em vez
  // de uma mensagem de "muitas tentativas" para não criar um sinal que
  // diferencie "limite excedido" de "token inexistente" — a resposta
  // uniforme contra enumeração já era um ponto forte do sistema.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  if (!(await checkRateLimit(`voto-view:${ip}`))) notFound()

  let send
  try {
    send = await getAssembleiaSendByToken(token)
  } catch {
    notFound()
  }
  if (!send || !send.assembleia) notFound()

  const assembleia = send.assembleia
  const pautas = assembleia.pautas ?? []

  // Votação parcial/complementar (item 4/5): "já votou" não é mais um estado
  // binário — um participante pode ter respondido só parte das pautas (ex.:
  // uma pauta nova foi adicionada depois). `pautasPendentes` é o que falta
  // para ELE especificamente; pautas já respondidas nunca reaparecem aqui,
  // então não há como sobrescrever um voto já registrado.
  let pautasPendentes = pautas
  try {
    const respostas = await getRespostasBySendId(send.id)
    const respondidas = new Set(respostas.map((r) => r.pauta_id))
    pautasPendentes = pautas.filter((p) => !respondidas.has(p.id))
  } catch {
    // DB unique constraint prevents double votes even if this check fails
  }
  const alreadyAnswered = pautasPendentes.length === 0

  let status = assembleia.status

  if (
    isVotacaoAberta(status) &&
    assembleia.data_encerramento &&
    new Date(assembleia.data_encerramento) < new Date()
  ) {
    const autoClose = await getConfiguracao("votacao_encerramento_automatico").catch(() => null)
    if (autoClose === "true") {
      await updateAssembleiaStatus(assembleia.id, "encerrada").catch(() => {})
      status = "encerrada"
    }
  }

  const header = (
    <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{APP_NAME}</p>
      </div>
    </div>
  )

  const heading = (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">
        Assembleia de condomínio
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{assembleia.titulo}</h1>
      {assembleia.descricao && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{assembleia.descricao}</p>
      )}
    </div>
  )

  // ── Situação 1: Rascunho — votação ainda não iniciada ──────────────────────
  if (status === "rascunho") {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Votação ainda não iniciada</p>
              {assembleia.data_abertura ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Abertura prevista para{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(assembleia.data_abertura)}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  A data de abertura será informada em breve.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Situação 4: Encerrada — exibir resultados ──────────────────────────────
  if (status === "encerrada") {
    const [apuracao, condominio, votosDetalhados] = await Promise.all([
      getApuracaoAssembleia(assembleia.id, pautas, assembleia.condominio_id).catch(() => null),
      getCondominioById(assembleia.condominio_id).catch(() => null),
      getVotosDetalhados(assembleia.id).catch(() => []),
    ])

    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          {apuracao ? (
            <ResultadoAssembleia
              condominio_nome={assembleia.condominio_nome ?? null}
              data_abertura={assembleia.data_abertura ?? null}
              data_encerramento={assembleia.data_encerramento ?? null}
              apuracao={apuracao}
              criterioPeso={condominio?.criterio_peso ?? "unidade"}
              votosDetalhados={votosDetalhados.map(({ email: _email, ...v }) => v)}
            />
          ) : (
            <div className="rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Resultado em processamento. Tente novamente em instantes.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Situação 3: Em andamento + já votou ────────────────────────────────────
  if (alreadyAnswered) {
    // Achado de auditoria original: só mostrava QUEM já votou, nunca o
    // placar — evitar influenciar quem ainda vai votar. Pedido do usuário:
    // quem JÁ votou pode ver o boletim completo (o voto dele já está
    // travado, não tem como o placar influenciar uma escolha que já foi
    // feita) — só quem ainda não votou continua sem ver nada disso, porque
    // nem chega nesta tela (cai na Situação 2, o formulário de voto).
    const [participacao, apuracao, condominio, votosDetalhados] = await Promise.all([
      getParticipacaoParcial(assembleia.id).catch(() => null),
      getApuracaoAssembleia(assembleia.id, pautas, assembleia.condominio_id).catch(() => null),
      getCondominioById(assembleia.condominio_id).catch(() => null),
      getVotosDetalhados(assembleia.id).catch(() => []),
    ])

    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/20">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <p className="font-medium">Seu voto foi registrado com sucesso</p>
              <p className="mt-1 text-sm text-muted-foreground">Obrigado por participar.</p>
            </div>
            <div className="w-full rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Status da assembleia</p>
              {status === "pausada" ? (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Pausada temporariamente
                </p>
              ) : (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Em andamento
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                O resultado pode mudar até o encerramento — o boletim abaixo é parcial.
              </p>
            </div>

            {participacao && (
              <div className="w-full rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-center text-sm">
                <p className="font-medium text-foreground">
                  {participacao.totalVotaram}{" "}
                  {participacao.totalVotaram === 1 ? "pessoa já votou" : "pessoas já votaram"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quórum e % de participação do condomínio: no quadro abaixo. Quem votou e como,
                  pauta a pauta: no "Detalhamento dos votos".
                </p>
              </div>
            )}
          </div>

          {apuracao && (
            <div className="mt-6">
              <ResultadoAssembleia
                condominio_nome={assembleia.condominio_nome ?? null}
                data_abertura={assembleia.data_abertura ?? null}
                data_encerramento={assembleia.data_encerramento ?? null}
                apuracao={apuracao}
                criterioPeso={condominio?.criterio_peso ?? "unidade"}
                votosDetalhados={votosDetalhados.map(({ email: _email, ...v }) => v)}
                parcial
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Situação 5: Pausada + ainda não votou ──────────────────────────────────
  // Suspensão temporária de novos votos (ex.: síndico corrigindo algo),
  // diferente de "encerrada" (definitivo) — quem já votou nunca cai aqui,
  // continua vendo a confirmação normal (Situação 3 acima).
  if (status === "pausada") {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/20">
              <PauseCircle className="h-7 w-7 text-amber-500" />
            </div>
            <div>
              <p className="font-medium">Votação pausada temporariamente</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O síndico suspendeu o recebimento de novos votos por um momento. Volte a este
                link mais tarde para votar.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Situação 2: Em andamento + ainda não votou ─────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {header}
      <div className="mx-auto max-w-2xl px-4 py-10">
        {heading}
        <AssembleiaVotoForm
          sendId={send.id}
          pautas={pautasPendentes}
          assembleiaTitulo={assembleia.titulo}
        />
      </div>
    </div>
  )
}
