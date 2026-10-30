"use client"

import { useState, useTransition } from "react"
import { Pencil, X, ChevronUp, ChevronDown, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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
import { Textarea } from "@/components/ui/textarea"
import { editarPautaAction } from "@/app/actions/assembleias"
import { MIN_OPCOES } from "@/components/assembleias/use-assembleia-form"
import type { Pauta, PautaTipo } from "@/types"

const MAX_OPCOES = 8

interface Props {
  pauta: Pauta
  assembleiaId: string
  condominioId: string
}

// Item 2 do pedido: edição de UMA pauta específica, liberada enquanto ela
// mesma ainda não tem voto (rascunho/aberta) — independente do status das
// demais pautas da assembleia. Nunca aparece para pauta em_votacao/encerrada
// (ver gate em apuracao-assembleia.tsx).
export function EditarPautaDialog({ pauta, assembleiaId, condominioId }: Props) {
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState(pauta.titulo)
  const [descricao, setDescricao] = useState(pauta.descricao ?? "")
  const [tipo, setTipo] = useState<PautaTipo>(pauta.tipo)
  const [permiteAbstencao, setPermiteAbstencao] = useState(pauta.permite_abstencao)
  const [quorumAprovacao, setQuorumAprovacao] = useState(String(Math.round(pauta.quorum_aprovacao * 10000) / 100))
  const [sigiloso, setSigiloso] = useState(pauta.sigiloso)
  const [opcoes, setOpcoes] = useState<string[]>(
    pauta.opcoes && pauta.opcoes.length > 0 ? pauta.opcoes.map((o) => o.label) : ["", ""]
  )
  const [isPending, startTransition] = useTransition()

  function reset() {
    setTitulo(pauta.titulo)
    setDescricao(pauta.descricao ?? "")
    setTipo(pauta.tipo)
    setPermiteAbstencao(pauta.permite_abstencao)
    setQuorumAprovacao(String(Math.round(pauta.quorum_aprovacao * 10000) / 100))
    setSigiloso(pauta.sigiloso)
    setOpcoes(pauta.opcoes && pauta.opcoes.length > 0 ? pauta.opcoes.map((o) => o.label) : ["", ""])
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setTimeout(reset, 200)
  }

  const opcoesValidas = opcoes.map((o) => o.trim()).filter(Boolean).length
  const quorumNum = Number(quorumAprovacao.replace(",", "."))
  const quorumValido = !Number.isNaN(quorumNum) && quorumNum > 0 && quorumNum <= 100
  // Motivo do bloqueio do Salvar, em texto (não travar o botão em silêncio).
  const motivoBloqueio: string | null = !titulo.trim()
    ? "Informe o título da pauta."
    : tipo === "multipla_escolha" && opcoesValidas < MIN_OPCOES
      ? `Múltipla escolha precisa de pelo menos ${MIN_OPCOES} opções preenchidas.`
      : tipo === "sim_nao" && !quorumValido
        ? "Informe um quórum de aprovação válido (entre 1 e 100)."
        : null
  const canSubmit = motivoBloqueio === null

  function handleSalvar() {
    startTransition(async () => {
      const result = await editarPautaAction({
        pautaId: pauta.id,
        condominioId,
        assembleiaId,
        titulo,
        descricao,
        tipo,
        permite_abstencao: permiteAbstencao,
        quorum_aprovacao: tipo === "sim_nao" ? quorumNum / 100 : undefined,
        sigiloso,
        opcoes: tipo === "multipla_escolha" ? opcoes : undefined,
      })
      if (result.success) {
        toast.success("Pauta atualizada.")
        handleOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" />}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="sr-only">Editar pauta</span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pauta</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto px-1">
          <Input placeholder="Título da pauta" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          <Textarea
            placeholder="Descrição (opcional)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            className="resize-none"
          />

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setTipo("sim_nao")}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium",
                tipo === "sim_nao" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
              )}
            >
              Sim / Não
            </button>
            <button
              type="button"
              onClick={() => setTipo("multipla_escolha")}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium",
                tipo === "multipla_escolha" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
              )}
            >
              Múltipla escolha
            </button>
          </div>

          {tipo === "sim_nao" && (
            <div className="flex items-center gap-1.5">
              <Label htmlFor="editar-pauta-quorum" className="shrink-0 text-xs text-muted-foreground">
                Quórum de aprovação (%)
              </Label>
              <Input
                id="editar-pauta-quorum"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={quorumAprovacao}
                onChange={(e) => setQuorumAprovacao(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          )}

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={sigiloso}
              onChange={(e) => setSigiloso(e.target.checked)}
              className="accent-primary"
            />
            Voto sigiloso
            <span className="font-normal">(oculta nome↔voto no PDF/Excel)</span>
          </label>

          {tipo === "multipla_escolha" && (
            <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
              {opcoes.map((opcao, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    placeholder={`Opção ${i + 1}`}
                    value={opcao}
                    onChange={(e) => setOpcoes((prev) => prev.map((o, oi) => (oi === i ? e.target.value : o)))}
                    className="h-8 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setOpcoes((prev) => {
                        const next = [...prev]
                        if (i > 0) [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
                        return next
                      })
                    }
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpcoes((prev) => {
                        const next = [...prev]
                        if (i < next.length - 1) [next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
                        return next
                      })
                    }
                    disabled={i === opcoes.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {opcoes.length > MIN_OPCOES && (
                    <button
                      type="button"
                      onClick={() => setOpcoes((prev) => prev.filter((_, oi) => oi !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {opcoes.length < MAX_OPCOES && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpcoes((prev) => [...prev, ""])}
                  className="h-7 w-full gap-1.5 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Adicionar opção
                </Button>
              )}
              {opcoesValidas < MIN_OPCOES && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Adicione pelo menos {MIN_OPCOES} opções preenchidas.
                </p>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={permiteAbstencao}
                  onChange={() => setPermiteAbstencao((v) => !v)}
                  className="accent-primary"
                />
                Permitir abstenção
              </label>
            </div>
          )}
        </div>

        {motivoBloqueio && (
          <p className="px-1 text-xs text-destructive">{motivoBloqueio}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={isPending || !canSubmit} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
