"use client"

import { useState, type ReactNode } from "react"
import { BarChart3, Users } from "lucide-react"
import { cn } from "@/lib/utils"

type Modo = "apuracao" | "participantes"

// "Modo exibir" (pedido do Carlos): troca entre a APURAÇÃO (resultados por
// pauta) e os PARTICIPANTES (a chamada — a mesma lista de proprietários da tela
// de gestão) sem sair da tela da assembleia. Começo da fusão gestão + apuração,
// feita por partes. As duas abas ficam SEMPRE montadas (escondo com `hidden`,
// não desmonto): assim o polling da presença e o estado local da chamada não
// reiniciam quando a mesa alterna entre as abas no meio da assembleia.
export function ApuracaoModoExibir({
  apuracao,
  participantes,
}: {
  apuracao: ReactNode
  participantes: ReactNode
}) {
  const [modo, setModo] = useState<Modo>("apuracao")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Modo exibir:</span>
        <div
          role="tablist"
          aria-label="Modo de exibição"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
        >
          <AbaBotao
            ativo={modo === "apuracao"}
            onClick={() => setModo("apuracao")}
            icon={<BarChart3 className="h-4 w-4" />}
            label="Apuração"
          />
          <AbaBotao
            ativo={modo === "participantes"}
            onClick={() => setModo("participantes")}
            icon={<Users className="h-4 w-4" />}
            label="Participantes"
          />
        </div>
      </div>

      <div className={cn(modo !== "apuracao" && "hidden")}>{apuracao}</div>
      <div className={cn(modo !== "participantes" && "hidden")}>{participantes}</div>
    </div>
  )
}

function AbaBotao({
  ativo,
  onClick,
  icon,
  label,
}: {
  ativo: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        ativo
          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}
