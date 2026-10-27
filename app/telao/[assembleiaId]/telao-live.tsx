"use client"

import { useEffect, useState } from "react"
import { ResultadoAssembleia } from "@/components/assembleias/resultado-assembleia"
import { QrEntrada, useEntradaUrl } from "@/components/assembleias/qr-entrada"
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

  // setTimeout ENCADEADO (não setInterval): o próximo refresh só é agendado
  // depois que o atual termina. O telão fica projetado a assembleia inteira e é
  // o poller mais pesado (apuração + votos detalhados); com setInterval fixo, um
  // banco lento faria as consultas EMPILHAREM (feedback loop de carga). Falha de
  // refresh é tolerada — mantém os últimos dados na tela em vez de quebrar.
  useEffect(() => {
    let ativo = true
    let timer: ReturnType<typeof setTimeout>
    const agendar = () => {
      timer = setTimeout(async () => {
        try {
          const r = await getTelaoDataAction(assembleiaId, condominioId)
          if (ativo && r.success && r.data) {
            setData(r.data)
            setAtualizadoEm(new Date())
          }
        } catch {
          // mantém os últimos dados projetados; tenta de novo no próximo ciclo
        }
        if (ativo) agendar()
      }, INTERVALO_MS)
    }
    agendar()
    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [assembleiaId, condominioId])

  const parcial = data.status !== "encerrada"
  const entradaUrl = useEntradaUrl(assembleiaId)

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

      <div className="mx-auto max-w-5xl px-6 pt-8 pb-44 sm:pb-8">
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

      {/* QR FIXO no canto: fica SEMPRE na tela enquanto a votação está aberta,
          mesmo rolando o telão ou trocando de pauta (pedido do Carlos — "igual
          anúncio que fica fixo enquanto a página rola"). `position: fixed` faz
          ele flutuar por cima do conteúdo que rola embaixo. Some ao encerrar.
          Observação (dita ao Carlos): isto vale DENTRO do telão; um site não
          consegue flutuar por cima de OUTROS programas (ex.: PowerPoint). */}
      {parcial && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-xl backdrop-blur-sm sm:bottom-6 sm:right-6">
          <div className="shrink-0 rounded-lg border border-border/60 bg-white p-2">
            <QrEntrada url={entradaUrl} size={148} />
          </div>
          <div className="max-w-[150px]">
            <p className="text-base font-bold leading-tight sm:text-lg">Escaneie para votar</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entre com a sua <span className="font-semibold text-foreground">unidade</span> e o{" "}
              <span className="font-semibold text-foreground">CPF</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
