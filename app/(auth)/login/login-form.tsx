"use client"

import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, LogIn, Mail, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { loginAction, type LoginState } from "./actions"

export function LoginForm() {
  const searchParams = useSearchParams()
  const from = searchParams.get("from") ?? ""
  const [state, action, isPending] = useActionState<LoginState, FormData>(loginAction, null)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="from" value={from} />

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm text-foreground/80">
          E-mail
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            autoFocus
            required
            disabled={isPending}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm text-foreground/80">
          Senha
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <PasswordInput
            id="password"
            name="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="pl-10"
          />
        </div>
      </div>

      {state?.error && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <Button type="submit" className="w-full gap-2" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            Entrar
          </>
        )}
      </Button>
    </form>
  )
}
