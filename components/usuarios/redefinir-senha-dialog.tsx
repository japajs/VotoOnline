"use client"

import { useState, useTransition } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { redefinirSenhaUsuarioAction } from "@/app/actions/usuarios"

export function RedefinirSenhaDialog({ usuarioId }: { usuarioId: string }) {
  const [open, setOpen] = useState(false)
  const [senha, setSenha] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSenha("")
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await redefinirSenhaUsuarioAction(usuarioId, senha)
      if (result.success) {
        toast.success("Senha redefinida com sucesso.")
        handleOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}>
        <KeyRound className="h-3.5 w-3.5" />
        <span className="sr-only">Redefinir senha</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="nova-senha">Nova senha</Label>
          <PasswordInput
            id="nova-senha"
            placeholder="Mínimo 8 caracteres"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || senha.length < 8} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Redefinir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
