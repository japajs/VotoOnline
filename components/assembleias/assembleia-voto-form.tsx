"use client"

import { useState, useTransition } from "react"
import { Loader2, Send, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { registrarVotosAction } from "@/app/actions/assembleia-votos"
import type { RespostaInput } from "@/services/assembleia-votos"
import type { AssembleiaRespostaValor, Pauta } from "@/types"

// Guarda o id da opção escolhida (pautas "multipla_escolha") ou um dos
// valores fixos abaixo (pautas "sim_nao", ou abstenção em qualquer tipo).
type ValorEscolhido = string

const OPCOES: { valor: AssembleiaRespostaValor; colorSelected: string; colorHover: string }[] = [
  {
    valor: "Sim",
    colorSelected: "border-emerald-500 bg-emerald-500 text-white",
    colorHover: "border-border bg-card text-foreground hover:border-emerald-500/60",
  },
  {
    valor: "Não",
    colorSelected: "border-rose-500 bg-rose-500 text-white",
    colorHover: "border-border bg-card text-foreground hover:border-rose-500/60",
  },
  {
    valor: "Abstenção",
    colorSelected: "border-amber-500 bg-amber-500 text-white",
    colorHover: "border-border bg-card text-foreground hover:border-amber-500/60",
  },
]

// Formato mínimo que este formulário realmente usa pra renderizar e votar —
// tanto a Pauta completa quanto o estado ao vivo (EstadoVotoPauta) se encaixam.
export interface PautaVotavel {
  id: string
  ordem: number
  titulo: string
  descricao: string | null
  tipo: Pauta["tipo"]
  permite_abstencao: boolean
  opcoes?: { id: string; label: string }[]
}

interface Props {
  sendId: string
  pautas: PautaVotavel[]
  assembleiaTitulo: string
  // Auditoria de assembleias — Fase 7: o dialog de registro manual
  // (síndico lançando voto de quem não tem e-mail/votou presencialmente)
  // reaproveita este mesmo formulário, só troca qual action é chamada —
  // sem isso, a UI de seleção Sim/Não/Múltipla escolha ficaria duplicada
  // em dois lugares e sujeita a divergir com o tempo. Sem essa prop,
  // comportamento idêntico ao de sempre (voto público via token).
  registrarAction?: (sendId: string, votos: RespostaInput[]) => Promise<{ success: boolean; error?: string }>
  onDone?: () => void
}

export function AssembleiaVotoForm({
  sendId,
  pautas,
  assembleiaTitulo,
  registrarAction = registrarVotosAction,
  onDone,
}: Props) {
  const [respostas, setRespostas] = useState<Record<string, ValorEscolhido>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  const allAnswered = pautas.every((p) => respostas[p.id])
  const unansweredCount = pautas.filter((p) => !respostas[p.id]).length

  function pick(pautaId: string, valor: ValorEscolhido) {
    setRespostas((prev) => ({ ...prev, [pautaId]: valor }))
    if (error) setError(null)
  }

  function handleSubmit() {
    if (!allAnswered) {
      setError(
        `Responda ${unansweredCount === 1 ? "a pauta pendente" : `as ${unansweredCount} pautas pendentes`} antes de confirmar.`
      )
      return
    }
    startTransition(async () => {
      const votos: RespostaInput[] = pautas.map((p) => {
        const valor = respostas[p.id]!
        if (p.tipo === "multipla_escolha" && valor !== "Abstenção") {
          return { pauta_id: p.id, opcao_id: valor }
        }
        return { pauta_id: p.id, resposta: valor as AssembleiaRespostaValor }
      })
      const result = await registrarAction(sendId, votos)
      if (result.success) {
        setDone(true)
        onDone?.()
      } else {
        setError(result.error ?? "Erro ao registrar votos. Tente novamente.")
      }
    })
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/20">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <div>
          <p className="font-medium">Votos registrados!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua participação em <span className="font-medium">{assembleiaTitulo}</span> foi
            registrada. Obrigado!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {pautas.map((pauta) => {
        const resposta = respostas[pauta.id] ?? null
        return (
          <div
            key={pauta.id}
            className="rounded-xl border border-border/60 bg-card p-5 space-y-4"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary/60">
                Pauta {pauta.ordem}
              </p>
              <p className="mt-1 text-sm font-medium leading-snug">{pauta.titulo}</p>
              {pauta.descricao && (
                <p className="mt-1 whitespace-pre-line text-justify text-sm leading-relaxed text-muted-foreground">
                  {pauta.descricao}
                </p>
              )}
            </div>

            {pauta.tipo === "multipla_escolha" ? (
              <div className="flex flex-col gap-2">
                {(pauta.opcoes ?? []).map((opcao) => {
                  const selected = resposta === opcao.id
                  return (
                    <button
                      key={opcao.id}
                      type="button"
                      onClick={() => pick(pauta.id, opcao.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-primary/60"
                      )}
                    >
                      {opcao.label}
                    </button>
                  )
                })}
                {pauta.permite_abstencao && (
                  <button
                    type="button"
                    onClick={() => pick(pauta.id, "Abstenção")}
                    aria-pressed={resposta === "Abstenção"}
                    className={cn(
                      "flex items-center justify-center rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                      resposta === "Abstenção"
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-border bg-card text-foreground hover:border-amber-500/60"
                    )}
                  >
                    Abstenção
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                {OPCOES.map(({ valor, colorSelected, colorHover }) => {
                  const selected = resposta === valor
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => pick(pauta.id, valor)}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-1 items-center justify-center rounded-xl border-2 py-3.5 text-sm font-medium transition-all",
                        selected ? colorSelected : colorHover
                      )}
                    >
                      {valor}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {allAnswered
            ? `${pautas.length} ${pautas.length === 1 ? "pauta respondida" : "pautas respondidas"}`
            : `${unansweredCount} ${unansweredCount === 1 ? "pauta pendente" : "pautas pendentes"}`}
        </p>
        <Button onClick={handleSubmit} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {isPending ? "Enviando…" : "Confirmar votos"}
        </Button>
      </div>
    </div>
  )
}
