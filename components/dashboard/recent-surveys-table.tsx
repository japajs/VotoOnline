import Link from "next/link"
import { ArrowRight, ClipboardList } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/lib/constants"
import { ASSEMBLEIA_STATUS_LABEL as STATUS_LABEL, ASSEMBLEIA_STATUS_CLASS as STATUS_CLASS } from "@/lib/assembleia-status"
import type { AssembleiaRecente } from "@/types"

interface RecentSurveysTableProps {
  assembleias: AssembleiaRecente[]
}

function formatDate(dateString: string | null) {
  if (!dateString) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString))
}

function Participacao({ respondidos, enviados }: { respondidos: number; enviados: number }) {
  const pendentes = Math.max(0, enviados - respondidos)
  const pct = enviados > 0 ? Math.round((respondidos / enviados) * 100) : 0
  // Sem convites enviados ainda não é "participação baixa" — é neutro, não
  // alarmar o operador com vermelho por algo que ainda nem começou.
  const color =
    enviados === 0
      ? "text-muted-foreground"
      : pct > 80
        ? "text-emerald-500"
        : pct >= 40
          ? "text-amber-500"
          : "text-rose-500"

  return (
    <div className="text-sm">
      <p className="font-medium tabular-nums text-foreground">
        {respondidos} / {enviados} votos
      </p>
      <p className={cn("tabular-nums font-medium", color)}>{pct}%</p>
      {pendentes > 0 && (
        <p className="text-xs text-muted-foreground">{pendentes} pendentes</p>
      )}
    </div>
  )
}

export function RecentSurveysTable({ assembleias }: RecentSurveysTableProps) {
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Últimas assembleias</CardTitle>
        <Link
          href={ROUTES.condominios}
          className={
            buttonVariants({ variant: "ghost", size: "sm" }) +
            " gap-1.5 text-xs text-muted-foreground"
          }
        >
          Ver condomínios
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {assembleias.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma assembleia criada ainda.</p>
            <Link href={ROUTES.condominios} className={buttonVariants({ size: "sm" }) + " mt-2"}>
              Ir para Condomínios
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="hidden text-xs sm:table-cell">Condomínio</TableHead>
                  <TableHead className="pl-6 text-xs sm:pl-0">Assembleia</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Participação</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Criada em</TableHead>
                  <TableHead className="hidden pr-6 text-right text-xs lg:table-cell">
                    Encerramento
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assembleias.map((a) => (
                  <TableRow
                    key={a.id}
                    className="border-border/60 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {a.condominio_nome}
                    </TableCell>
                    <TableCell className="pl-6 sm:pl-0">
                      <Link
                        href={ROUTES.condominioAssembleia(a.condominio_id, a.id)}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {a.titulo}
                      </Link>
                      <p className="text-xs text-muted-foreground sm:hidden">{a.condominio_nome}</p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                          STATUS_CLASS[a.status]
                        )}
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Participacao
                        respondidos={a.total_respondidos}
                        enviados={a.total_enviados}
                      />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {formatDate(a.created_at)}
                    </TableCell>
                    <TableCell className="hidden pr-6 text-right text-sm text-muted-foreground lg:table-cell">
                      {formatDate(a.data_encerramento)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
