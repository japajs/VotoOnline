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
        <Label htmlFor="numero">Unidade</Label>
        <Input id="numero" name="numero" placeholder="Ex.: B108, 0502, Casa 5" autoComplete="off" required />
        <p className="text-xs text-muted-foreground">
          Digite como está no seu cadastro. Se tiver bloco, inclua junto (ex.: B108).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          name="cpf"
          inputMode="numeric"
          placeholder="Somente números"
          autoComplete="off"
          required
          // Reforço no celular: bloqueia letras conforme digita (só dígitos,
          // máx. 11). O servidor também normaliza antes de comparar.
          onChange={(e) => {
            e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 11)
          }}
        />
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
