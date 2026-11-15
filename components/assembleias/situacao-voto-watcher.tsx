"use client"

import { useEffect } from "react"
import { getEstadoVotoAction } from "@/app/actions/assembleia-votos"
import type { AssembleiaStatus } from "@/types"

const POLL_MS = 10_000

// Vigia, nas telas ESTÁTICAS do eleitor em /v/[token] — "ainda não iniciada"
// (rascunho), "pausada" e "você já votou tudo" —, se a mesa mudou algo que
// deveria levar a pessoa a outra tela, e recarrega para cair na tela certa do
// servidor. Sem isto, essas telas são SSR puro e não reagem à mesa: quem abre o
// link ANTES da mesa abrir a assembleia, quem fica na tela de pausa, ou quem já
// votou tudo e a mesa adiciona uma pauta, ficava preso até recarregar na mão
// (relatos do Carlos testando em campo).
//
// Recarrega quando:
//  - o STATUS muda (rascunho→aberta, pausada→aberta/encerrada, aberta→encerrada); ou
//  - aparece uma PAUTA NOVA (id que não existia ao renderizar).
// Compara por ID conhecido (não pelo flag "já votou"): uma falha transitória de
// leitura das respostas não dispara reload à toa. getEstadoVotoAction é
// read-only e sem rate limit (seguro com vários no mesmo IP). Não há loop: após
// o reload o status/pautas já batem com o novo render, então não recarrega de
// novo. setTimeout encadeado: só reagenda após a checagem terminar.
export function SituacaoVotoWatcher({
  token,
  statusInicial,
  pautasConhecidas,
}: {
  token: string
  statusInicial: AssembleiaStatus
  pautasConhecidas: string[]
}) {
  useEffect(() => {
    const conhecidas = new Set(pautasConhecidas)
    let ativo = true
    let timer: ReturnType<typeof setTimeout>
    const ciclo = () => {
      timer = setTimeout(async () => {
        try {
          const novo = await getEstadoVotoAction(token)
          if (ativo && novo) {
            const statusMudou = novo.status !== statusInicial
            const temPautaNova = novo.pautas.some((p) => !conhecidas.has(p.id))
            if (statusMudou || temPautaNova) {
              window.location.reload()
              return
            }
          }
        } catch {
          // falha de rede não derruba o vigia — tenta de novo no próximo ciclo
        }
        if (ativo) ciclo()
      }, POLL_MS)
    }
    ciclo()
    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [token, statusInicial, pautasConhecidas])

  return null
}
