"use client"

import { useState } from "react"
import { History, Loader2, Search, CheckCircle2, XCircle } from "lucide-react"
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
import { getHistoricoDisparosAction } from "@/app/actions/assembleia-votos"
import { normalizarBusca } from "@/lib/format"
import type { DisparoHistorico } from "@/services/relatorios"

interface Props {
  assembleiaId: string
  condominioId: string
}

function dataBR(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Status mais forte do envio, na ordem de gravidade: spam > bounce > entregue >
// falhou > enviado (aguardando confirmação de entrega). A entrega vem do webhook
// do Resend; sem webhook configurado, fica em "Enviado".
function statusEntrega(d: DisparoHistorico): { label: string; cls: string } {
  if (d.spamEm) return { label: "Caiu em spam", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
  if (d.bounceEm) return { label: "Bounce", cls: "bg-destructive/15 text-destructive" }
  if (d.entregueEm) return { label: "Entregue", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" }
  if (d.status === "failed") return { label: "Falhou", cls: "bg-destructive/15 text-destructive" }
  return { label: "Enviado", cls: "bg-muted text-muted-foreground" }
}

// Histórico de disparos de e-mail (pedido do Carlos: rastrear os envios desde a
// abertura). Mostra quem recebeu, quando e o status (enviado/falhou). A prova de
// ENTREGA (entregue/spam/bounce) é no painel do provedor — isto é o registro do
// app. O status/data é do ÚLTIMO disparo a cada pessoa (reenvio atualiza).
export function HistoricoDisparosDialog({ assembleiaId, condominioId }: Props) {
  const [open, setOpen] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [disparos, setDisparos] = useState<DisparoHistorico[]>([])
  const [busca, setBusca] = useState("")

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setCarregando(true)
      getHistoricoDisparosAction(assembleiaId, condominioId).then((r) => {
        setCarregando(false)
        if (r.success) setDisparos(r.disparos)
        else toast.error(r.error)
      })
    } else {
      setTimeout(() => {
        setBusca("")
        setDisparos([])
      }, 200)
    }
  }

  const filtrados = disparos.filter((d) => {
    const q = normalizarBusca(busca.trim())
    return !q || normalizarBusca(`${d.nome} ${d.email ?? ""}`).includes(q)
  })
  const nEnviados = disparos.filter((d) => d.status === "sent").length
  const nFalhas = disparos.filter((d) => d.status === "failed").length
  const nEntregues = disparos.filter((d) => d.entregueEm).length
  const nBounce = disparos.filter((d) => d.bounceEm).length
  const nSpam = disparos.filter((d) => d.spamEm).length
  // Algum evento de entrega já chegou? (indica que o webhook está configurado.)
  const temEntrega = nEntregues + nBounce + nSpam > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <History className="h-3.5 w-3.5" />
        Histórico de disparos
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de disparos</DialogTitle>
          <DialogDescription>
            E-mails enviados nesta assembleia — quem recebeu, quando e o status de entrega. A
            confirmação (Entregue, Bounce ou Spam) chega automaticamente do provedor de e-mail.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : disparos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum e-mail disparado ainda nesta assembleia.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {nEnviados} {nEnviados === 1 ? "enviado" : "enviados"}
              </span>
              {nEntregues > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">{nEntregues} entregues</span>
              )}
              {nBounce > 0 && <span className="text-destructive">{nBounce} bounce</span>}
              {nSpam > 0 && <span className="text-amber-600 dark:text-amber-400">{nSpam} em spam</span>}
              {nFalhas > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  {nFalhas} {nFalhas === 1 ? "falhou" : "falharam"}
                </span>
              )}
            </div>
            {!temEntrega && (
              <p className="text-[11px] text-muted-foreground">
                A confirmação de entrega (Entregue / Bounce / Spam) chega conforme o provedor de
                e-mail retorna os eventos. Disparos feitos antes de ativá-la ficam como “Enviado”.
              </p>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail…"
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-72 divide-y divide-border/30 overflow-y-auto rounded-lg border border-border/60">
              {filtrados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum resultado para &quot;{busca}&quot;.
                </p>
              ) : (
                filtrados.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">{d.email ?? "sem e-mail"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {(() => {
                        const s = statusEntrega(d)
                        return (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>
                            {s.label}
                          </span>
                        )
                      })()}
                      <span className="text-[11px] text-muted-foreground">{dataBR(d.sentAt)}</span>
                    </div>
                  </div>
                ))
              )}
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
