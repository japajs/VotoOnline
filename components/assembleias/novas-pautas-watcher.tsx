"use client"

import { useEffect } from "react"
import { getEstadoVotoAction } from "@/app/actions/assembleia-votos"

const POLL_MS = 10_000

// Vigia, na tela de "você já votou" (Situação 3 em app/v/[token]/page.tsx), se a
// mesa ADICIONOU uma pauta nova depois que a pessoa já tinha respondido tudo —
// ou se a assembleia encerrou. Nesses casos recarrega a página, que então cai
// na tela certa (formulário da pauta nova / tela ao vivo pauta por pauta /
// resultado final). Sem isso, uma pauta criada depois NUNCA aparecia no celular
// de quem já tinha votado tudo, porque essa tela é estática (relato do Carlos:
// "pautas adicionadas depois do link aberto no celular não aparecem").
//
// Compara pelos IDS que existiam quando a tela renderizou (todos já votados),
// não pelo flag "já votou": assim uma falha transitória de leitura das
// respostas (que zeraria os flags) não dispara um reload à toa — só um ID de
// pauta genuinamente novo, ou o encerramento, recarrega. getEstadoVotoAction é
// read-only e sem rate limit (ver assembleia-votos.ts), então o polling é
// seguro mesmo com vários no mesmo IP. setTimeout encadeado: só reagenda depois
// que a checagem termina (não empilha chamadas).
export function NovasPautasWatcher({
  token,
  pautasConhecidas,
}: {
  token: string
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
            const temPautaNova = novo.pautas.some((p) => !conhecidas.has(p.id))
            if (novo.status === "encerrada" || temPautaNova) {
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
  }, [token, pautasConhecidas])

  return null
}
