"use client"

import { useState, useTransition, useCallback } from "react"
import { Users, Loader2, BellRing, CheckCircle2, Search, Circle, Link2 } from "lucide-react"
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
  getChamadaAction,
  marcarPresencaAction,
  setExigePresencaAction,
} from "@/app/actions/presenca"
import { notificarNaoVotaramAction } from "@/app/actions/assembleia-votos"
import { formatUnidade } from "@/lib/unidade-format"
import type { ChamadaItem } from "@/services/presenca"

function copiarLinkVoto(token: string) {
  const url = `${window.location.origin}/v/${token}`
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link de voto copiado."),
      () => toast.message(url)
    )
  } else {
    toast.message(url)
  }
}

interface Props {
  assembleiaId: string
  condominioId: string
  // Só mostra o botão de lembrete quando a votação está aberta (o envio em si
  // também é barrado no servidor fora disso — ver notificarNaoVotaramAction).
  podeLembrar: boolean
}

// Chamada / Lista de presença (presença controlada pela mesa). A secretária
// marca quem está presente conforme assina a lista; com "exigir presença"
// ligado, só vota quem estiver marcado aqui.
export function PresencaDialog({ assembleiaId, condominioId, podeLembrar }: Props) {
  const [open, setOpen] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [exigePresenca, setExigePresenca] = useState(false)
  const [itens, setItens] = useState<ChamadaItem[]>([])
  const [busca, setBusca] = useState("")
  const [marcandoId, setMarcandoId] = useState<string | null>(null)
  const [isPendingLembrete, startLembreteTransition] = useTransition()

  const carregar = useCallback(() => {
    setCarregando(true)
    getChamadaAction(assembleiaId, condominioId).then((r) => {
      setCarregando(false)
      if (r.success && r.data) {
        setItens(r.data.itens)
        setExigePresenca(r.data.exigePresenca)
      } else {
        toast.error(r.error)
      }
    })
  }, [assembleiaId, condominioId])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) carregar()
    else
      setTimeout(() => {
        setItens([])
        setBusca("")
      }, 200)
  }

  async function handleToggleExige() {
    const novo = !exigePresenca
    setExigePresenca(novo) // otimista
    const r = await setExigePresencaAction(assembleiaId, condominioId, novo)
    if (!r.success) {
      setExigePresenca(!novo) // reverte
      toast.error(r.error ?? "Erro ao atualizar a opção.")
    } else {
      toast.success(
        novo
          ? "Agora só vota quem a mesa marcar como presente."
          : "Voltou ao modo normal (sem exigir presença da mesa)."
      )
    }
  }

  async function handleMarcar(item: ChamadaItem) {
    if (item.votou && item.presente) {
      toast.message("Este proprietário já votou — não dá pra tirar da presença.")
      return
    }
    const novo = !item.presente
    setMarcandoId(item.proprietarioId)
    const r = await marcarPresencaAction(assembleiaId, condominioId, item.proprietarioId, novo)
    setMarcandoId(null)
    if (r.success) {
      setItens((prev) =>
        prev.map((i) => (i.proprietarioId === item.proprietarioId ? { ...i, presente: novo } : i))
      )
    } else {
      toast.error(r.error ?? "Erro ao marcar presença.")
    }
  }

  function handleLembrar() {
    startLembreteTransition(async () => {
      const r = await notificarNaoVotaramAction(assembleiaId, true)
      if (r.success) {
        toast.success(
          r.sent > 0
            ? `Lembrete enviado para ${r.sent} ${r.sent === 1 ? "presente" : "presentes"}.`
            : "Ninguém pendente com e-mail para lembrar."
        )
        carregar()
      } else {
        toast.error(r.error ?? "Erro ao enviar lembrete.")
      }
    })
  }

  const totalPresentes = itens.filter((i) => i.presente).length
  const totalVotaram = itens.filter((i) => i.votou).length
  const naoVotaramComEmail = itens.filter((i) => i.presente && !i.votou && i.email).length

  const filtrados = itens.filter((i) => {
    const q = busca.trim().toLowerCase()
    if (!q) return true
    const uni = i.unidades.map((u) => formatUnidade(u)).join(" ").toLowerCase()
    return i.nome.toLowerCase().includes(q) || uni.includes(q)
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Users className="h-3.5 w-3.5" />
        Chamada / Presença
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chamada / Lista de presença</DialogTitle>
          <DialogDescription>
            Marque quem está presente conforme assina a lista na mesa. Com &ldquo;exigir
            presença&rdquo; ligado, só vota quem estiver marcado aqui.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleToggleExige}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                exigePresenca ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/20"
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium">Exigir presença pra votar</p>
                <p className="text-xs text-muted-foreground">
                  {exigePresenca
                    ? "Ligado — só vota quem a mesa marcar presente."
                    : "Desligado — vale o modo normal (CPF / e-mail)."}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  exigePresenca
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {exigePresenca ? "LIGADO" : "DESLIGADO"}
              </span>
            </button>

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">
                {totalPresentes} {totalPresentes === 1 ? "presente" : "presentes"}
              </span>
              <span className="text-muted-foreground">
                {totalVotaram} {totalVotaram === 1 ? "votou" : "votaram"} · {itens.length} no cadastro
              </span>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou unidade…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filtrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum proprietário encontrado.
                </p>
              ) : (
                filtrados.map((i) => {
                  const uni = i.unidades.length
                    ? i.unidades.map((u) => formatUnidade(u)).join(", ")
                    : "—"
                  const marcando = marcandoId === i.proprietarioId
                  return (
                    <div
                      key={i.proprietarioId}
                      className={`flex items-center gap-1 rounded-lg border pr-1 transition-colors ${
                        i.presente ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleMarcar(i)}
                        disabled={marcando || i.outorgante}
                        title={
                          i.outorgante
                            ? "Outorgou procuração — a presença é representada pelo procurador"
                            : undefined
                        }
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {uni} · {i.nome}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {i.outorgante
                              ? "outorgou procuração"
                              : i.votou
                                ? "já votou"
                                : i.email
                                  ? i.email
                                  : "sem e-mail"}
                            {!i.outorgante && !i.temCpf && " · sem CPF (só voto manual)"}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center text-xs font-medium">
                          {marcando ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : i.outorgante ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              Procuração
                            </span>
                          ) : i.presente ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-4 w-4" /> Presente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Circle className="h-4 w-4" /> Marcar
                            </span>
                          )}
                        </span>
                      </button>
                      {i.presente && i.token && (
                        <button
                          type="button"
                          onClick={() => copiarLinkVoto(i.token!)}
                          title="Copiar o link de voto desta pessoa (pra mandar direto, ex.: quem não tem CPF)"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Copiar link de voto</span>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <DialogFooter>
              {podeLembrar && naoVotaramComEmail > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLembrar}
                  disabled={isPendingLembrete}
                  className="gap-1.5"
                >
                  {isPendingLembrete ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BellRing className="h-3.5 w-3.5" />
                  )}
                  Lembrar os {naoVotaramComEmail} presentes que não votaram
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
