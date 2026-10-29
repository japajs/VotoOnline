import { describe, it, expect, vi, beforeEach } from "vitest"

// Trava anti-duplicata por NOME (pedido do Carlos: o cadastro deixou criar 2
// proprietários iguais). nomeJaCadastrado compara pelo nome NORMALIZADO (sem
// acento/espaço, minúsculo) — então pega "Dani Silva" x "DANI  SILVA" mesmo sem
// CPF/e-mail. Mockamos só o retorno da tabela proprietarios; normalizarBusca é
// o real (a normalização de verdade é o que queremos exercitar).

const h = vi.hoisted(() => {
  const state: { rows: { id: string; nome: string }[] } = { rows: [] }
  return { state }
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: () => {
      const result = { data: h.state.rows, error: null }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
      }
      return chain
    },
  }),
}))

import { nomeJaCadastrado } from "@/services/proprietarios"

beforeEach(() => {
  h.state.rows = []
})

describe("nomeJaCadastrado", () => {
  it("acusa duplicata exata e devolve o nome existente", async () => {
    h.state.rows = [{ id: "a", nome: "DANI SILVA" }]
    expect(await nomeJaCadastrado("c1", "DANI SILVA")).toBe("DANI SILVA")
  })

  it("pega colisão ignorando acento, espaço e caixa", async () => {
    h.state.rows = [{ id: "a", nome: "DANI  SILVA" }]
    // "Dâni Silva" (acento, espaço simples, caixa diferente) colide.
    expect(await nomeJaCadastrado("c1", "Dâni Silva")).toBe("DANI  SILVA")
  })

  it("não acusa quando não há ninguém com o mesmo nome", async () => {
    h.state.rows = [{ id: "a", nome: "JOÃO MELLO" }]
    expect(await nomeJaCadastrado("c1", "Maria Souza")).toBeNull()
  })

  it("ignora o próprio registro na edição (exceptId)", async () => {
    h.state.rows = [{ id: "a", nome: "DANI SILVA" }]
    // Editando o próprio "a" — não pode acusar a si mesmo como duplicata.
    expect(await nomeJaCadastrado("c1", "DANI SILVA", "a")).toBeNull()
  })

  it("acusa quando há OUTRO com o mesmo nome, mesmo passando exceptId", async () => {
    h.state.rows = [
      { id: "a", nome: "DANI SILVA" },
      { id: "b", nome: "Dani Silva" },
    ]
    // Editando "a", mas "b" também se chama Dani Silva → ainda é duplicata.
    expect(await nomeJaCadastrado("c1", "DANI SILVA", "a")).toBe("Dani Silva")
  })

  it("não acusa (nem quebra) com nome vazio", async () => {
    h.state.rows = [{ id: "a", nome: "DANI SILVA" }]
    expect(await nomeJaCadastrado("c1", "   ")).toBeNull()
  })
})
