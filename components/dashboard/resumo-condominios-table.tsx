import Link from "next/link"
import { Building2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ROUTES } from "@/lib/constants"
import type { CondominioResumo } from "@/types"

interface ResumoCondominiosTableProps {
  condominios: CondominioResumo[]
}

export function ResumoCondominiosTable({ condominios }: ResumoCondominiosTableProps) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Condomínios</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {condominios.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum condomínio cadastrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="pl-6 text-xs">Condomínio</TableHead>
                  <TableHead className="text-right text-xs">Proprietários</TableHead>
                  <TableHead className="text-right text-xs">Unidades</TableHead>
                  <TableHead className="pr-6 text-right text-xs">Assembleias em andamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {condominios.map((c) => (
                  <TableRow
                    key={c.id}
                    className="border-border/60 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="pl-6">
                      <Link
                        href={`${ROUTES.condominios}/${c.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {c.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.total_proprietarios.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.total_unidades.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {c.assembleias_abertas === 0 && c.assembleias_pausadas === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {c.assembleias_abertas > 0 && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                              {c.assembleias_abertas}
                            </span>
                          )}
                          {c.assembleias_pausadas > 0 && (
                            <span
                              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500"
                              title="Pausada(s)"
                            >
                              {c.assembleias_pausadas}
                            </span>
                          )}
                        </span>
                      )}
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
