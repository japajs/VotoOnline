"use client"

import { useActionState, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  entrarAssembleiaAction,
  verificarEntradaAction,
  type EntrarState,
} from "@/app/actions/presenca"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ROUTES } from "@/lib/constants"

export function EntrarForm({ assembleiaId }: { assembleiaId: string }) {
  const [state, formAction, isPending] = useActionState<EntrarState, FormData>(
    entrarAssembleiaAction.bind(null, assembleiaId),
    null
  )
  const [erroPolling, setErroPolling] = useState<string | null>(null)

  const aguardando = !!state?.aguardando
  const numero = state?.numero
  const bloco = state?.bloco ?? null
  const cpf = state?.cpf

  // Enquanto a mesa não confirma a presença, fica checando sozinho (a cada 7s,
  // bem abaixo do rate limit) com os MESMOS dados — quando a mesa marcar
  // presente, redireciona direto pra votação, sem a pessoa re-digitar nada.
  // setTimeout encadeado: só reagenda após a checagem terminar (não empilha).
  useEffect(() => {
    if (!aguardando || !numero || !cpf) return
    let ativo = true
    let timer: ReturnType<typeof setTimeout>
    const ciclo = () => {
      timer = setTimeout(async () => {
        try {
          const r = await verificarEntradaAction(assembleiaId, numero, bloco, cpf)
          if (!ativo) return
          if (r.ok && r.token) {
            window.location.href = ROUTES.publicCondoVoto(r.token)
            return
          }
          setErroPolling(r.aguardando ? null : (r.error ?? null))
        } catch {
          // falha de rede não derruba a espera — tenta de novo no próximo ciclo
        }
        if (ativo) ciclo()
      }, 7000)
    }
    ciclo()
    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [aguardando, assembleiaId, numero, bloco, cpf])

  // Tela de espera: identidade reconhecida, aguardando a mesa confirmar.
  if (aguardando) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-amber-400/40 bg-amber-500/5 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/20">
          <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
        </div>
        <div>
          <p className="font-medium">Aguardando a mesa confirmar sua presença</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua identidade foi reconhecida. Assim que a mesa marcar você como presente, você entra
            na votação <span className="font-medium text-foreground">automaticamente</span> — não
            precisa digitar de novo. Pode deixar esta tela aberta.
          </p>
        </div>
        {erroPolling && <p className="text-xs text-rose-600 dark:text-rose-400">{erroPolling}</p>}
      </div>
    )
  }

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
