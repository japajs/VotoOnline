"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock, Loader2, PauseCircle, Vote } from "lucide-react"
import { AssembleiaVotoForm } from "@/components/assembleias/assembleia-voto-form"
import { getEstadoVotoAction, type EstadoVoto } from "@/app/actions/assembleia-votos"

const POLL_MS = 10_000

// Tela do eleitor na votação PAUTA POR PAUTA (Fase 2): mostra só a pauta que a
// mesa abriu agora, deixa votar pauta a pauta e se atualiza sozinha (polling) —
// quando a mesa abre a próxima, aparece aqui sem recarregar.
export function VotoPautaPorPautaLive({
  token,
  assembleiaTitulo,
  inicial,
}: {
  token: string
  assembleiaTitulo: string
  inicial: EstadoVoto
}) {
  const [estado, setEstado] = useState<EstadoVoto>(inicial)

  const refresh = useCallback(async () => {
    const novo = await getEstadoVotoAction(token)
    if (!novo) return
    // Encerrou, ou o participante acabou de votar TODAS as pautas: recarrega
    // pra cair na tela certa do servidor (resultado / confirmação final).
    if (
      novo.status === "encerrada" ||
      (novo.pautas.length > 0 && novo.pautas.every((p) => p.jaVotou))
    ) {
      window.location.reload()
      return
    }
    setEstado(novo)
  }, [token])

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const pautas = estado.pautas
  const total = pautas.length
  const nVotadas = pautas.filter((p) => p.jaVotou).length
  const abertasPendentes = pautas.filter((p) => p.votacaoAberta && !p.jaVotou)
  const pausada = estado.status === "pausada"
  // key muda quando o conjunto de pautas abertas muda → o formulário reinicia
  // limpo na próxima pauta.
  const formKey = abertasPendentes.map((p) => p.id).join(",")

  return (
    <div className="space-y-5">
      {/* Progresso: todas as pautas e em que pé cada uma está */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">
            {nVotadas} de {total} {total === 1 ? "pauta votada" : "pautas votadas"}
          </p>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            ao vivo
          </span>
        </div>
        <ul className="space-y-1.5">
          {pautas.map((p, i) => {
            const estadoPauta = p.jaVotou
              ? "votada"
              : p.votacaoAberta
                ? "aberta"
                : "aguardando"
            return (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-border/40 bg-background px-3 py-2 text-sm"
              >
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate">{p.titulo}</span>
                {estadoPauta === "votada" ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Votada
                  </span>
                ) : estadoPauta === "aberta" ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Aberta
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Aguardando
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Área de ação */}
      {pausada ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/20">
            <PauseCircle className="h-6 w-6 text-amber-500" />
          </div>
          <p className="text-sm text-muted-foreground">
            Votação pausada temporariamente pela mesa. Assim que retomar, a pauta aberta aparece aqui.
          </p>
        </div>
      ) : abertasPendentes.length > 0 ? (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary/70">
            <Vote className="h-3.5 w-3.5" />
            {abertasPendentes.length === 1 ? "Pauta aberta para votação" : "Pautas abertas para votação"}
          </p>
          <AssembleiaVotoForm
            key={formKey}
            sendId={estado.sendId}
            pautas={abertasPendentes}
            assembleiaTitulo={assembleiaTitulo}
            onDone={refresh}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">
              {nVotadas > 0 ? "Voto registrado!" : "Aguardando a mesa abrir a pauta"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              A mesa está conduzindo a assembleia pauta por pauta. Quando a próxima pauta for aberta,
              ela aparece aqui automaticamente — pode deixar esta tela aberta.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
