"use client"

import { useEffect, useState } from "react"
import { ResultadoAssembleia } from "@/components/assembleias/resultado-assembleia"
import { QrEntrada, useEntradaUrl } from "@/components/assembleias/qr-entrada"
import { getTelaoDataAction } from "@/app/actions/telao"
import { isEmAndamento } from "@/lib/assembleia-status"
import { APP_NAME } from "@/lib/constants"
import type { TelaoData } from "@/services/telao"
import type { AssembleiaStatus } from "@/types"

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
  // Hora da última atualização: começa NULL e só é definida no CLIENTE (no efeito
  // abaixo). Se renderizasse no SSR, o `new Date()` do servidor (UTC, de um
  // instante) não bateria com o do navegador na hidratação (fuso + instante
  // diferentes) → erro de hidratação React #418. Mesmo padrão do useEntradaUrl.
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)

  // setTimeout ENCADEADO (não setInterval): o próximo refresh só é agendado
  // depois que o atual termina. O telão fica projetado a assembleia inteira e é
  // o poller mais pesado (apuração + votos detalhados); com setInterval fixo, um
  // banco lento faria as consultas EMPILHAREM (feedback loop de carga). Falha de
  // refresh é tolerada — mantém os últimos dados na tela em vez de quebrar.
  // 1ª marcação da hora só no cliente, após montar (ver atualizadoEm) — efeito
  // dedicado, pra não renderizar hora no SSR e evitar o mismatch de hidratação.
  // O setState síncrono aqui é PROPOSITAL: é exatamente o adiamento pro cliente
  // que resolve o #418 (mesmo padrão do useEntradaUrl).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAtualizadoEm(new Date())
  }, [])

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

  // Tarja de estado derivada do status — exaustiva (o Record cobre os 4 status
  // e o compilador cobra se um novo surgir). Só "aberta" é AO VIVO e pulsa (a
  // única votável); "pausada" avisa que parou; "rascunho" = ainda não iniciada
  // (antes caía em "ENCERRADA", enganoso); "encerrada" = fim. A entrada — e com
  // ela o QR — vale em aberta+pausada (isEmAndamento), não em rascunho/encerrada.
  const TARJAS: Record<AssembleiaStatus, { label: string; cls: string; pulse: boolean }> = {
    aberta: { label: "AO VIVO", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", pulse: true },
    pausada: { label: "PAUSADA", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", pulse: false },
    rascunho: { label: "NÃO INICIADA", cls: "bg-muted text-muted-foreground", pulse: false },
    encerrada: { label: "ENCERRADA", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400", pulse: false },
  }
  const tarja = TARJAS[data.status]

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
          {/* Tarja de estado (rótulo+cor por status, ver TARJAS acima). Só
              "aberta" pulsa. */}
          <span
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${tarja.cls}`}
          >
            {tarja.pulse && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            )}
            {tarja.label}
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
          Atualiza automaticamente
          {atualizadoEm
            ? ` · última atualização às ${atualizadoEm.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZone: "America/Sao_Paulo",
              })}`
            : ""}
        </p>
      </div>

      {/* QR FIXO no canto: fica SEMPRE na tela enquanto a votação está aberta,
          mesmo rolando o telão ou trocando de pauta (pedido do Carlos — "igual
          anúncio que fica fixo enquanto a página rola"). `position: fixed` faz
          ele flutuar por cima do conteúdo que rola embaixo. Some ao encerrar.
          Ajuste do Carlos: SÓ a figura do QR (sem texto) e menor — assim cabe
          inteiro na faixa à direita, onde não há conteúdo, e nunca cobre
          informação ao rolar. Só renderiza com a URL pronta (nunca um quadrado
          vazio). Observação (dita ao Carlos): vale DENTRO do telão; um site não
          consegue flutuar por cima de OUTROS programas (ex.: PowerPoint). */}
      {isEmAndamento(data.status) && entradaUrl && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-border/60 bg-white p-2 shadow-xl sm:bottom-6 sm:right-6">
          <QrEntrada url={entradaUrl} size={120} />
        </div>
      )}
    </div>
  )
}
