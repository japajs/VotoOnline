"use client"

import { useTransition } from "react"
import { Download, FileSpreadsheet, FileText, Printer, Trash2, Scale, Lock, BellRing } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DonutChart } from "@/components/ui/donut-chart"
import { EditarAssembleiaDialog } from "@/components/assembleias/editar-assembleia-dialog"
import { AdicionarPautaDialog } from "@/components/assembleias/adicionar-pauta-dialog"
import { EditarPautaDialog } from "@/components/assembleias/editar-pauta-dialog"
import { RegistrarVotoManualDialog } from "@/components/assembleias/registrar-voto-manual-dialog"
import { ProcuracoesDialog } from "@/components/assembleias/procuracoes-dialog"
import { excluirPautaAction } from "@/app/actions/assembleias"
import { notificarNaoVotaramAction } from "@/app/actions/assembleia-votos"
import { APP_NAME } from "@/lib/constants"
import { pluralImovel } from "@/lib/format"
import {
  STATUS_EXIBIDO_LABEL as STATUS_LABEL,
  STATUS_EXIBIDO_CLASS as STATUS_CLASS,
  type StatusExibido,
} from "@/lib/assembleia-status"
import type { Assembleia, AssembleiaApuracao, CriterioPeso, PautaApuracao, PautaStatus } from "@/types"

const PAUTA_STATUS_LABEL: Record<PautaStatus, string> = {
  rascunho: "Rascunho",
  aberta: "Aberta",
  em_votacao: "Em votação",
  encerrada: "Encerrada",
}

const PAUTA_STATUS_CLASS: Record<PautaStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aberta: "bg-emerald-500/15 text-emerald-500",
  em_votacao: "bg-indigo-500/15 text-indigo-500",
  encerrada: "bg-rose-500/15 text-rose-500",
}

interface Props {
  assembleia: Assembleia
  condominioId: string
  apuracao: AssembleiaApuracao
  canExport?: boolean
  // Critério do condomínio — define se o resultado ponderado é contado em
  // imóveis ou em fração ideal (ver formatPesoResultado).
  criterioPeso?: CriterioPeso
}

// Resultado ponderado: "N imóvel(is)" no critério por unidade; percentual da
// fração ideal do condomínio (fração de 1 × 100) no critério por fração ideal.
// Antes esta tela nem recebia o critério e mostrava "imóveis" sempre, mesmo
// com o condomínio em fração ideal.
function formatPesoResultado(valor: number, criterioPeso: CriterioPeso): string {
  if (criterioPeso === "fracao_ideal") {
    return `${(valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  }
  return `${valor} ${pluralImovel(valor)}`
}

function formatDateHora(dateString: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString))
}

function formatDate(dateString: string | null) {
  if (!dateString) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString))
}

export function ApuracaoAssembleia({
  assembleia,
  condominioId,
  apuracao,
  canExport = false,
  criterioPeso = "unidade",
}: Props) {
  const { total_enviados, total_respondidos } = apuracao
  const participacao =
    total_enviados > 0 ? Math.round((total_respondidos / total_enviados) * 100) : 0
  const pendentes = total_enviados - total_respondidos

  const [isPendingLembrete, startLembreteTransition] = useTransition()

  // Auditoria de assembleias — Fase 6: lembrete manual (sem cron/agendamento
  // neste projeto) pra quem ainda não registrou nenhum voto. Confirmação
  // antes de disparar — é um e-mail de verdade indo pra pessoas de verdade,
  // não uma ação só de dados.
  function handleNotificarNaoVotaram() {
    if (
      !confirm(
        `Enviar lembrete de votação por e-mail para ${pendentes} proprietário(s) que ainda não votou/votaram?`
      )
    )
      return
    startLembreteTransition(async () => {
      const result = await notificarNaoVotaramAction(assembleia.id)
      if (result.success) {
        toast.success(`${result.sent} lembrete(s) enviado(s).`)
      } else {
        toast.error(result.error)
      }
    })
  }

  const temVotos = apuracao.pautas.some(
    (p) =>
      p.por_participantes.sim + p.por_participantes.nao + p.por_participantes.abstencao > 0 ||
      (p.opcoes_resultado?.some((o) => o.participantes > 0) ?? false)
  )

  const statusExibido: StatusExibido =
    assembleia.status === "aberta" && temVotos ? "em_votacao" : assembleia.status

  return (
    <div className="space-y-6">
      {/* Cabeçalho de impressão — visível apenas no print */}
      <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-4 mb-2">
        <span className="text-lg font-bold text-gray-900">{APP_NAME}</span>
        <span className="text-xs text-gray-500">Sistema de Assembleias Eletrônicas para Condomínios</span>
      </div>

      {/* Cabeçalho da assembleia */}
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-5">
        <div className="flex flex-col gap-3">
          <div>
            {assembleia.descricao && (
              <p className="whitespace-pre-line text-justify text-sm text-muted-foreground">{assembleia.descricao}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {assembleia.pautas?.length ?? 0}{" "}
              {(assembleia.pautas?.length ?? 0) === 1 ? "pauta" : "pautas"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[statusExibido]}`}
            >
              {STATUS_LABEL[statusExibido]}
            </span>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {canExport && (
                <EditarAssembleiaDialog
                  assembleia={assembleia}
                  condominioId={condominioId}
                  temVotos={temVotos}
                />
              )}
              {canExport && assembleia.status === "aberta" && (
                <AdicionarPautaDialog assembleiaId={assembleia.id} condominioId={condominioId} />
              )}
              {canExport && assembleia.status === "aberta" && pendentes > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNotificarNaoVotaram}
                  disabled={isPendingLembrete}
                  className="gap-1.5"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  Lembrar quem não votou ({pendentes})
                </Button>
              )}
              {canExport && assembleia.status === "aberta" && (
                <RegistrarVotoManualDialog
                  assembleiaId={assembleia.id}
                  assembleiaTitulo={assembleia.titulo}
                  condominioId={condominioId}
                  pautas={assembleia.pautas ?? []}
                />
              )}
              {canExport && assembleia.status === "aberta" && (
                <ProcuracoesDialog assembleiaId={assembleia.id} condominioId={condominioId} />
              )}
              {canExport && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement("a")
                      a.href = `/api/relatorios/apuracao/${assembleia.id}/pdf`
                      a.click()
                    }}
                    className="gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement("a")
                      a.href = `/api/relatorios/apuracao/${assembleia.id}/xlsx`
                      a.click()
                    }}
                    className="gap-1.5"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </Button>
                  {/* Auditoria de assembleias — Fase 3: ata só faz sentido
                      depois que a assembleia encerra (é o documento final,
                      não um relatório parcial). */}
                  {assembleia.status === "encerrada" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const a = document.createElement("a")
                        a.href = `/api/relatorios/apuracao/${assembleia.id}/ata`
                        a.click()
                      }}
                      className="gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ata
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 border-t border-border/40 pt-3 text-xs text-muted-foreground">
          <div>
            <span className="font-medium">Abertura:</span>{" "}
            {formatDate(assembleia.data_abertura)}
          </div>
          <div>
            <span className="font-medium">Encerramento:</span>{" "}
            {formatDate(assembleia.data_encerramento)}
          </div>
          <div>
            <span className="font-medium">Última alteração:</span>{" "}
            {formatDateHora(assembleia.updated_at)}
          </div>
        </div>
      </div>

      {/* Participação geral */}
      <div className="rounded-xl border border-border/60 bg-card">
        <div className="grid grid-cols-3 divide-x divide-border/40">
          <div className="px-5 py-4 text-center">
            <p className="text-2xl font-semibold tabular-nums">{total_enviados}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Convites enviados</p>
          </div>
          <div className="px-5 py-4 text-center">
            <p className="text-2xl font-semibold tabular-nums">{total_respondidos}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Responderam</p>
          </div>
          <div className="px-5 py-4 text-center">
            <p className="text-2xl font-semibold tabular-nums">{participacao}%</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Participação</p>
          </div>
        </div>

        {/* Auditoria de assembleias — Fase 1: quórum mínimo é sobre o peso do
            CONDOMÍNIO INTEIRO (todas as unidades), diferente da Participação
            acima (que é só sobre quem recebeu convite). Só aparece quando a
            assembleia tem assembleia.quorum_minimo configurado. */}
        {apuracao.percentual_quorum !== null && (
          <div className="flex items-center justify-between gap-3 border-t border-border/40 px-5 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Scale className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span>
                Quórum do condomínio{" "}
                {apuracao.convocacao_aplicada !== null && `(${apuracao.convocacao_aplicada}ª convocação)`}:{" "}
                {Math.round(apuracao.percentual_quorum * 100)}%
              </span>
            </div>
            {apuracao.quorum_atingido !== null && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  apuracao.quorum_atingido
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                }`}
              >
                {apuracao.quorum_atingido ? "Quórum atingido" : "Quórum não atingido"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Uma seção por pauta */}
      {apuracao.pautas.map((pautaApuracao, i) => (
        <PautaApuracaoSection
          key={pautaApuracao.pauta.id}
          index={i}
          item={pautaApuracao}
          condominioId={condominioId}
          assembleiaId={assembleia.id}
          canEdit={canExport}
          criterioPeso={criterioPeso}
        />
      ))}

      {!temVotos && (
        <p className="text-center text-sm text-muted-foreground">
          Nenhum voto registrado ainda.
        </p>
      )}
    </div>
  )
}

// Paleta cíclica para pautas de múltipla escolha (N opções variáveis).
const CORES_OPCOES = [
  { bar: "bg-indigo-500", text: "text-indigo-500", hex: "#6366f1" },
  { bar: "bg-sky-500", text: "text-sky-500", hex: "#0ea5e9" },
  { bar: "bg-emerald-500", text: "text-emerald-500", hex: "#22c55e" },
  { bar: "bg-fuchsia-500", text: "text-fuchsia-500", hex: "#d946ef" },
  { bar: "bg-orange-500", text: "text-orange-500", hex: "#f97316" },
  { bar: "bg-teal-500", text: "text-teal-500", hex: "#14b8a6" },
]

function PautaApuracaoSection({
  index,
  item,
  condominioId,
  assembleiaId,
  canEdit,
  criterioPeso,
}: {
  index: number
  item: PautaApuracao
  condominioId: string
  assembleiaId: string
  canEdit: boolean
  criterioPeso: CriterioPeso
}) {
  const { pauta } = item
  const [isPendingExcluir, startExcluirTransition] = useTransition()

  // Item 2 do pedido: só dá pra editar/excluir uma pauta individual
  // enquanto ELA MESMA ainda não tem voto (rascunho/aberta) — assim que
  // sobe para em_votacao/encerrada, o botão simplesmente some.
  const podeEditar = canEdit && (pauta.status === "rascunho" || pauta.status === "aberta")

  function handleExcluir() {
    if (!confirm(`Excluir a pauta "${pauta.titulo}"? Esta ação não pode ser desfeita.`)) return
    startExcluirTransition(async () => {
      const result = await excluirPautaAction({ pautaId: pauta.id, condominioId, assembleiaId })
      if (!result.success) toast.error(result.error)
    })
  }

  return (
    <div className="space-y-3">
      {/* Título da pauta */}
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-primary/60">
          Pauta {index + 1}
        </span>
        <h2 className="text-base font-semibold tracking-tight">{pauta.titulo}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAUTA_STATUS_CLASS[pauta.status]}`}
        >
          {PAUTA_STATUS_LABEL[pauta.status]}
        </span>
        {pauta.sigiloso && (
          <span
            className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
            title="Voto sigiloso — o detalhamento nominal fica oculto no PDF/Excel"
          >
            <Lock className="h-3 w-3" />
            Sigiloso
          </span>
        )}
        {podeEditar && (
          <div className="ml-auto flex items-center gap-0.5 print:hidden">
            <EditarPautaDialog pauta={pauta} assembleiaId={assembleiaId} condominioId={condominioId} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={handleExcluir}
              disabled={isPendingExcluir}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Excluir pauta</span>
            </Button>
          </div>
        )}
      </div>

      {pauta.descricao && <p className="whitespace-pre-line text-justify text-sm text-muted-foreground">{pauta.descricao}</p>}

      {pauta.tipo === "multipla_escolha" ? (
        <MultiplaEscolhaApuracao item={item} criterioPeso={criterioPeso} />
      ) : (
        <SimNaoApuracao item={item} criterioPeso={criterioPeso} />
      )}
    </div>
  )
}

function MultiplaEscolhaApuracao({ item, criterioPeso }: { item: PautaApuracao; criterioPeso: CriterioPeso }) {
  const { ponderado, opcoes_resultado = [] } = item

  const ordenadas = [...opcoes_resultado].sort((a, b) => b.ponderado - a.ponderado)
  const totalW = ordenadas.reduce((sum, o) => sum + o.ponderado, 0) + ponderado.abstencao
  const totalP = ordenadas.reduce((sum, o) => sum + o.participantes, 0) + item.por_participantes.abstencao
  const pctW = (n: number) => (totalW > 0 ? Math.round((n / totalW) * 100) : 0)

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {criterioPeso === "fracao_ideal" ? "Resultado ponderado (por fração ideal)" : "Resultado ponderado (por imóvel)"}
        </p>
        <span className="text-xs text-muted-foreground">
          {totalP} {totalP === 1 ? "participante" : "participantes"}
        </span>
      </div>
      <div className="space-y-3">
        {ordenadas.map((opcao, i) => {
          const cor = CORES_OPCOES[i % CORES_OPCOES.length]!
          return (
            <Bar
              key={opcao.opcao_id}
              label={opcao.label}
              count={opcao.ponderado}
              pct={pctW(opcao.ponderado)}
              colorBar={cor.bar}
              colorText={cor.text}
              unit="imóvel"
              unitPlural="imóveis"
              formatCount={(n) => formatPesoResultado(n, criterioPeso)}
            />
          )
        })}
        {item.por_participantes.abstencao > 0 && (
          <Bar
            label="Abstenção"
            count={ponderado.abstencao}
            pct={pctW(ponderado.abstencao)}
            colorBar="bg-amber-500"
            colorText="text-amber-500"
            unit="imóvel"
            unitPlural="imóveis"
            formatCount={(n) => formatPesoResultado(n, criterioPeso)}
          />
        )}
      </div>
    </div>
  )
}

function SimNaoApuracao({ item, criterioPeso }: { item: PautaApuracao; criterioPeso: CriterioPeso }) {
  const { por_participantes, ponderado, total_apartamentos_representados, aprovada } = item

  const totalP = por_participantes.sim + por_participantes.nao + por_participantes.abstencao
  const totalW = ponderado.sim + ponderado.nao + ponderado.abstencao

  const pctP = (n: number) => (totalP > 0 ? Math.round((n / totalP) * 100) : 0)
  const pctW = (n: number) => (totalW > 0 ? Math.round((n / totalW) * 100) : 0)

  const segmentsP = [
    { value: por_participantes.sim, color: "#22c55e" },
    { value: por_participantes.nao, color: "#ef4444" },
    { value: por_participantes.abstencao, color: "#f59e0b" },
  ]
  const segmentsW = [
    { value: ponderado.sim, color: "#22c55e" },
    { value: ponderado.nao, color: "#ef4444" },
    { value: ponderado.abstencao, color: "#f59e0b" },
  ]

  const vencedorP =
    totalP > 0
      ? por_participantes.sim > por_participantes.nao
        ? "SIM"
        : por_participantes.nao > por_participantes.sim
          ? "NÃO"
          : "EMPATE"
      : null

  // Auditoria de assembleias — Fase 1: `aprovada` já vem calculada do
  // servidor respeitando pauta.quorum_aprovacao (maioria simples, 2/3,
  // unanimidade etc.) — nunca mais ">50%" fixo aqui no client. Note que
  // isso responde "a pauta foi aprovada?", que pode divergir de "quem teve
  // mais votos" quando o quórum exigido é qualificado (ex.: 2/3): SIM pode
  // ter maioria simples e ainda assim a pauta ser REJEITADA.
  const rotuloAprovacao = aprovada === null ? "—" : aprovada ? "APROVADA" : "REJEITADA"

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Por participantes */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Por participantes
          </p>
          <div className="flex items-center gap-5">
            <DonutChart
              segments={segmentsP}
              centerLabel={vencedorP ?? "—"}
              centerSub={totalP > 0 ? `${totalP} votos` : "sem votos"}
            />
            <div className="flex-1 space-y-3">
              <Bar label="SIM" count={por_participantes.sim} pct={pctP(por_participantes.sim)} colorBar="bg-emerald-500" colorText="text-emerald-500" unit="pessoa" unitPlural="pessoas" />
              <Bar label="NÃO" count={por_participantes.nao} pct={pctP(por_participantes.nao)} colorBar="bg-rose-500" colorText="text-rose-500" unit="pessoa" unitPlural="pessoas" />
              <Bar label="ABST." count={por_participantes.abstencao} pct={pctP(por_participantes.abstencao)} colorBar="bg-amber-500" colorText="text-amber-500" unit="pessoa" unitPlural="pessoas" />
            </div>
          </div>
        </div>

        {/* Ponderado */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Resultado ponderado
            </p>
            <span className="text-[11px] text-muted-foreground">
              quórum exigido: {Math.round(item.pauta.quorum_aprovacao * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-5">
            <DonutChart
              segments={segmentsW}
              centerLabel={rotuloAprovacao}
              centerSub={formatPesoResultado(total_apartamentos_representados, criterioPeso)}
            />
            <div className="flex-1 space-y-3">
              <Bar label="SIM" count={ponderado.sim} pct={pctW(ponderado.sim)} colorBar="bg-emerald-500" colorText="text-emerald-500" unit="imóvel" unitPlural="imóveis" formatCount={(n) => formatPesoResultado(n, criterioPeso)} />
              <Bar label="NÃO" count={ponderado.nao} pct={pctW(ponderado.nao)} colorBar="bg-rose-500" colorText="text-rose-500" unit="imóvel" unitPlural="imóveis" formatCount={(n) => formatPesoResultado(n, criterioPeso)} />
              <Bar label="ABST." count={ponderado.abstencao} pct={pctW(ponderado.abstencao)} colorBar="bg-amber-500" colorText="text-amber-500" unit="imóvel" unitPlural="imóveis" formatCount={(n) => formatPesoResultado(n, criterioPeso)} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Bar({
  label,
  count,
  pct,
  colorBar,
  colorText,
  unit,
  unitPlural,
  formatCount,
}: {
  label: string
  count: number
  pct: number
  colorBar: string
  colorText: string
  unit: string
  unitPlural: string
  formatCount?: (n: number) => string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className={`min-w-0 truncate font-medium ${colorText}`} title={label}>
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatCount ? formatCount(count) : `${count} ${count === 1 ? unit : unitPlural}`}
          <span className="ml-1 text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${colorBar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
