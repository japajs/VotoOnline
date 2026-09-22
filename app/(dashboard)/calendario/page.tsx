import type { Metadata } from "next"
import { getAssembleiasParaCalendario } from "@/services/assembleias"
import { resolveCondominioScope } from "@/lib/auth"
import { CalendarioAssembleias } from "@/components/calendario/calendario-assembleias"

export const metadata: Metadata = { title: "Calendário" }

export default async function CalendarioPage() {
  const condominioIds = await resolveCondominioScope()
  const assembleias = await getAssembleiasParaCalendario(condominioIds)

  return (
    <div className="flex flex-col gap-6 p-6 pt-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendário</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          1ª convocação e encerramento de votação de todas as assembleias
        </p>
      </div>

      <CalendarioAssembleias assembleias={assembleias} />
    </div>
  )
}
