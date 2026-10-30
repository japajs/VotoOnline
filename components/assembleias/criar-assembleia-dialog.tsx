"use client"

import { useState, useTransition } from "react"
import { Plus, Loader2 } from "lucide-react"
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
import { createAssembleiaAction } from "@/app/actions/assembleias"
import { useAssembleiaForm } from "./use-assembleia-form"
import { AssembleiaFormFields } from "./assembleia-form-fields"

export function CriarAssembleiaDialog({ condominioId }: { condominioId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useAssembleiaForm()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) form.reset()
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createAssembleiaAction({
        condominio_id: condominioId,
        titulo: form.titulo,
        descricao: form.descricao,
        data_abertura: form.dataAbertura ? new Date(form.dataAbertura).toISOString() : null,
        data_encerramento: form.dataEncerramento ? new Date(form.dataEncerramento).toISOString() : null,
        quorum_minimo: form.pctParaFracao(form.quorumMinimo) ?? null,
        data_1a_convocacao: form.data1aConvocacao ? new Date(form.data1aConvocacao).toISOString() : null,
        quorum_minimo_2a: form.pctParaFracao(form.quorumMinimo2a) ?? null,
        pautas: form.pautas.map((p) => ({
          titulo: p.titulo,
          descricao: p.descricao,
          tipo: p.tipo,
          permite_abstencao: p.permiteAbstencao,
          quorum_aprovacao: form.pctParaFracao(p.quorumAprovacao),
          sigiloso: p.sigiloso,
          opcoes: p.tipo === "multipla_escolha" ? p.opcoes : undefined,
        })),
      })
      if (result.success) {
        toast.success("Assembleia criada com sucesso.")
        handleOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-4 w-4" />
        Nova assembleia
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova assembleia</DialogTitle>
        </DialogHeader>

        <AssembleiaFormFields form={form} pautasEditaveis idPrefix="criar-asm" />

        {/* Por que o Criar está bloqueado — perto do botão (mesma ideia da
            edição: nada de "não salva sem avisar por quê"). */}
        {form.motivoBloqueio && (
          <p className="px-1 text-xs text-destructive">{form.motivoBloqueio}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.canSubmit} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
