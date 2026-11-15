"use client"

import { useState, useTransition, type Ref } from "react"
import { NotebookPen, Loader2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { atualizarAtaAction } from "@/app/actions/assembleias"

export interface AtaPautaItem {
  id: string
  ordem: number
  titulo: string
  ata_deliberacao: string | null
}

interface Props {
  assembleiaId: string
  condominioId: string
  aberturaInicial: string | null
  encerramentoInicial: string | null
  pautas: AtaPautaItem[]
  /** Deixa o gatilho ser disparado de fora (item do menu "Relatório ▾"), via
   * abrirPeloTrigger. */
  triggerRef?: Ref<HTMLButtonElement>
  /** "hidden" pra esconder o botão-gatilho quando aberto só pelo menu. */
  triggerClassName?: string
}

// Preencher a ata (pedido do Carlos): além da narrativa automática, a mesa
// escreve a ABERTURA (local, convocação etc.), o que foi discutido/decidido em
// CADA pauta, e o ENCERRAMENTO. Tudo opcional — em branco, a seção não aparece
// na ata. A ata em PDF (lib/relatorios/pdf-ata) encaixa esses textos nos lugares
// certos. Salva mesmo com a assembleia em andamento (a secretária anota as
// deliberações conforme as pautas fecham), mas o PDF só sai depois de encerrada.
export function AtaDialog({
  assembleiaId,
  condominioId,
  aberturaInicial,
  encerramentoInicial,
  pautas,
  triggerRef,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [abertura, setAbertura] = useState(aberturaInicial ?? "")
  const [encerramento, setEncerramento] = useState(encerramentoInicial ?? "")
  const [deliberacoes, setDeliberacoes] = useState<Record<string, string>>(() =>
    Object.fromEntries(pautas.map((p) => [p.id, p.ata_deliberacao ?? ""]))
  )
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Ao abrir, re-semeia do que está salvo (props) — descarta edição não salva
    // e reflete o que o servidor já tem.
    if (next) {
      setAbertura(aberturaInicial ?? "")
      setEncerramento(encerramentoInicial ?? "")
      setDeliberacoes(Object.fromEntries(pautas.map((p) => [p.id, p.ata_deliberacao ?? ""])))
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const r = await atualizarAtaAction(assembleiaId, condominioId, {
        abertura,
        encerramento,
        deliberacoes: pautas.map((p) => ({ pautaId: p.id, texto: deliberacoes[p.id] ?? "" })),
      })
      if (r.success) {
        toast.success("Ata salva — entra no PDF da ata.")
        setOpen(false)
      } else {
        toast.error(r.error)
      }
    })
  }

  const pautasOrdenadas = [...pautas].sort((a, b) => a.ordem - b.ordem)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button ref={triggerRef} variant="outline" size="sm" className={`gap-1.5 ${triggerClassName ?? ""}`} />}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        Preencher ata
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preencher a ata da reunião</DialogTitle>
          <DialogDescription>
            Textos que entram na ata, além do resultado de cada pauta. Tudo opcional — em branco, a
            seção não aparece. O PDF da ata fica disponível depois que a assembleia é encerrada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="ata-abertura">Abertura</Label>
            <Textarea
              id="ata-abertura"
              value={abertura}
              onChange={(e) => setAbertura(e.target.value)}
              placeholder="Local, forma de convocação, hora de início, composição da mesa… o que abre a reunião."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Deliberação por pauta</p>
            <p className="text-xs text-muted-foreground">
              O que foi discutido e decidido em cada pauta — vai junto do resultado numérico na ata.
            </p>
            {pautasOrdenadas.map((p, i) => (
              <div key={p.id} className="space-y-1.5">
                <Label htmlFor={`ata-delib-${p.id}`} className="text-xs font-normal text-muted-foreground">
                  {i + 1}. {p.titulo}
                </Label>
                <Textarea
                  id={`ata-delib-${p.id}`}
                  value={deliberacoes[p.id] ?? ""}
                  onChange={(e) =>
                    setDeliberacoes((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                  placeholder="O que foi discutido/decidido nesta pauta."
                  rows={3}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ata-encerramento">Encerramento</Label>
            <Textarea
              id="ata-encerramento"
              value={encerramento}
              onChange={(e) => setEncerramento(e.target.value)}
              placeholder="Hora de encerramento, encaminhamentos finais, agradecimentos… o que fecha a reunião."
              rows={4}
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
