import { Building2, ClipboardList, Home, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CondoDashboardStats } from "@/types"

interface StatsCardsProps {
  stats: CondoDashboardStats
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Condomínios",
      value: stats.total_condominios,
      description: "cadastrados",
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      title: "Proprietários",
      value: stats.total_proprietarios,
      description: "cadastrados",
      icon: Users,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
    {
      title: "Unidades",
      value: stats.total_unidades,
      description: "imóveis cadastrados",
      icon: Home,
      color: "text-violet-400",
      bg: "bg-violet-400/10",
    },
    {
      title: "Assembleias",
      value: stats.total_assembleias,
      description: "criadas no total",
      icon: ClipboardList,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.title}
          className="border-border/60 bg-card transition-shadow duration-200 hover:shadow-md"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`rounded-lg p-2 ${card.bg}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-foreground">
              {card.value.toLocaleString("pt-BR")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
