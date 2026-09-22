"use client"

import { Fragment, useRef, useState, useTransition } from "react"
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Loader2,
  Plus,
  UploadCloud,
  X,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatCelular } from "@/lib/format"
import { parseFileRaw } from "@/lib/importacao/parser"
import { detectarColunas, aplicarMapeamento } from "@/lib/importacao/mapper"
import { processarLinhas } from "@/lib/importacao/processor"
import {
  executarImportacaoAction,
  type ImportacaoResultado,
} from "@/app/actions/importacao"
import { createCondominioAction } from "@/app/actions/condominios"
import { ROUTES } from "@/lib/constants"
import type {
  CampoImportacao,
  Condominio,
  ImportacaoErro,
  ImportacaoPreview,
  LeituraArquivo,
} from "@/types"

// ─── Constantes ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: "condominio" as const, label: "Condomínio" },
  { id: "upload" as const, label: "Planilha" },
  { id: "mapeamento" as const, label: "Mapeamento" },
  { id: "preview" as const, label: "Revisão" },
  { id: "importando" as const, label: "Importando" },
  { id: "resultado" as const, label: "Resultado" },
]

type Step = (typeof STEPS)[number]["id"]

const CAMPO_LABELS: Record<CampoImportacao, string> = {
  imovel: "Imóvel",
  nome: "Nome",
  whatsapp: "WhatsApp / Telefone",
  email: "E-mail",
  inadimplente: "Restrição / Inadimplente",
  fracaoIdeal: "Fração ideal",
  cpf: "CPF/CNPJ",
  ignorar: "Ignorar coluna",
}

const CAMPOS_REQUERIDOS: CampoImportacao[] = ["imovel", "nome"]

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function formatTempo(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function stepIdx(step: Step): number {
  return STEPS.findIndex((s) => s.id === step)
}

// ─── Barra de progresso ───────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const idx = stepIdx(step)
  const pct = Math.round((idx / (STEPS.length - 1)) * 100)
  const label = STEPS[idx].label

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">
          Etapa {idx + 1} de {STEPS.length}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Mini steps */}
      <div className="flex items-center justify-between px-0.5">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            title={s.label}
            className={cn(
              "h-1 w-1 rounded-full transition-colors",
              i < idx
                ? "bg-primary"
                : i === idx
                  ? "bg-primary ring-2 ring-primary/30"
                  : "bg-border"
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function DropZone({
  arquivo,
  onChange,
}: {
  arquivo: File | null
  onChange: (f: File | null) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onChange(file)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
        isDragging
          ? "border-primary/60 bg-primary/5"
          : arquivo
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border hover:border-primary/40 hover:bg-accent/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          onChange(file)
          e.target.value = ""
        }}
      />

      {arquivo ? (
        <>
          <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
          <div className="text-center">
            <p className="text-sm font-medium">{arquivo.name}</p>
            <p className="text-xs text-muted-foreground">
              {(arquivo.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <UploadCloud
            className={cn(
              "h-8 w-8",
              isDragging ? "text-primary" : "text-muted-foreground/40"
            )}
          />
          <div className="text-center">
            <p className="text-sm font-medium">Arraste o arquivo aqui</p>
            <p className="text-xs text-muted-foreground">ou clique para selecionar</p>
            <p className="mt-1 text-xs text-muted-foreground/60">.xlsx ou .csv</p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tabela de mapeamento ─────────────────────────────────────────────────────

function MapeamentoTable({
  headers,
  mapeamento,
  onChange,
}: {
  headers: string[]
  mapeamento: Record<number, CampoImportacao>
  onChange: (colIdx: number, campo: CampoImportacao) => void
}) {
  const camposMapeados = Object.entries(mapeamento)
    .filter(([, c]) => c !== "ignorar")
    .map(([, c]) => c)

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
              Coluna da planilha
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
              Campo do sistema
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {headers.map((header, colIdx) => {
            const campo = mapeamento[colIdx] ?? "ignorar"
            const naoDetectado = campo === "ignorar"

            return (
              <tr
                key={colIdx}
                className={cn(
                  "transition-colors",
                  naoDetectado
                    ? "bg-amber-500/5 hover:bg-amber-500/10"
                    : "hover:bg-accent/30"
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {naoDetectado && (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span
                      className={cn(
                        "block max-w-[180px] truncate font-medium",
                        naoDetectado && "text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {header || `(coluna ${colIdx + 1})`}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={campo}
                    onChange={(e) =>
                      onChange(colIdx, e.target.value as CampoImportacao)
                    }
                    className={cn(
                      "flex h-10 w-full max-w-[220px] rounded-lg border px-2 py-1 text-xs outline-none transition-colors focus:ring-2 focus:ring-ring/50",
                      naoDetectado
                        ? "border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
                        : "border-input bg-background text-foreground"
                    )}
                  >
                    {(
                      Object.entries(CAMPO_LABELS) as [CampoImportacao, string][]
                    ).map(([val, lbl]) => {
                      const jaUsado =
                        val !== "ignorar" &&
                        val !== campo &&
                        camposMapeados.includes(val)
                      return (
                        <option key={val} value={val} disabled={jaUsado}>
                          {lbl}
                          {jaUsado ? " (já mapeado)" : ""}
                        </option>
                      )
                    })}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Cards de resumo ──────────────────────────────────────────────────────────

function SummaryCards({ preview }: { preview: ImportacaoPreview }) {
  const inadimplentes = preview.proprietarios.filter((p) => p.inadimplente).length
  const cards = [
    { label: "Linhas", value: preview.totalLinhas, color: "text-foreground" },
    { label: "Proprietários", value: preview.totalProprietarios, color: "text-blue-500" },
    { label: "Unidades", value: preview.totalUnidades, color: "text-violet-500" },
    { label: "Agrupadas", value: preview.duplicidades, color: "text-amber-500" },
    {
      label: "Inadimplentes",
      value: inadimplentes,
      color: inadimplentes > 0 ? "text-rose-500" : "text-muted-foreground",
    },
    {
      label: "Avisos",
      value: preview.erros.length,
      color: preview.erros.length > 0 ? "text-rose-500" : "text-muted-foreground",
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          className="rounded-xl border border-border/60 bg-card px-3 py-3 text-center"
        >
          <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Tabela de proprietários ──────────────────────────────────────────────────

// Quando a célula da planilha trazia mais de um e-mail/celular, `p.email`/
// `p.telefone` já vêm com o primeiro candidato como padrão — este seletor
// aparece só nessas linhas, para o usuário escolher qual valor manter antes
// de confirmar a importação.
function SeletorCandidato({
  candidatos,
  valorAtual,
  onEscolher,
  formatar,
}: {
  candidatos: string[]
  valorAtual: string | null
  onEscolher: (valor: string) => void
  formatar?: (v: string) => string
}) {
  return (
    <div className="mt-1 flex items-center gap-1 text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <select
        value={valorAtual ?? ""}
        onChange={(e) => onEscolher(e.target.value)}
        className="h-6 max-w-[160px] rounded border border-amber-400/60 bg-amber-50 px-1 text-[11px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
      >
        {candidatos.map((c) => (
          <option key={c} value={c}>
            {formatar ? formatar(c) : c}
          </option>
        ))}
      </select>
    </div>
  )
}

function ProprietariosTable({
  preview,
  onEscolherCandidato,
}: {
  preview: ImportacaoPreview
  onEscolherCandidato: (idx: number, campo: "email" | "telefone", valor: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <div className="max-h-[36vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border/60">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Nome
              </th>
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground md:table-cell">
                E-mail
              </th>
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground lg:table-cell">
                Celular
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Unidades
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Votos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {preview.proprietarios.map((p, i) => (
              <tr key={i} className="transition-colors hover:bg-accent/30">
                <td className="px-4 py-2.5 font-medium">
                  <div className="flex items-center gap-1.5">
                    {p.nome}
                    {p.inadimplente && (
                      <span
                        className="inline-flex items-center rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
                        title="Vem marcado como inadimplente na planilha — não poderá votar (Código Civil, art. 1.335)"
                      >
                        Inadimplente
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden max-w-[200px] px-4 py-2.5 text-muted-foreground md:table-cell">
                  <div className="truncate">{p.email ?? "—"}</div>
                  {p.emailCandidatos && (
                    <SeletorCandidato
                      candidatos={p.emailCandidatos}
                      valorAtual={p.email}
                      onEscolher={(v) => onEscolherCandidato(i, "email", v)}
                    />
                  )}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                  <div>{p.telefone ? formatCelular(p.telefone) : "—"}</div>
                  {p.telefoneCandidatos && (
                    <SeletorCandidato
                      candidatos={p.telefoneCandidatos}
                      valorAtual={p.telefone}
                      onEscolher={(v) => onEscolherCandidato(i, "telefone", v)}
                      formatar={formatCelular}
                    />
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {p.unidades.map((u) => u.numero).join(", ")}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {p.unidades.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Lista de avisos ──────────────────────────────────────────────────────────

function AvisosList({ erros }: { erros: ImportacaoErro[] }) {
  if (erros.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3.5 w-3.5" />
        {erros.length} {erros.length === 1 ? "aviso" : "avisos"} encontrados
      </p>
      <ul className="space-y-1">
        {erros.slice(0, 10).map((e, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            <span className="font-medium">
              Linha {e.linha} · {e.campo}:
            </span>{" "}
            {e.mensagem}
            {e.dados && <span className="ml-1 opacity-60">({e.dados})</span>}
          </li>
        ))}
        {erros.length > 10 && (
          <li className="text-xs text-muted-foreground opacity-60">
            … e mais {erros.length - 10} avisos
          </li>
        )}
      </ul>
    </div>
  )
}

// ─── Rodapé com botões Voltar / Próximo ───────────────────────────────────────

function StepFooter({
  onBack,
  onNext,
  backLabel = "← Voltar",
  nextLabel,
  nextDisabled,
  loading,
}: {
  onBack?: () => void
  onNext: () => void
  backLabel?: string
  nextLabel: string
  nextDisabled?: boolean
  loading?: boolean
}) {
  return (
    <div className="flex items-center justify-between border-t border-border/40 pt-4">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} disabled={loading}>
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={nextDisabled || loading} className="gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {nextLabel}
      </Button>
    </div>
  )
}

// ─── Wizard principal ─────────────────────────────────────────────────────────

interface Props {
  condominios: Condominio[]
}

export function ImportacaoWizard({ condominios }: Props) {
  // ── Estado global do wizard ────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("condominio")
  const [, startTransition] = useTransition()

  // Etapa 1 — condomínio
  const [criarNovo, setCriarNovo] = useState(condominios.length === 0)
  const [condominioId, setCondominioId] = useState("")
  const [novoNome, setNovoNome] = useState("")
  const [condominioNome, setCondominioNome] = useState("")

  // Etapa 2 — upload
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<LeituraArquivo | null>(null)
  const [lendo, setLendo] = useState(false)

  // Etapa 3 — mapeamento
  const [colMapeamento, setColMapeamento] = useState<Record<number, CampoImportacao>>({})

  // Etapa 4 — preview
  const [preview, setPreview] = useState<ImportacaoPreview | null>(null)

  // Etapa 6 — resultado
  const [resultado, setResultado] = useState<ImportacaoResultado | null>(null)
  const [tempoImportacao, setTempoImportacao] = useState(0)
  const startTimeRef = useRef(0)

  // ── Reset ──────────────────────────────────────────────────────────────────
  function reset() {
    setStep("condominio")
    setCriarNovo(condominios.length === 0)
    setCondominioId("")
    setNovoNome("")
    setCondominioNome("")
    setArquivo(null)
    setUploadError(null)
    setLeitura(null)
    setColMapeamento({})
    setPreview(null)
    setResultado(null)
    setTempoImportacao(0)
  }

  // ── Etapa 1 → 2 ───────────────────────────────────────────────────────────
  function handleCondominioNext() {
    if (criarNovo && !novoNome.trim()) {
      toast.error("Informe o nome do condomínio.")
      return
    }
    if (!criarNovo && !condominioId) {
      toast.error("Selecione um condomínio.")
      return
    }
    setStep("upload")
  }

  // ── Etapa 2 → 3: lê arquivo + detecção automática ─────────────────────────
  async function handleUploadNext() {
    if (!arquivo) {
      setUploadError("Selecione um arquivo .xlsx ou .csv.")
      return
    }
    setUploadError(null)
    setLendo(true)

    try {
      const result = await parseFileRaw(arquivo)

      if (result.headers.length === 0 || result.totalLinhas === 0) {
        setUploadError("O arquivo não contém dados válidos.")
        setLendo(false)
        return
      }

      const deteccoes = detectarColunas(result.headers)
      const mapeamentoInicial: Record<number, CampoImportacao> = {}
      deteccoes.forEach((d) => {
        mapeamentoInicial[d.colIdx] = d.campoDetetado ?? "ignorar"
      })

      setLeitura(result)
      setColMapeamento(mapeamentoInicial)
      setStep("mapeamento")
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro ao ler o arquivo.")
    } finally {
      setLendo(false)
    }
  }

  // ── Etapa 3 → 4: aplica mapeamento + gera preview ─────────────────────────
  function handleMapeamentoNext() {
    if (!leitura) return

    const linhas = aplicarMapeamento(leitura.rows, colMapeamento)

    if (linhas.length === 0) {
      toast.error("Nenhuma linha válida após o mapeamento. Verifique se Imóvel e Nome estão corretamente mapeados.")
      return
    }

    const result = processarLinhas(linhas)
    setPreview(result)
    setStep("preview")
  }

  // Resolve ambiguidade de e-mail/celular na revisão (item 4): troca o
  // candidato escolhido sem precisar reprocessar a planilha inteira.
  function handleEscolherCandidato(idx: number, campo: "email" | "telefone", valor: string) {
    setPreview((prev) => {
      if (!prev) return prev
      const proprietarios = prev.proprietarios.map((p, i) =>
        i === idx ? { ...p, [campo]: valor } : p
      )
      return { ...prev, proprietarios }
    })
  }

  // Atualiza mapeamento garantindo que cada campo seja usado uma única vez
  function handleMapeamentoChange(colIdx: number, campo: CampoImportacao) {
    setColMapeamento((prev) => {
      const next = { ...prev }
      // Libera campo se já estava em outra coluna (exceto "ignorar", que pode repetir)
      if (campo !== "ignorar") {
        for (const [idx, c] of Object.entries(next)) {
          if (c === campo && parseInt(idx) !== colIdx) {
            next[parseInt(idx)] = "ignorar"
          }
        }
      }
      next[colIdx] = campo
      return next
    })
  }

  // Validação da etapa de mapeamento
  const camposMapeadosSet = new Set<CampoImportacao>(
    Object.values(colMapeamento).filter((c) => c !== "ignorar")
  )
  const mapeamentoValido = CAMPOS_REQUERIDOS.every((c) => camposMapeadosSet.has(c))
  const mapeamentoFaltando = CAMPOS_REQUERIDOS.filter((c) => !camposMapeadosSet.has(c))

  // ── Etapa 4 → 5 → 6: importação ───────────────────────────────────────────
  function handleImportar() {
    if (!preview) return
    startTimeRef.current = Date.now()
    setStep("importando")

    startTransition(async () => {
      try {
        let targetId = condominioId
        let targetNome = condominios.find((c) => c.id === condominioId)?.nome ?? condominioId

        if (criarNovo) {
          const res = await createCondominioAction(novoNome.trim())
          if (!res.success || !res.id) {
            toast.error(res.error ?? "Erro ao criar condomínio.")
            setStep("preview")
            return
          }
          targetId = res.id
          targetNome = novoNome.trim()
        }

        setCondominioNome(targetNome)

        const res = await executarImportacaoAction(targetId, preview.proprietarios)
        const elapsed = Date.now() - startTimeRef.current

        if (!res.success) {
          toast.error(res.error ?? "Erro na importação.")
          setStep("preview")
          return
        }

        setTempoImportacao(elapsed)
        setResultado(res)
        setStep("resultado")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro inesperado.")
        setStep("preview")
      }
    })
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ProgressBar step={step} />

      <div className="rounded-xl border border-border/60 bg-card p-6">

        {/* ── Etapa 1: Condomínio ────────────────────────────────────── */}
        {step === "condominio" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">Selecionar condomínio</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Escolha para qual condomínio os dados serão importados
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tipo-condo"
                    checked={!criarNovo}
                    onChange={() => setCriarNovo(false)}
                    disabled={condominios.length === 0}
                    className="accent-primary"
                  />
                  Selecionar existente
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tipo-condo"
                    checked={criarNovo}
                    onChange={() => setCriarNovo(true)}
                    className="accent-primary"
                  />
                  <Plus className="h-3.5 w-3.5" />
                  Criar novo
                </label>
              </div>

              {criarNovo ? (
                <Input
                  placeholder="Nome do condomínio"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCondominioNext()}
                  autoFocus
                />
              ) : (
                <select
                  value={condominioId}
                  onChange={(e) => setCondominioId(e.target.value)}
                  className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none transition-colors focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Selecione um condomínio…</option>
                  {condominios.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <StepFooter
              nextLabel="Próximo →"
              nextDisabled={criarNovo ? !novoNome.trim() : !condominioId}
              onNext={handleCondominioNext}
            />
          </div>
        )}

        {/* ── Etapa 2: Upload ───────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">Selecionar planilha</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Arquivos aceitos: <span className="font-medium">.xlsx</span> e{" "}
                <span className="font-medium">.csv</span>. A ordem das colunas não importa.
              </p>
            </div>

            <DropZone arquivo={arquivo} onChange={setArquivo} />

            {uploadError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {uploadError}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              O sistema detectará automaticamente as colunas pelo nome do cabeçalho.
              Caso não consiga identificar alguma coluna, você poderá fazer o mapeamento
              manualmente na próxima etapa.
            </p>

            <StepFooter
              onBack={() => setStep("condominio")}
              nextLabel={lendo ? "Lendo arquivo…" : "Analisar planilha"}
              nextDisabled={!arquivo || lendo}
              loading={lendo}
              onNext={handleUploadNext}
            />
          </div>
        )}

        {/* ── Etapa 3: Mapeamento ───────────────────────────────────── */}
        {step === "mapeamento" && leitura && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold">Mapeamento de colunas</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Verifique como cada coluna da planilha foi associada aos campos do sistema.
                {leitura.headers.some((_, i) => colMapeamento[i] === "ignorar") && (
                  <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                    Colunas em destaque precisam de atenção.
                  </span>
                )}
              </p>
            </div>

            <MapeamentoTable
              headers={leitura.headers}
              mapeamento={colMapeamento}
              onChange={handleMapeamentoChange}
            />

            {!mapeamentoValido && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Mapeie as colunas obrigatórias antes de continuar:{" "}
                  <strong>
                    {mapeamentoFaltando
                      .map((c) => CAMPO_LABELS[c])
                      .join(" e ")}
                  </strong>
                </span>
              </div>
            )}

            <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <strong className="text-foreground">Dica:</strong> Colunas marcadas como
              &ldquo;Ignorar coluna&rdquo; não serão importadas. A ordem não afeta o resultado.
            </div>

            <StepFooter
              onBack={() => setStep("upload")}
              nextLabel="Confirmar mapeamento →"
              nextDisabled={!mapeamentoValido}
              onNext={handleMapeamentoNext}
            />
          </div>
        )}

        {/* ── Etapa 4: Pré-visualização ─────────────────────────────── */}
        {step === "preview" && preview && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold">Pré-visualização</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Revise os dados antes de confirmar a importação
              </p>
            </div>

            <SummaryCards preview={preview} />
            <ProprietariosTable preview={preview} onEscolherCandidato={handleEscolherCandidato} />
            <AvisosList erros={preview.erros} />

            <StepFooter
              onBack={() => setStep("mapeamento")}
              nextLabel="Confirmar importação"
              nextDisabled={preview.proprietarios.length === 0}
              onNext={handleImportar}
            />
          </div>
        )}

        {/* ── Etapa 5: Importando ───────────────────────────────────── */}
        {step === "importando" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold">Importando…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Criando proprietários e vinculando unidades
              </p>
            </div>
          </div>
        )}

        {/* ── Etapa 6: Resultado ────────────────────────────────────── */}
        {step === "resultado" && resultado && (
          <div className="flex flex-col items-center gap-6 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>

            <div>
              <p className="text-lg font-semibold">Importação concluída!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Condomínio:{" "}
                <span className="font-medium text-foreground">{condominioNome}</span>
              </p>
              {tempoImportacao > 0 && (
                <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTempo(tempoImportacao)}
                </p>
              )}
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Proprietários criados", value: resultado.proprietariosCriados, color: "text-emerald-500" },
                { label: "Proprietários atualizados", value: resultado.proprietariosAtualizados, color: "text-blue-500" },
                { label: "Unidades criadas", value: resultado.unidadesCriadas, color: "text-violet-500" },
                { label: "Ignoradas", value: resultado.unidadesIgnoradas, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="rounded-xl border border-border/60 bg-card px-3 py-3 text-center"
                >
                  <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {resultado.erros.length > 0 && (
              <div className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-left">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {resultado.erros.length}{" "}
                  {resultado.erros.length === 1 ? "erro" : "erros"} durante a importação
                </p>
                <ul className="space-y-1">
                  {resultado.erros.slice(0, 8).map((e, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {e}
                    </li>
                  ))}
                  {resultado.erros.length > 8 && (
                    <li className="text-xs text-muted-foreground opacity-60">
                      … e mais {resultado.erros.length - 8} erros
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                render={
                  <Link href={`${ROUTES.condominios}/${resultado.condominioId}`} />
                }
              >
                <Building2 className="h-4 w-4" />
                Ver condomínio
              </Button>
              <Button onClick={reset} variant="ghost">
                Nova importação
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
