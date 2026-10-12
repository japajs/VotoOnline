"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  descricao: React.ReactNode
  // Rótulo do botão que confirma (padrão "Excluir").
  confirmLabel?: string
  // Recebe a senha digitada e executa a ação de exclusão. A verificação da
  // senha acontece no servidor, dentro dessa ação — aqui só repassamos.
  onConfirmar: (senha: string) => Promise<{ success: boolean; error?: string }>
  onSuccess?: () => void
}

// Diálogo de confirmação por senha para ações destrutivas (pedido do Carlos):
// um clique errado durante a assembleia não pode apagar trabalho em andamento.
// O usuário precisa digitar a própria senha; a ação só roda se ela conferir.
export function ConfirmarSenhaDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  confirmLabel = "Excluir",
  onConfirmar,
  onSuccess,
}: Props) {
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setSenha("")
    setErro(null)
  }

  function handleOpenChange(o: boolean) {
    if (isPending) return
    if (!o) reset()
    onOpenChange(o)
  }

  function handleConfirmar() {
    if (!senha.trim()) {
      setErro("Digite sua senha para confirmar.")
      return
    }
    startTransition(async () => {
      const r = await onConfirmar(senha)
      if (r.success) {
        reset()
        onOpenChange(false)
        onSuccess?.()
      } else {
        setErro(r.error ?? "Não foi possível concluir a exclusão.")
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <AlertTriangle />
          </AlertDialogMedia>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="confirmar-senha-exclusao" className="text-xs font-medium text-muted-foreground">
            Digite sua senha para confirmar
          </label>
          <Input
            id="confirmar-senha-exclusao"
            type="password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              if (erro) setErro(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleConfirmar()
              }
            }}
            placeholder="Sua senha"
            autoFocus
            autoComplete="current-password"
            disabled={isPending}
          />
          {erro && <p className="text-xs font-medium text-destructive">{erro}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirmar}
            disabled={isPending || !senha.trim()}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
