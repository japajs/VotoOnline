"use client"

import { useState, useTransition } from "react"
import { Users, Loader2, BellRing, CheckCircle2 } from "lucide-react"
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
import { getPresencaAction } from "@/app/actions/presenca"
import { notificarNaoVotaramAction } from "@/app/actions/assembleia-votos"
import { formatUnidade } from "@/lib/unidade-format"
import type { PresenteItem } from "@/services/presenca"

function formatHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

interface Props {
  assembleiaId: string
  condominioId: string
  // Só mostra o botão de lembrete quando a votação está aberta (o envio em si
  // também é barrado no servidor fora disso — ver notificarNaoVotaramAction).
  podeLembrar: boolean
}

// Lista de presença online (Opção A): quem entrou pelo link de entrada
// (identificado por unidade + CPF). Serve de lista de presença pra ata e de
// base pro lembrete "só pros presentes".
export function PresencaDialog({ assembleiaId, condominioId, podeLembrar }: Props) {
  const [open, setOpen] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [presentes, setPresentes] = useState<PresenteItem[]>([])
  const [isPendingLembrete, startLembreteTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setCarregando(true)
      getPresencaAction(assembleiaId, condominioId).then((r) => {
        setCarregando(false)
        if (r.success) setPresentes(r.presentes)
        else toast.error(r.error)
      })
    } else {
      setTimeout(() => setPresentes([]), 200)
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
        // Recarrega pra refletir quem já votou nesse meio-tempo.
        getPresencaAction(assembleiaId, condominioId).then((res) => {
          if (res.success) setPresentes(res.presentes)
        })
      } else {
        toast.error(r.error ?? "Erro ao enviar lembrete.")
      }
    })
  }

  const totalVotaram = presentes.filter((p) => p.votou).length
  const naoVotaramComEmail = presentes.filter((p) => !p.votou && p.email).length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Users className="h-3.5 w-3.5" />
        Lista de presença
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lista de presença online</DialogTitle>
          <DialogDescription>
            Quem entrou nesta assembleia pelo link de entrada (identificado por unidade + CPF).
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">
                {presentes.length} {presentes.length === 1 ? "presente" : "presentes"}
              </span>
              <span className="text-muted-foreground">
                {totalVotaram} já {totalVotaram === 1 ? "votou" : "votaram"}
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {presentes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Ninguém entrou pelo link ainda.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Imóvel</th>
                      <th className="py-1.5 pr-3 font-medium">Nome</th>
                      <th className="py-1.5 pr-3 font-medium">Entrou</th>
                      <th className="py-1.5 font-medium">Votou?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presentes.map((p) => (
                      <tr key={p.sendId} className="border-b border-border/20 last:border-0">
                        <td className="whitespace-nowrap py-1.5 pr-3">
                          {p.unidades.length ? p.unidades.map((u) => formatUnidade(u)).join(", ") : "—"}
                        </td>
                        <td className="py-1.5 pr-3">{p.nome}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                          {formatHora(p.presenteEm)}
                        </td>
                        <td className="py-1.5">
                          {p.votou ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Sim
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Não</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  Lembrar os {naoVotaramComEmail} que não votaram
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
