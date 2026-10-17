import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, Clock, PauseCircle, ShieldCheck, Ban } from "lucide-react"
import { isVotacaoAberta } from "@/lib/assembleia-status"
import { outorgouProcuracao } from "@/services/procuracoes"
import { isProprietarioInadimplente } from "@/services/proprietarios"
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
import { VotoPautaPorPautaLive } from "@/components/assembleias/voto-pauta-por-pauta-live"
import { ResultadoAssembleia } from "@/components/assembleias/resultado-assembleia"
import type { EstadoVoto } from "@/app/actions/assembleia-votos"
import { APP_NAME, APP_AUTORIA } from "@/lib/constants"
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit"

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

  // Limite de tentativas por TOKEN (não por IP): numa assembleia presencial
  // dezenas de pessoas abrem o link do mesmo wi-fi (mesmo IP) — limitar por IP
  // bloquearia condôminos legítimos. O token tem 122 bits (crypto.randomUUID),
  // impossível de adivinhar, então o limite por token já protege contra alguém
  // martelar um mesmo link. notFound() em vez de "muitas tentativas" mantém a
  // resposta uniforme contra enumeração.
  if (!(await checkRateLimit(rateLimitKey.votoView(token)))) notFound()

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
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        {/* Autoria/licenciamento também no link de votação (pedido do Cleiton):
            deixa claro pro condômino que a ferramenta é proprietária. Completo
            no tablet, curto no celular. */}
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{APP_NAME}</p>
          <p className="truncate text-[10px] text-muted-foreground/60">
            <span className="hidden sm:inline">{APP_AUTORIA}</span>
            <span className="sm:hidden">© Cleiton Salazar</span>
          </p>
        </div>
        <Link
          href="/privacidade"
          className="shrink-0 text-[11px] text-muted-foreground/70 underline underline-offset-2 hover:text-foreground"
        >
          Privacidade
        </Link>
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

  // ── Outorgante: delegou o voto por procuração ──────────────────────────────
  // Quem outorgou procuração nesta assembleia NÃO vota por si — quem vota é o
  // representante. Bloqueia JÁ NO ACESSO (pedido do Carlos: não deixar o
  // outorgante achar que vai votar e só avisar na confirmação). Vem depois da
  // tela de "encerrada" (aí ele ainda pode ver o resultado), antes de qualquer
  // tela de voto.
  if (await outorgouProcuracao(assembleia.id, send.proprietario_id).catch(() => false)) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          <div className="flex flex-col items-center gap-4 rounded-xl border border-amber-400/40 bg-amber-500/5 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/20">
              <ShieldCheck className="h-7 w-7 text-amber-500" />
            </div>
            <div>
              <p className="font-medium">Você outorgou procuração nesta assembleia</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Seu voto será dado pelo seu representante. Por isso, você não vota por este link.
              </p>
            </div>
          </div>
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

  // ── Inadimplente: não vota (Código Civil, art. 1.335, §único) ──────────────
  // Barra JÁ NO ACESSO, antes de qualquer formulário (pedido do Carlos:
  // "inadimplente não vota de forma alguma; pra liberar, a mesa remove o
  // status"). O voto em si também bloqueia no núcleo (validarVotoOuFalhar) —
  // isto é defesa em camadas + deixa claro na tela, em vez de só errar ao
  // confirmar. Vem depois do "já votou" (quem votou antes de ser marcado vê o
  // resultado) e antes de qualquer tela de voto.
  if (await isProprietarioInadimplente(send.proprietario_id).catch(() => false)) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          <div className="flex flex-col items-center gap-4 rounded-xl border border-rose-400/40 bg-rose-500/5 px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-400/10 ring-1 ring-rose-400/20">
              <Ban className="h-7 w-7 text-rose-500" />
            </div>
            <div>
              <p className="font-medium">Você consta como inadimplente</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Por isso, não é possível votar nesta assembleia. Em caso de dúvida, procure a
                administração/mesa da assembleia.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Votação pauta por pauta (Fase 2): tela ao vivo, só a pauta aberta ──────
  // Quando a assembleia roda pauta por pauta e o participante ainda não
  // respondeu tudo, a tela mostra só a pauta que a mesa abriu agora, deixa
  // votar pauta a pauta e se atualiza sozinha (inclusive trata pausada). Vem
  // antes das situações 5 e 2, que são o fluxo clássico (todas as pautas de
  // uma vez) quando o modo está desligado.
  if (assembleia.votacao_por_pauta) {
    const pendentesSet = new Set(pautasPendentes.map((p) => p.id))
    const inicial: EstadoVoto = {
      status,
      votacaoPorPauta: true,
      sendId: send.id,
      pautas: [...pautas]
        .sort((a, b) => a.ordem - b.ordem)
        .map((p) => ({
          id: p.id,
          ordem: p.ordem,
          titulo: p.titulo,
          descricao: p.descricao,
          tipo: p.tipo,
          permite_abstencao: p.permite_abstencao,
          opcoes: (p.opcoes ?? []).map((o) => ({ id: o.id, label: o.label })),
          votacaoAberta: p.votacao_aberta ?? false,
          jaVotou: !pendentesSet.has(p.id),
        })),
    }
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-4 py-10">
          {heading}
          <VotoPautaPorPautaLive
            token={token}
            assembleiaTitulo={assembleia.titulo}
            inicial={inicial}
          />
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
