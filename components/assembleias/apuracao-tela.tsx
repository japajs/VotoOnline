"use client"

import { useState, type ReactNode } from "react"
import { ModoCompartilharContext } from "@/components/assembleias/modo-compartilhar-context"

// Tela da assembleia (fusão, letra B): UMA tela principal — a LISTA
// (participantes/chamada) — com a barra de ações sempre no topo. A APURAÇÃO
// (resultados) NÃO fica mais aqui: abre em NOVA ABA pela rota /apuracao, igual
// ao Telão (pedido do Carlos 2026-11-13) — assim a tela principal nunca troca de
// conteúdo e a aba da apuração pode ser projetada/compartilhada à parte.
//
// `apuracao` = a barra de ações (ApuracaoAssembleia), que renderiza o corpo de
// resultados OCULTO (só pro Imprimir); `participantes` = a lista. O único estado
// compartilhado que sobra é o "Dados a compartilhar" (esconder PII), no context.
export function ApuracaoTela({
  apuracao,
  participantes,
}: {
  // Barra de ações (ApuracaoAssembleia; o corpo de resultados vai oculto nela).
  apuracao: ReactNode
  // Lista de proprietários (a chamada) — a tela principal.
  participantes: ReactNode
}) {
  // "Dados a compartilhar" (pedido do Carlos): estado COMPARTILHADO entre o
  // toggle do menu "Operacionais ▾" (na barra) e a lista dos Participantes. Só
  // esconde PII (visibilidade de coluna).
  const [compartilhar, setCompartilhar] = useState(false)

  return (
    <ModoCompartilharContext.Provider
      value={{ value: compartilhar, toggle: () => setCompartilhar((v) => !v) }}
    >
      <div className="flex flex-col gap-6">
        {/* Barra de ações (resultados ocultos dentro dela, só pro Imprimir). */}
        {apuracao}
        {/* Lista = tela principal. No print não sai (o "Imprimir" é o boletim
            da apuração, que vem do corpo de resultados oculto na barra). */}
        <div className="print:hidden">{participantes}</div>
      </div>
    </ModoCompartilharContext.Provider>
  )
}
