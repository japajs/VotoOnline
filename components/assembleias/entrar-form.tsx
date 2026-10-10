"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"
import { entrarAssembleiaAction, type EntrarState } from "@/app/actions/presenca"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function EntrarForm({ assembleiaId }: { assembleiaId: string }) {
  const [state, formAction, isPending] = useActionState<EntrarState, FormData>(
    entrarAssembleiaAction.bind(null, assembleiaId),
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="numero">Unidade (apartamento / casa)</Label>
        <Input id="numero" name="numero" placeholder="Ex.: 0502 ou C-0502" autoComplete="off" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bloco">Bloco (se houver)</Label>
        <Input id="bloco" name="bloco" placeholder="Ex.: C" autoComplete="off" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" name="cpf" inputMode="numeric" placeholder="Somente números" autoComplete="off" required />
      </div>

      {state?.error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full gap-1.5" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando…
          </>
        ) : (
          "Entrar e votar"
        )}
      </Button>
    </form>
  )
}
