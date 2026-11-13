"use client"

import { createContext, useContext } from "react"

// "Dados a compartilhar" (pedido do Carlos): o modo que ESCONDE os dados
// pessoais (e-mail/CPF/celular) da lista pra projetar a tela numa
// videoconferência sem expor PII. O estado vive no `ProprietariosList`, mas o
// Carlos quer o liga/desliga também no menu "Operacionais ▾", que fica na barra
// da APURAÇÃO. Como a barra da apuração e a lista dos Participantes são
// ReactNodes irmãos passados ao `ApuracaoTela`, este context é o que deixa o
// toggle da apuração e a lista compartilharem o MESMO estado.
//
// `null` = sem provider (ex.: a lista na tela de GESTÃO do condomínio, que não
// tem apuração). Nesse caso a lista cai no seu próprio useState local — ver
// ProprietariosList. É só visibilidade de coluna; nada toca a lógica de voto.
//
export interface ModoCompartilharCtx {
  // "Dados a compartilhar" — esconde PII da lista.
  value: boolean
  toggle: () => void
}

export const ModoCompartilharContext = createContext<ModoCompartilharCtx | null>(null)

export function useModoCompartilhar(): ModoCompartilharCtx | null {
  return useContext(ModoCompartilharContext)
}
