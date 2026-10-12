"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Building2, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteCondominioAction, updateCondominioAction } from "@/app/actions/condominios"
import { ConfirmarSenhaDialog } from "@/components/ui/confirmar-senha-dialog"
import { ROUTES } from "@/lib/constants"
import type { Condominio } from "@/types"

interface CondominiosListProps {
  condominios: Condominio[]
}

export function CondominiosList({ condominios }: CondominiosListProps) {
  if (condominios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nenhum condomínio cadastrado ainda.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      {condominios.map((condo, i) => (
        <CondominioRow
          key={condo.id}
          condo={condo}
          isLast={i === condominios.length - 1}
        />
      ))}
    </div>
  )
}

function CondominioRow({
  condo,
  isLast,
}: {
  condo: Condominio
  isLast: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [nome, setNome] = useState(condo.nome)
  const [showExcluir, setShowExcluir] = useState(false)
  const [isPendingRename, startRenameTransition] = useTransition()

  function handleRename() {
    if (!nome.trim() || nome.trim() === condo.nome) { setEditing(false); return }
    startRenameTransition(async () => {
      const result = await updateCondominioAction(condo.id, nome.trim())
      if (result.success) {
        toast.success("Nome atualizado.")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3.5 ${!isLast ? "border-b border-border/40" : ""}`}
    >
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setNome(condo.nome); setEditing(false) } }}
            className="text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={handleRename}
            disabled={isPendingRename || !nome.trim()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 text-xs text-primary hover:underline disabled:opacity-40"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => { setNome(condo.nome); setEditing(false) }}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 text-xs text-muted-foreground hover:underline"
          >
            ✕
          </button>
        </div>
      ) : (
        <Link
          href={`${ROUTES.condominios}/${condo.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{condo.nome}</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40" />
        </Link>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Renomear</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowExcluir(true)}
          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Excluir</span>
        </Button>
      </div>

      <ConfirmarSenhaDialog
        open={showExcluir}
        onOpenChange={setShowExcluir}
        titulo="Excluir condomínio"
        descricao={
          <>
            <strong className="text-foreground">&quot;{condo.nome}&quot;</strong> e todos os
            proprietários, unidades e assembleias vinculados serão removidos permanentemente. Esta
            ação não pode ser desfeita.
          </>
        }
        onConfirmar={(senha) => deleteCondominioAction(condo.id, senha)}
      />
    </div>
  )
}
