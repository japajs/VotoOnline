"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ModoCompartilharContext } from "@/components/assembleias/modo-compartilhar-context"

// Tela da assembleia FUNDIDA (letra B, validada pelo Carlos): UMA tela principal
// — a LISTA (participantes/chamada) — e o resto pelos MENUS. A APURAÇÃO
// (resultados por pauta) deixou de ser uma aba e virou um item do "Relatórios ▾"
// (dentro da barra da apuração) que ALTERNA a visão. "fica mais simples a
// logística de manuseio."
//
// Estrutura: a BARRA de ações (ApuracaoAssembleia) fica SEMPRE visível no topo;
// abaixo dela aparece OU os resultados OU a lista, nunca as duas. Quem decide é
// `verApuracao`, no context — a própria ApuracaoAssembleia esconde o seu corpo
// de resultados quando `verApuracao` é false, e aqui a gente esconde a lista
// quando é true. As duas ficam sempre MONTADAS (escondo com `hidden`, não
// desmonto): o polling da presença e o estado da chamada não reiniciam na troca.
export function ApuracaoTela({
  apuracao,
  participantes,
  apuracaoInicial = false,
}: {
  // Barra de ações + corpo de resultados (ApuracaoAssembleia + histórico).
  apuracao: ReactNode
  // Lista de proprietários (a chamada) — a tela principal.
  participantes: ReactNode
  // Visão inicial: encerrada abre direto nos RESULTADOS (é o que se quer ver);
  // em andamento/rascunho abre na LISTA (operação ao vivo).
  apuracaoInicial?: boolean
}) {
  const [verApuracao, setVerApuracao] = useState(apuracaoInicial)
  // "Dados a compartilhar" (pedido do Carlos): estado COMPARTILHADO entre o
  // toggle do menu "Operacionais ▾" (na barra) e a lista dos Participantes. Só
  // esconde PII (visibilidade de coluna).
  const [compartilhar, setCompartilhar] = useState(false)

  return (
    <ModoCompartilharContext.Provider
      value={{
        value: compartilhar,
        toggle: () => setCompartilhar((v) => !v),
        verApuracao,
        toggleApuracao: () => setVerApuracao((v) => !v),
      }}
    >
      <div className="flex flex-col gap-6">
        {/* Barra de ações sempre visível + corpo de resultados (gateado por
            `verApuracao` DENTRO da ApuracaoAssembleia). */}
        {apuracao}
        {/* Lista = tela principal: some quando a visão é a apuração. No print
            nunca sai (o "Imprimir" é o boletim da apuração). */}
        <div className={cn(verApuracao && "hidden", "print:hidden")}>{participantes}</div>
      </div>
    </ModoCompartilharContext.Provider>
  )
}
