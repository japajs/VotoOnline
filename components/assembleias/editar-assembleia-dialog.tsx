"use client"

import { useState, useTransition } from "react"
import { Pencil, Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { updateAssembleiaAction } from "@/app/actions/assembleias"
import { useAssembleiaForm, type PautaFormState } from "./use-assembleia-form"
import { AssembleiaFormFields } from "./assembleia-form-fields"
import type { Assembleia } from "@/types"

interface Props {
  assembleia: Assembleia
  condominioId: string
  /** true quando já existe pelo menos um voto registrado — bloqueia edição
   * de pautas (título/descrição/datas continuam editáveis). Recalculado no
   * servidor de qualquer forma; isto só controla o que a tela mostra. */
  temVotos: boolean
}

// "YYYY-MM-DDTHH:mm" em horário local, formato que o input datetime-local
// espera — mesma convenção usada ao criar (new Date(valor).toISOString()).
function isoParaDatetimeLocal(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Fração (0–1) vinda do banco → percentual em texto pro form (ver
// pctParaFracao em use-assembleia-form.ts, o caminho inverso).
function fracaoParaPctTexto(fracao: number | null): string {
  if (fracao === null) return ""
  return String(Math.round(fracao * 10000) / 100)
}

function pautasParaFormState(assembleia: Assembleia): PautaFormState[] {
  const pautas = assembleia.pautas ?? []
  if (pautas.length === 0) return []
  return pautas.map((p) => ({
    titulo: p.titulo,
    descricao: p.descricao ?? "",
    tipo: p.tipo,
    permiteAbstencao: p.permite_abstencao,
    quorumAprovacao: fracaoParaPctTexto(p.quorum_aprovacao) || "50",
    sigiloso: p.sigiloso,
    opcoes: (p.opcoes ?? []).map((o) => o.label),
  }))
}

export function EditarAssembleiaDialog({ assembleia, condominioId, temVotos }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const encerrada = assembleia.status === "encerrada"
  const pautasEditaveis = !encerrada && !temVotos

  const form = useAssembleiaForm({
    titulo: assembleia.titulo,
    descricao: assembleia.descricao ?? "",
    dataAbertura: isoParaDatetimeLocal(assembleia.data_abertura),
    dataEncerramento: isoParaDatetimeLocal(assembleia.data_encerramento),
    quorumMinimo: fracaoParaPctTexto(assembleia.quorum_minimo),
    data1aConvocacao: isoParaDatetimeLocal(assembleia.data_1a_convocacao),
    quorumMinimo2a: fracaoParaPctTexto(assembleia.quorum_minimo_2a),
    pautas: pautasParaFormState(assembleia),
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      form.reset({
        titulo: assembleia.titulo,
        descricao: assembleia.descricao ?? "",
        dataAbertura: isoParaDatetimeLocal(assembleia.data_abertura),
        dataEncerramento: isoParaDatetimeLocal(assembleia.data_encerramento),
        quorumMinimo: fracaoParaPctTexto(assembleia.quorum_minimo),
        data1aConvocacao: isoParaDatetimeLocal(assembleia.data_1a_convocacao),
        quorumMinimo2a: fracaoParaPctTexto(assembleia.quorum_minimo_2a),
        pautas: pautasParaFormState(assembleia),
      })
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await updateAssembleiaAction({
        id: assembleia.id,
        condominio_id: condominioId,
        titulo: form.titulo,
        descricao: form.descricao,
        data_abertura: form.dataAbertura ? new Date(form.dataAbertura).toISOString() : null,
        data_encerramento: form.dataEncerramento ? new Date(form.dataEncerramento).toISOString() : null,
        quorum_minimo: form.pctParaFracao(form.quorumMinimo) ?? null,
        data_1a_convocacao: form.data1aConvocacao ? new Date(form.data1aConvocacao).toISOString() : null,
        quorum_minimo_2a: form.pctParaFracao(form.quorumMinimo2a) ?? null,
        pautas: pautasEditaveis
          ? form.pautas.map((p) => ({
              titulo: p.titulo,
              descricao: p.descricao,
              tipo: p.tipo,
              permite_abstencao: p.permiteAbstencao,
              quorum_aprovacao: form.pctParaFracao(p.quorumAprovacao),
              sigiloso: p.sigiloso,
              opcoes: p.tipo === "multipla_escolha" ? p.opcoes : undefined,
            }))
          : null,
      })
      if (result.success) {
        toast.success("Assembleia atualizada com sucesso.")
        handleOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  // Encerrada: nem abre o formulário — mostra só o aviso, como pedido.
  if (encerrada) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" variant="ghost" />}>
          <Pencil className="h-3.5 w-3.5" />
          Editar Assembleia
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Assembleia encerrada
            </DialogTitle>
            <DialogDescription>
              Esta assembleia está encerrada e não pode mais ser alterada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>
        <Pencil className="h-3.5 w-3.5" />
        Editar Assembleia
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar assembleia</DialogTitle>
        </DialogHeader>

        <AssembleiaFormFields
          form={form}
          pautasEditaveis={pautasEditaveis}
          mensagemPautasBloqueadas="Esta assembleia já possui votos registrados. Para preservar a integridade da votação, as pautas não podem mais ser alteradas."
          idPrefix="editar-asm"
        />

        {/* Por que o Salvar está bloqueado — perto do botão, pra não ficar o
            "não salva e não sei por quê" (bug do Carlos). */}
        {form.motivoBloqueio && (
          <p className="px-1 text-xs text-destructive">{form.motivoBloqueio}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.canSubmit} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
