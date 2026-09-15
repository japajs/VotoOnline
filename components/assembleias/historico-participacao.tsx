"use client"

import { useMemo, useState } from "react"
import { ClipboardList, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { normalizarBusca } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { HistoricoParticipante } from "@/services/relatorios"

function formatDateHora(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

type Status = "completo" | "pendente" | "parcial"
type StatusFiltro = Status | "todos"

function statusDe(h: HistoricoParticipante): Status {
  if (h.pautasRespondidas === 0) return "pendente"
  if (h.pautasRespondidas === h.totalPautas && h.totalPautas > 0) return "completo"
  return "parcial"
}

const STATUS_LABEL: Record<Status, string> = {
  completo: "Completo",
  pendente: "Pendente",
  parcial: "Parcial",
}

const STATUS_CLASS: Record<Status, string> = {
  completo: "bg-emerald-500/15 text-emerald-500",
  pendente: "bg-muted text-muted-foreground",
  parcial: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
}

// Controle interno de participação (item 6) — não faz parte do PDF/XLSX
// oficial, só desta tela: quem já respondeu quantas pautas e quando foi a
// última resposta. Útil especialmente com votação parcial/complementar,
// quando "respondeu" deixa de ser um sim/não único por participante.
//
// Achado de usabilidade: em condomínios grandes (200+ proprietários) essa
// lista virava uma rolagem sem fim pra achar alguém ou saber quantos ainda
// faltam responder — busca por nome + filtro por status (com contador)
// resolve os dois casos sem precisar abrir o Excel/PDF.
export function HistoricoParticipacao({ historico }: { historico: HistoricoParticipante[] }) {
  const [busca, setBusca] = useState("")
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos")

  const contagens = useMemo(() => {
    const c: Record<Status, number> = { completo: 0, pendente: 0, parcial: 0 }
    for (const h of historico) c[statusDe(h)]++
    return c
  }, [historico])

  const filtrado = useMemo(() => {
    const termo = normalizarBusca(busca.trim())
    return historico.filter((h) => {
      if (statusFiltro !== "todos" && statusDe(h) !== statusFiltro) return false
      if (termo && !normalizarBusca(h.proprietarioNome).includes(termo)) return false
      return true
    })
  }, [historico, busca, statusFiltro])

  if (historico.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Participação (controle interno)</h2>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar proprietário…"
            className="border-border/60 bg-background pl-10"
            aria-label="Buscar proprietário"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFiltro("todos")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              statusFiltro === "todos" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            Todos ({historico.length})
          </button>
          {(["pendente", "parcial", "completo"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFiltro(s)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                statusFiltro === s ? STATUS_CLASS[s] + " ring-1 ring-current" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {STATUS_LABEL[s]} ({contagens[s]})
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Proprietário
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Pautas respondidas
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Última resposta
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtrado.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum proprietário encontrado.
                </td>
              </tr>
            ) : (
              filtrado.map((h, i) => {
                const status = statusDe(h)
                return (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{h.proprietarioNome}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {h.pautasRespondidas}/{h.totalPautas}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDateHora(h.ultimaResposta)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
