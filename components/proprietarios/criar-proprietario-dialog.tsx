"use client"

import { useState, useTransition } from "react"
import { Plus, X, Loader2 } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createProprietarioAction } from "@/app/actions/proprietarios"

interface CriarProprietarioDialogProps {
  condominioId: string
}

export function CriarProprietarioDialog({ condominioId }: CriarProprietarioDialogProps) {
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [telefone, setTelefone] = useState("")
  const [unidades, setUnidades] = useState<string[]>([""])
  const [isPending, startTransition] = useTransition()

  function reset() {
    setNome("")
    setEmail("")
    setTelefone("")
    setUnidades([""])
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function addUnidade() {
    setUnidades((prev) => [...prev, ""])
  }

  function setUnidadeAt(index: number, value: string) {
    setUnidades((prev) => prev.map((u, i) => (i === index ? value : u)))
  }

  function removeUnidade(index: number) {
    setUnidades((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createProprietarioAction({
        condominio_id: condominioId,
        nome,
        email,
        telefone,
        unidades: unidades.filter((u) => u.trim()),
      })
      if (result.success) {
        toast.success("Proprietário criado com sucesso.")
        handleOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  const canSubmit = nome.trim() && email.trim()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-4 w-4" />
        Novo proprietário
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo proprietário</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome-prop">Nome</Label>
            <Input
              id="nome-prop"
              placeholder="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-prop">E-mail</Label>
            <Input
              id="email-prop"
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefone-prop">
              Celular <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="telefone-prop"
              type="tel"
              placeholder="(64) 98146-9800"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Unidades (imóveis)</Label>
              <button
                type="button"
                onClick={addUnidade}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </button>
            </div>
            <div className="space-y-1.5">
              {unidades.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={`Ex.: 101`}
                    value={u}
                    onChange={(e) => setUnidadeAt(i, e.target.value)}
                    className="h-8 text-sm"
                  />
                  {unidades.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUnidade(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Quantidade de votos deste proprietário, calculada automaticamente pelo número de
              unidades vinculadas.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !canSubmit} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
