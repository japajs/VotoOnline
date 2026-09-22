"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { setupAction, type SetupState } from "./actions"

export function SetupForm() {
  const [state, action, isPending] = useActionState<SetupState, FormData>(setupAction, null)

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" placeholder="Seu nome" autoFocus required disabled={isPending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" placeholder="seu@email.com" required disabled={isPending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput
          id="password"
          name="password"
          placeholder="Mínimo 8 caracteres"
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirmar senha</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          placeholder="Repita a senha"
          required
          disabled={isPending}
        />
      </div>

      {state?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <Button type="submit" className="w-full gap-2" disabled={isPending}>
        {isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Criando conta…</>
        ) : (
          <><ShieldCheck className="h-4 w-4" />Criar conta de administrador</>
        )}
      </Button>
    </form>
  )
}
