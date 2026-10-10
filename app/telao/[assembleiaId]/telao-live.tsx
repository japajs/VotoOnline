"use client"

import { useEffect, useState } from "react"
import { ResultadoAssembleia } from "@/components/assembleias/resultado-assembleia"
import { getTelaoDataAction } from "@/app/actions/telao"
import { APP_NAME } from "@/lib/constants"
import type { TelaoData } from "@/services/telao"

const INTERVALO_MS = 8000

interface Props {
  assembleiaId: string
  condominioId: string
  inicial: TelaoData
}

// Projeção ao vivo: re-busca os dados a cada ~8s e re-renderiza a mesma visão
// de resultado parcial que o morador já vê depois de votar. Sem F5, sem
// recarregar a página inteira.
export function TelaoLive({ assembleiaId, condominioId, inicial }: Props) {
  const [data, setData] = useState<TelaoData>(inicial)
  const [atualizadoEm, setAtualizadoEm] = useState<Date>(() => new Date())

  useEffect(() => {
    let ativo = true
    const id = setInterval(async () => {
      const r = await getTelaoDataAction(assembleiaId, condominioId)
      if (ativo && r.success && r.data) {
        setData(r.data)
        setAtualizadoEm(new Date())
      }
    }, INTERVALO_MS)
    return () => {
      ativo = false
      clearInterval(id)
    }
  }, [assembleiaId, condominioId])

  const parcial = data.status !== "encerrada"

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">
              {data.condominioNome ?? APP_NAME}
            </p>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{data.titulo}</h1>
          </div>
          <span
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
              parcial
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
            }`}
          >
            {parcial && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            )}
            {parcial ? "AO VIVO" : "ENCERRADA"}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <ResultadoAssembleia
          condominio_nome={data.condominioNome}
          data_abertura={data.dataAbertura}
          data_encerramento={data.dataEncerramento}
          apuracao={data.apuracao}
          criterioPeso={data.criterioPeso}
          votosDetalhados={data.votosDetalhados}
          parcial={parcial}
        />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Atualiza automaticamente · última atualização às{" "}
          {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
      </div>
    </div>
  )
}
