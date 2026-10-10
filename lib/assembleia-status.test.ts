import { describe, it, expect } from "vitest"
import { isVotacaoAberta, isEmAndamento } from "./assembleia-status"

// Estas duas funções decidem regras críticas das features de hoje:
// - isVotacaoAberta: a trava de voto (validarVotoOuFalhar) só aceita voto quando aberta.
// - isEmAndamento: define quando aparece o link de entrada, a chamada e o
//   badge/filtro "votou" na lista de proprietários.

describe("isVotacaoAberta", () => {
  it("só 'aberta' aceita voto novo", () => {
    expect(isVotacaoAberta("aberta")).toBe(true)
    expect(isVotacaoAberta("pausada")).toBe(false)
    expect(isVotacaoAberta("rascunho")).toBe(false)
    expect(isVotacaoAberta("encerrada")).toBe(false)
  })
})

describe("isEmAndamento", () => {
  it("'aberta' e 'pausada' contam como em andamento", () => {
    expect(isEmAndamento("aberta")).toBe(true)
    expect(isEmAndamento("pausada")).toBe(true)
  })

  it("'rascunho' e 'encerrada' NÃO contam", () => {
    expect(isEmAndamento("rascunho")).toBe(false)
    expect(isEmAndamento("encerrada")).toBe(false)
  })
})
