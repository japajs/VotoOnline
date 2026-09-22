"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { Send, Loader2, CheckCircle2, AlertCircle, Paperclip, X, FileText, Search } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { enviarAssembleiaAction, type EnviarAssembleiaResult } from "@/app/actions/assembleia-votos"
import { normalizarBusca } from "@/lib/format"
import { formatUnidade } from "@/lib/unidade-format"
import type { Assembleia, Proprietario } from "@/types"

type Step = "compose" | "sending" | "done"

interface DispararAssembleiaDialogProps {
  assembleia: Assembleia
  proprietarios: Proprietario[]
}

const ANEXO_TAMANHO_MAXIMO_MB = 8

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function DispararAssembleiaDialog({ assembleia, proprietarios }: DispararAssembleiaDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<Step>("compose")
  const [result, setResult] = useState<EnviarAssembleiaResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [anexo, setAnexo] = useState<File | null>(null)
  const [busca, setBusca] = useState("")
  const anexoInputRef = useRef<HTMLInputElement>(null)

  const proprietariosFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim())
    if (!termo) return proprietarios
    return proprietarios.filter((p) => {
      const alvo = [
        p.nome,
        p.email ?? "",
        ...(p.unidades ?? []).flatMap((u) => [u.numero, u.bloco ?? ""]),
      ].join(" ")
      return normalizarBusca(alvo).includes(termo)
    })
  }, [proprietarios, busca])

  const allSelected =
    proprietariosFiltrados.length > 0 && proprietariosFiltrados.every((p) => selectedIds.has(p.id))
  const pautaCount = assembleia.pautas?.length ?? 0

  function toggleProprietario(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Seleciona/desmarca só quem está visível com o filtro atual — quem já
  // estava selecionado fora do filtro (de uma busca anterior) permanece
  // selecionado.
  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const idsFiltrados = proprietariosFiltrados.map((p) => p.id)
      if (allSelected) {
        idsFiltrados.forEach((id) => next.delete(id))
      } else {
        idsFiltrados.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function reset() {
    setStep("compose")
    setSelectedIds(new Set())
    setResult(null)
    setAnexo(null)
    setBusca("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setTimeout(reset, 300)
  }

  function handleAnexoChange(file: File | null) {
    if (!file) {
      setAnexo(null)
      return
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Anexe apenas arquivos PDF.")
      return
    }
    if (file.size > ANEXO_TAMANHO_MAXIMO_MB * 1024 * 1024) {
      toast.error(`O PDF anexado excede o limite de ${ANEXO_TAMANHO_MAXIMO_MB}MB.`)
      return
    }
    setAnexo(file)
  }

  function handleSend() {
    if (selectedIds.size === 0) {
      toast.error("Selecione pelo menos um proprietário.")
      return
    }
    setStep("sending")
    startTransition(async () => {
      const anexoInput = anexo
        ? { filename: anexo.name, contentBase64: await fileParaBase64(anexo) }
        : undefined
      const res = await enviarAssembleiaAction(assembleia.id, [...selectedIds], anexoInput)
      setResult(res)
      setStep("done")
      if (res.error) toast.error(res.error)
      else toast.success(`${res.sent} e-mails enviados com sucesso.`)
    })
  }

  // Contagem de unidades (não o peso de voto — que pode ser fração ideal,
  // ver lib/peso.ts) — aqui é só informativo, pra mostrar quantos
  // apartamentos este envio está alcançando.
  const totalApartamentos = [...selectedIds]
    .map((id) => proprietarios.find((p) => p.id === id))
    .filter(Boolean)
    .reduce((sum, p) => sum + (p!.unidades?.length ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>
        <Send className="h-3.5 w-3.5" />
        Disparar
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disparar assembleia</DialogTitle>
          <DialogDescription>
            <span className="truncate">{assembleia.titulo}</span>
            {pautaCount > 0 && (
              <span className="ml-1.5 text-xs">
                · {pautaCount} {pautaCount === 1 ? "pauta" : "pautas"}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {(step === "compose" || step === "sending") && (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto px-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail ou unidade…"
                className="border-border/60 bg-background pl-10"
                aria-label="Buscar proprietário"
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-border/40 bg-muted/30 px-3 py-2 hover:bg-accent/30">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-primary"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                </span>
              </label>

              <div className="max-h-56 divide-y divide-border/30 overflow-y-auto">
                {proprietariosFiltrados.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    {proprietarios.length === 0
                      ? "Nenhum proprietário cadastrado."
                      : "Nenhum proprietário encontrado."}
                  </p>
                ) : (
                  proprietariosFiltrados.map((p) => {
                    const peso = p.unidades?.length ?? 0
                    const unidades = (p.unidades ?? []).map(formatUnidade).join(", ")
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 hover:bg-accent/30"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleProprietario(p.id)}
                          className="accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.email}
                            {unidades && ` · ${unidades}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {peso} {peso === 1 ? "imóvel" : "imóveis"}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            {selectedIds.size > 0 && (
              <p className="text-right text-xs text-muted-foreground">
                {selectedIds.size} proprietário{selectedIds.size !== 1 ? "s" : ""} ·{" "}
                {totalApartamentos} imóve{totalApartamentos !== 1 ? "is" : "l"} representado{totalApartamentos !== 1 ? "s" : ""}
              </p>
            )}

            {/* Item 5: anexo opcional (edital, orçamento, memorial
                descritivo, convocação) — vai junto com o link de votação
                para cada destinatário selecionado acima. */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Anexar PDF (opcional)</p>
              <input
                ref={anexoInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  handleAnexoChange(e.target.files?.[0] ?? null)
                  e.target.value = ""
                }}
              />
              {anexo ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs">{anexo.name}</span>
                  <button
                    type="button"
                    onClick={() => handleAnexoChange(null)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Remover anexo</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => anexoInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Edital, orçamento, memorial descritivo ou convocação (.pdf)
                </button>
              )}
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            {result.error ? (
              <>
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div>
                  <p className="font-medium">Erro no envio</p>
                  <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <div>
                  <p className="font-medium">Disparo concluído!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{result.sent}</span> enviados
                    {result.failed > 0 && (
                      <>
                        {" · "}
                        <span className="font-medium text-destructive">{result.failed}</span> falharam
                      </>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "compose" && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={selectedIds.size === 0}>
                <Send className="size-4" />
                Enviar para {selectedIds.size || "…"}
              </Button>
            </>
          )}
          {step === "sending" && (
            <Button disabled className="w-full">
              <Loader2 className="size-4 animate-spin" />
              Enviando…
            </Button>
          )}
          {step === "done" && (
            <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
