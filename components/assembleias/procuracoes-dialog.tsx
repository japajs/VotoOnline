"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { FileSignature, Loader2, X, Plus, Search } from "lucide-react"
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
import {
  getProcuracoesAction,
  getElegiveisParaProcuracaoAction,
  createProcuracaoAction,
  deleteProcuracaoAction,
} from "@/app/actions/procuracoes"
import { normalizarBusca } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ProcuracaoComNomes } from "@/types"
import type { ProprietarioSemVoto } from "@/services/assembleia-votos"

interface Props {
  assembleiaId: string
  condominioId: string
}

// Um <select> nativo não reage visualmente enquanto a pessoa digita numa
// busca ao lado — o dropdown só mostra as opções (já filtradas) depois de
// clicado, dando a impressão de que "a busca não funciona". Uma lista
// sempre visível e clicável, filtrada a cada tecla, resolve isso — mesma
// lógica de disparar-assembleia-dialog.tsx, adaptada pra seleção única.
function SeletorProprietario({
  placeholder,
  busca,
  onBuscaChange,
  selecionadoId,
  onSelecionar,
  opcoes,
}: {
  placeholder: string
  busca: string
  onBuscaChange: (valor: string) => void
  selecionadoId: string
  onSelecionar: (id: string) => void
  opcoes: ProprietarioSemVoto[]
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 border-border/60 bg-background pl-7 text-xs"
          aria-label={placeholder}
        />
      </div>
      <div className="max-h-32 overflow-y-auto rounded-md border border-input bg-background">
        {opcoes.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado.</p>
        ) : (
          opcoes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelecionar(p.id)}
              className={cn(
                "block w-full truncate px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                selecionadoId === p.id && "bg-accent font-medium text-accent-foreground"
              )}
            >
              {p.nome}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// Auditoria de assembleias — Fase 8: outorgante (quem delega) precisa ser
// um proprietário já cadastrado no mesmo condomínio do outorgado (quem
// recebe/vota) — nunca uma pessoa externa, de propósito (ver
// services/procuracoes.ts). Só disponível enquanto a assembleia está
// aberta e nenhum dos dois lados já votou.
export function ProcuracoesDialog({ assembleiaId, condominioId }: Props) {
  const [open, setOpen] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [procuracoes, setProcuracoes] = useState<ProcuracaoComNomes[]>([])
  const [elegiveis, setElegiveis] = useState<ProprietarioSemVoto[]>([])
  const [outorganteId, setOutorganteId] = useState("")
  const [outorgadoId, setOutorgadoId] = useState("")
  const [buscaOutorgante, setBuscaOutorgante] = useState("")
  const [buscaOutorgado, setBuscaOutorgado] = useState("")
  const [isPendingCriar, startCriarTransition] = useTransition()
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [isPendingRemover, startRemoverTransition] = useTransition()
  const limparAoFecharRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function carregar() {
    setCarregando(true)
    Promise.all([
      getProcuracoesAction(assembleiaId, condominioId),
      getElegiveisParaProcuracaoAction(assembleiaId, condominioId),
    ]).then(([procResult, elegResult]) => {
      setCarregando(false)
      if (procResult.success) setProcuracoes(procResult.procuracoes)
      else toast.error(procResult.error)
      if (elegResult.success) setElegiveis(elegResult.proprietarios)
      else toast.error(elegResult.error)
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Reabrir cancela qualquer limpeza pendente de um fechamento
      // anterior — sem isso, fechar e reabrir em menos de 200ms deixava o
      // setTimeout do fechamento antigo disparar depois, apagando silenciosamente
      // uma seleção/busca que a pessoa acabou de fazer na reabertura.
      if (limparAoFecharRef.current) {
        clearTimeout(limparAoFecharRef.current)
        limparAoFecharRef.current = null
      }
      carregar()
    } else {
      limparAoFecharRef.current = setTimeout(() => {
        setOutorganteId("")
        setOutorgadoId("")
        setBuscaOutorgante("")
        setBuscaOutorgado("")
        limparAoFecharRef.current = null
      }, 200)
    }
  }

  function handleCriar() {
    if (!outorganteId || !outorgadoId) return
    startCriarTransition(async () => {
      const result = await createProcuracaoAction(assembleiaId, condominioId, outorganteId, outorgadoId)
      if (result.success) {
        toast.success("Procuração registrada.")
        setOutorganteId("")
        setOutorgadoId("")
        setBuscaOutorgante("")
        setBuscaOutorgado("")
        carregar()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleRemover(id: string) {
    setRemovendoId(id)
    startRemoverTransition(async () => {
      const result = await deleteProcuracaoAction(id, assembleiaId, condominioId)
      setRemovendoId(null)
      if (result.success) {
        toast.success("Procuração removida.")
        carregar()
      } else {
        toast.error(result.error)
      }
    })
  }

  function combina(p: ProprietarioSemVoto, termo: string): boolean {
    if (!termo) return true
    return normalizarBusca(`${p.nome} ${p.email ?? ""}`).includes(termo)
  }

  const elegiveisOutorgado = useMemo(() => {
    const termo = normalizarBusca(buscaOutorgado.trim())
    return elegiveis.filter((p) => p.id !== outorganteId).filter((p) => combina(p, termo))
  }, [elegiveis, outorganteId, buscaOutorgado])

  const elegiveisOutorgante = useMemo(() => {
    const termo = normalizarBusca(buscaOutorgante.trim())
    return elegiveis.filter((p) => p.id !== outorgadoId).filter((p) => combina(p, termo))
  }, [elegiveis, outorgadoId, buscaOutorgante])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileSignature className="h-3.5 w-3.5" />
        Procurações{procuracoes.length > 0 ? ` (${procuracoes.length})` : ""}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Procurações</DialogTitle>
          <DialogDescription>
            Um proprietário pode outorgar seu voto a outro proprietário já cadastrado neste
            condomínio, pra esta assembleia. Só é possível enquanto nenhum dos dois lados já votou.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {procuracoes.length > 0 && (
              <div className="space-y-1.5">
                {procuracoes.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{p.outorgante_nome}</span>
                      {" → "}
                      <span className="font-medium">{p.outorgado_nome}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemover(p.id)}
                      disabled={isPendingRemover}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      {isPendingRemover && removendoId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-dashed border-border/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nova procuração
              </p>
              <div className="space-y-2">
                <div>
                  <SeletorProprietario
                    placeholder="Buscar outorgante (quem delega)…"
                    busca={buscaOutorgante}
                    onBuscaChange={setBuscaOutorgante}
                    selecionadoId={outorganteId}
                    onSelecionar={setOutorganteId}
                    opcoes={elegiveisOutorgante}
                  />
                  {outorganteId && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Outorgante: <span className="font-medium text-foreground">{elegiveis.find((p) => p.id === outorganteId)?.nome}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-center text-xs text-muted-foreground">↓</div>
                <div>
                  <SeletorProprietario
                    placeholder="Buscar outorgado (representante)…"
                    busca={buscaOutorgado}
                    onBuscaChange={setBuscaOutorgado}
                    selecionadoId={outorgadoId}
                    onSelecionar={setOutorgadoId}
                    opcoes={elegiveisOutorgado}
                  />
                  {outorgadoId && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Outorgado: <span className="font-medium text-foreground">{elegiveis.find((p) => p.id === outorgadoId)?.nome}</span>
                    </p>
                  )}
                </div>
              </div>
              {elegiveis.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Ninguém disponível — todos já votaram ou não há proprietários cadastrados.
                </p>
              )}
              <Button
                size="sm"
                onClick={handleCriar}
                disabled={!outorganteId || !outorgadoId || isPendingCriar}
                className="w-full gap-1.5"
              >
                {isPendingCriar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Registrar procuração
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
