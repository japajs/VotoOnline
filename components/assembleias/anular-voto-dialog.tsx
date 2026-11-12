"use client"

import { useMemo, useState, useTransition, type Ref } from "react"
import { Undo2, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmarSenhaDialog } from "@/components/ui/confirmar-senha-dialog"
import { getProprietarioIdsVotaramAction } from "@/app/actions/assembleia-votos"
import { anularVotoAction } from "@/app/actions/proprietarios"
import { normalizarBusca } from "@/lib/format"
import type { Proprietario } from "@/types"

// "Anular voto registrado" (pedido do Carlos): versão em nível de MENU do anular
// que já existe por linha na lista. Por linha é o atalho (quando já se está no
// ponteiro da pessoa); aqui, no menu "Operacionais ▾" da apuração, é o caminho
// NOMEADO pra descoberta — busca quem votou, escolhe, confirma com senha. Reusa
// a MESMA action (anularVotoAction) e a MESMA confirmação (ConfirmarSenhaDialog)
// do atalho por linha, então a trava (senha + só em assembleia em andamento) é
// idêntica. Só anula voto de quem VOTOU — a lista aqui já é filtrada por isso.
interface Props {
  assembleiaId: string
  condominioId: string
  proprietarios: Proprietario[]
  /** Gatilho externo: o item "Anular voto registrado" do menu "Operacionais ▾"
   * abre este diálogo via `abrirPeloTrigger` (gatilho oculto). */
  triggerRef?: Ref<HTMLButtonElement>
  triggerClassName?: string
}

export function AnularVotoDialog({
  assembleiaId,
  condominioId,
  proprietarios,
  triggerRef,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [carregando, setCarregando] = useState(false)
  // Ids de quem votou — carregado toda vez que abre (ao vivo os números mudam).
  // null = ainda não carregou nesta abertura.
  const [idsVotaram, setIdsVotaram] = useState<Set<string> | null>(null)
  const [busca, setBusca] = useState("")
  // Proprietário escolhido pra anular — dispara a confirmação por senha.
  const [selecionado, setSelecionado] = useState<Proprietario | null>(null)
  const [, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setCarregando(true)
      setBusca("")
      startTransition(async () => {
        const r = await getProprietarioIdsVotaramAction(assembleiaId, condominioId)
        setIdsVotaram(new Set(r.ids))
        setCarregando(false)
      })
    } else {
      setIdsVotaram(null)
      setBusca("")
    }
  }

  // Só quem VOTOU pode ter voto anulado.
  const votantes = useMemo(() => {
    if (!idsVotaram) return []
    return proprietarios
      .filter((p) => idsVotaram.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }, [idsVotaram, proprietarios])

  const filtrados = useMemo(() => {
    const q = normalizarBusca(busca)
    if (!q) return votantes
    return votantes.filter((p) => {
      const imoveis = (p.unidades ?? []).map((u) => u.numero).join(" ")
      return normalizarBusca(`${p.nome} ${imoveis}`).includes(q)
    })
  }, [votantes, busca])

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={<Button ref={triggerRef} className={triggerClassName} variant="outline" size="sm" />}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Anular voto
        </DialogTrigger>

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Anular voto registrado</DialogTitle>
            <DialogDescription>
              Escolha quem teve o voto lançado errado. O voto some da apuração (a presença e o
              cadastro continuam). Pede a sua senha pra confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar quem votou…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {carregando ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {votantes.length === 0
                    ? "Ninguém votou ainda nesta assembleia."
                    : "Nenhum proprietário encontrado."}
                </p>
              ) : (
                filtrados.map((p) => {
                  const imoveis = (p.unidades ?? []).map((u) => u.numero).join(", ")
                  return (
                    <button
                      key={p.id}
                      type="button"
                      // Fecha a lista e abre a confirmação por senha — um overlay
                      // por vez (a lista é um Dialog; a confirmação, um AlertDialog).
                      onClick={() => {
                        setSelecionado(p)
                        handleOpenChange(false)
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {imoveis ? <span className="text-primary">{imoveis} · </span> : null}
                        {p.nome}
                      </span>
                      <Undo2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação por senha — mesma do atalho por linha. Fica FORA do Dialog
          da lista (sibling) e só um overlay aparece por vez, porque a lista
          fecha ao escolher a pessoa. */}
      <ConfirmarSenhaDialog
        open={selecionado !== null}
        onOpenChange={(o) => !o && setSelecionado(null)}
        titulo="Anular voto"
        confirmLabel="Anular voto"
        descricao={
          selecionado ? (
            <>
              O voto de <strong className="text-foreground">{selecionado.nome}</strong> nesta
              assembleia será anulado (some da apuração). A presença e o cadastro continuam. Use
              para corrigir um voto lançado errado.
            </>
          ) : (
            ""
          )
        }
        onConfirmar={(senha) =>
          selecionado
            ? anularVotoAction(selecionado.id, condominioId, senha)
            : Promise.resolve({ success: false, error: "Nenhum proprietário selecionado." })
        }
        onSuccess={() => {
          toast.success("Voto anulado.")
          setSelecionado(null)
        }}
      />
    </>
  )
}
