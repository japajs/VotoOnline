"use client"

import { useState, useTransition } from "react"
import { Users, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { atualizarMesaAction } from "@/app/actions/assembleias"

interface Props {
  assembleiaId: string
  condominioId: string
  presidenteInicial: string | null
  secretarioInicial: string | null
}

// Mesa da assembleia (pedido do Carlos): presidente e secretário que assinam a
// ata junto do síndico. Nomes opcionais — em branco, a ata mostra só a linha
// com o cargo (assina à mão). Fica na tela da apuração, perto do botão da Ata.
export function MesaAssembleiaDialog({
  assembleiaId,
  condominioId,
  presidenteInicial,
  secretarioInicial,
}: Props) {
  const [open, setOpen] = useState(false)
  const [presidente, setPresidente] = useState(presidenteInicial ?? "")
  const [secretario, setSecretario] = useState(secretarioInicial ?? "")
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Ao abrir, re-semeia do que está salvo (props) — descarta edição não salva
    // de uma abertura anterior e reflete o que o servidor já tem.
    if (next) {
      setPresidente(presidenteInicial ?? "")
      setSecretario(secretarioInicial ?? "")
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const r = await atualizarMesaAction(assembleiaId, condominioId, presidente, secretario)
      if (r.success) {
        toast.success("Mesa salva — sai na ata.")
        setOpen(false)
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <Users className="h-3.5 w-3.5" />
        Mesa
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mesa da assembleia</DialogTitle>
          <DialogDescription>
            Presidente e secretário que assinam a ata, junto do síndico. Opcionais — em branco, a ata
            mostra só a linha com o cargo (assina à mão).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mesa-presidente">Presidente da mesa</Label>
            <Input
              id="mesa-presidente"
              value={presidente}
              // Nome não tem números — remove dígitos conforme digita (padrão do
              // app, ver cadastro de proprietário).
              onChange={(e) => setPresidente(e.target.value.replace(/[0-9]/g, ""))}
              placeholder="Nome de quem presidiu"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mesa-secretario">Secretário(a)</Label>
            <Input
              id="mesa-secretario"
              value={secretario}
              onChange={(e) => setSecretario(e.target.value.replace(/[0-9]/g, ""))}
              placeholder="Nome de quem secretariou"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
