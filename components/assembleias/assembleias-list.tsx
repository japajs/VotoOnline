"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import {
  ClipboardList,
  Trash2,
  LockKeyhole,
  Unlock,
  RotateCcw,
  Pause,
  Play,
  Send,
  MoreVertical,
} from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  ASSEMBLEIA_STATUS_LABEL as STATUS_LABEL,
  ASSEMBLEIA_STATUS_CLASS as STATUS_CLASS,
  isEmAndamento,
} from "@/lib/assembleia-status"
import { DispararAssembleiaDialog } from "./disparar-assembleia-dialog"
import {
  deleteAssembleiaAction,
  updateAssembleiaStatusAction,
  reabrirAssembleiaAction,
} from "@/app/actions/assembleias"
import { ROUTES } from "@/lib/constants"
import { ConfirmarSenhaDialog } from "@/components/ui/confirmar-senha-dialog"
import type { Assembleia, AssembleiaStatus, Proprietario } from "@/types"

// Abre um diálogo a partir de um item de menu: clica o gatilho oculto do
// diálogo. setTimeout(…,0) deixa o menu fechar/devolver o foco antes (mesmo
// padrão do "⋯" da lista de proprietários e dos menus da tela da assembleia).
function abrirPeloTrigger(ref: { current: HTMLButtonElement | null }) {
  setTimeout(() => ref.current?.click(), 0)
}

interface AssembleiasListProps {
  assembleias: Assembleia[]
  condominioId: string
  proprietarios: Proprietario[]
  // Visualizador = só leitura: esconde operar (abrir/pausar/encerrar/disparar/
  // excluir). Mantém o acesso à assembleia (rótulo "Acompanhar" em vez de
  // "Gerenciar") e ao Telão.
  podeOperar?: boolean
}

export function AssembleiasList({
  assembleias,
  condominioId,
  proprietarios,
  podeOperar = true,
}: AssembleiasListProps) {
  if (assembleias.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nenhuma assembleia criada ainda.</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card">
      {assembleias.map((a) => (
        <AssembleiaRow
          key={a.id}
          assembleia={a}
          condominioId={condominioId}
          proprietarios={proprietarios}
          podeOperar={podeOperar}
        />
      ))}
    </div>
  )
}

function AssembleiaRow({
  assembleia,
  condominioId,
  proprietarios,
  podeOperar,
}: {
  assembleia: Assembleia
  condominioId: string
  proprietarios: Proprietario[]
  podeOperar: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [reabrirOpen, setReabrirOpen] = useState(false)
  const pautaCount = assembleia.pautas?.length ?? 0

  // Achado de auditoria: foco inicial nos diálogos abaixo é o botão
  // "Cancelar", não a ação destrutiva/excepcional — quem confirmar sem
  // querer (Enter, toque duplo etc.) cancela por padrão, precisa mover pra
  // excluir/encerrar/reabrir de propósito.
  const cancelReabrirRef = useRef<HTMLButtonElement>(null)
  // Gatilho oculto do "Disparar e-mails" (item do menu de ações da linha).
  const dispararRef = useRef<HTMLButtonElement>(null)

  // successMsg opcional pra dar a mensagem certa por AÇÃO (não por status): ex.
  // "Retomar" (pausada→aberta) diz "Votação retomada", não "aberta". Mesmas
  // frases da tela da assembleia (barra-acoes-assembleia), pras duas baterem.
  function handleStatusChange(nextStatus: AssembleiaStatus, successMsg?: string) {
    startTransition(async () => {
      const result = await updateAssembleiaStatusAction(assembleia.id, condominioId, nextStatus)
      if (result.success) {
        toast.success(successMsg ?? `Assembleia ${STATUS_LABEL[nextStatus].toLowerCase()} com sucesso.`)
      } else {
        toast.error(result.error)
      }
    })
  }

  // Correção excepcional (ver reabrirAssembleia em services/assembleias.ts)
  // — usa uma action própria, não handleStatusChange, porque bypassa a
  // trava normal de "encerrada é definitiva".
  function handleReabrir() {
    setReabrirOpen(false)
    startTransition(async () => {
      const result = await reabrirAssembleiaAction(assembleia.id, condominioId)
      if (result.success) {
        toast.success("Assembleia reaberta.")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[assembleia.status]}`}
        >
          {STATUS_LABEL[assembleia.status]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{assembleia.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {pautaCount} {pautaCount === 1 ? "pauta" : "pautas"}
            {assembleia.quorum_minimo !== null && (
              <>
                {" · quórum mínimo "}
                {Math.round(assembleia.quorum_minimo * 100)}%
                {assembleia.data_1a_convocacao && " (1ª conv.)"}
              </>
            )}
            {assembleia.data_encerramento && (
              <>
                {" · encerra "}
                {new Date(assembleia.data_encerramento).toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Ações da assembleia: "Gerenciar" (ação primária) à mão + um menu "⋯"
          com o resto (status, Disparar, Excluir) — mesmo estilo de menu da tela
          da assembleia (pedido do Carlos: a linha com botões soltos "parecia
          antiga" ao lado do resto já em menus). Enxuga a linha e cabe no
          celular sem quebrar. */}
      <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
        <Link
          href={ROUTES.condominioAssembleia(condominioId, assembleia.id)}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "text-muted-foreground"
          )}
        >
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">{podeOperar ? "Gerenciar" : "Acompanhar"}</span>
          <span className="sm:hidden sr-only">
            {podeOperar ? "Gerenciar assembleia" : "Acompanhar assembleia"}
          </span>
        </Link>

        {podeOperar && (
          <>
            {/* Disparar montado OCULTO, aberto pelo item do menu. */}
            {assembleia.status !== "encerrada" && (
              <DispararAssembleiaDialog
                assembleia={assembleia}
                proprietarios={proprietarios}
                triggerRef={dispararRef}
                triggerClassName="hidden"
              />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground"
                    title="Ações da assembleia"
                  />
                }
              >
                <MoreVertical className="h-3.5 w-3.5" />
                <span className="sr-only">Ações da assembleia</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {assembleia.status === "rascunho" && (
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("aberta", "Votação aberta.")}
                    disabled={isPending}
                  >
                    <Unlock className="h-4 w-4" />
                    Abrir votação
                  </DropdownMenuItem>
                )}
                {assembleia.status === "aberta" && (
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("pausada", "Assembleia pausada.")}
                    disabled={isPending}
                  >
                    <Pause className="h-4 w-4" />
                    Pausar
                  </DropdownMenuItem>
                )}
                {assembleia.status === "pausada" && (
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("aberta", "Votação retomada.")}
                    disabled={isPending}
                  >
                    <Play className="h-4 w-4" />
                    Retomar
                  </DropdownMenuItem>
                )}
                {isEmAndamento(assembleia.status) && (
                  <DropdownMenuItem onClick={() => setEncerrarOpen(true)} disabled={isPending}>
                    <LockKeyhole className="h-4 w-4" />
                    Encerrar
                  </DropdownMenuItem>
                )}
                {assembleia.status === "encerrada" && (
                  <DropdownMenuItem onClick={() => setReabrirOpen(true)} disabled={isPending}>
                    <RotateCcw className="h-4 w-4" />
                    Reabrir
                  </DropdownMenuItem>
                )}
                {assembleia.status !== "encerrada" && (
                  <DropdownMenuItem onClick={() => abrirPeloTrigger(dispararRef)}>
                    <Send className="h-4 w-4" />
                    Disparar e-mails
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir assembleia
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

        <ConfirmarSenhaDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          titulo="Excluir assembleia"
          descricao={
            <>
              <strong className="text-foreground">&quot;{assembleia.titulo}&quot;</strong> e todos os
              votos registrados serão removidos permanentemente. Esta ação não pode ser desfeita.
            </>
          }
          onConfirmar={(senha) => deleteAssembleiaAction(assembleia.id, condominioId, senha)}
        />

        {/* Encerrar pede SENHA (pedido do Carlos: o botão fica colado no
            Disparar e ele encerrava sem querer). Mesmo padrão do excluir —
            digitar a senha evita o encerramento acidental. */}
        <ConfirmarSenhaDialog
          open={encerrarOpen}
          onOpenChange={setEncerrarOpen}
          titulo="Encerrar assembleia"
          confirmLabel="Encerrar"
          descricao={
            <>
              <strong className="text-foreground">&quot;{assembleia.titulo}&quot;</strong> deixará de
              aceitar novos votos. Reabrir depois só em caráter excepcional. Confirme com a sua senha
              para evitar o encerramento acidental.
            </>
          }
          onConfirmar={(senha) =>
            updateAssembleiaStatusAction(assembleia.id, condominioId, "encerrada", senha)
          }
          onSuccess={() => toast.success("Assembleia encerrada com sucesso.")}
        />

        <AlertDialog open={reabrirOpen} onOpenChange={setReabrirOpen}>
          <AlertDialogContent initialFocus={cancelReabrirRef}>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir assembleia?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>&quot;{assembleia.titulo}&quot;</strong> volta para &quot;Aberta&quot; e todas as pautas voltam
                a aceitar voto — inclusive uma apuração já divulgada pode mudar enquanto estiver
                reaberta. Use só pra corrigir um problema pontual (ex.: remover um voto indevido) e
                encerre de novo assim que terminar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancelReabrirRef}>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="outline" onClick={handleReabrir}>
                Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </>
        )}
      </div>
    </div>
  )
}
