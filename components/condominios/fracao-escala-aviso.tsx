"use client"

import { useTransition } from "react"
import { AlertTriangle, Loader2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { converterEscalaFracoesAction } from "@/app/actions/condominios"

interface Props {
  condominioId: string
  soma: number
  divisor: number | null
}

// As frações ideais chegam da planilha em porcentagem (soma ≈ 100), mas o
// sistema calcula e mostra tudo como fração de 1 (soma ≈ 1) — sem converter,
// o e-mail de convite diria "Seu peso de voto: 36,4%" pra quem tem 0,364%.
// Só aparece quando a soma das frações do condomínio está fora da escala
// esperada; some sozinho depois de converter.
export function FracaoEscalaAviso({ condominioId, soma, divisor }: Props) {
  const [isPending, startTransition] = useTransition()
  const somaTxt = soma.toLocaleString("pt-BR", { maximumFractionDigits: 4 })

  function handleConverter() {
    if (
      !confirm(
        `Converter as frações ideais de todas as unidades dividindo por ${divisor}?\n\nAntes: soma ${somaTxt}. Depois: soma ≈ ${(soma / (divisor ?? 1)).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}.\n\nFaça isso ANTES de enviar convites — depois que existe voto, não dá mais.`
      )
    )
      return
    startTransition(async () => {
      const result = await converterEscalaFracoesAction(condominioId)
      if (result.success) toast.success("Frações convertidas.")
      else toast.error(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          <span className="font-semibold">Frações ideais fora da escala do sistema.</span> As frações
          das unidades somam <strong>{somaTxt}</strong>
          {divisor
            ? ` — parecem estar em ${divisor === 100 ? "porcentagem" : "milésimos"}, mas o sistema usa fração de 1 (soma ≈ 1). Converta antes de usar o critério “fração ideal” ou enviar convites.`
            : ", que não parece fração, porcentagem nem milésimo. Confira os valores cadastrados nas unidades."}
        </p>
      </div>
      {divisor && (
        <Button size="sm" variant="outline" onClick={handleConverter} disabled={isPending} className="shrink-0 gap-1.5">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Converter frações (÷{divisor})
        </Button>
      )}
    </div>
  )
}
