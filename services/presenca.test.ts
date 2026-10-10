import { describe, it, expect, vi, beforeEach } from "vitest"

// Teste de integração do registrarPresenca (o coração do check-in pelo link):
// mocka o cliente Supabase com um builder encadeável leve, cujas respostas por
// tabela são configuradas em cada teste. Diferente dos testes de função pura,
// este exercita o fluxo real (status, unidade, CPF, modo mesa x self-service).

type QueryResult = { data: unknown; error: unknown }

interface MockBuilder {
  select: () => MockBuilder
  eq: () => MockBuilder
  not: () => MockBuilder
  is: () => MockBuilder
  in: () => MockBuilder
  limit: () => MockBuilder
  order: () => MockBuilder
  update: () => MockBuilder
  upsert: () => MockBuilder
  insert: () => Promise<QueryResult>
  maybeSingle: () => Promise<QueryResult>
  single: () => Promise<QueryResult>
  // torna o builder "awaitable" (ex.: `await db.from(x).update(...).eq(...)`)
  then: (resolve: (v: QueryResult) => unknown) => unknown
}

const h = vi.hoisted(() => {
  const state: { responses: Record<string, QueryResult> } = { responses: {} }

  function makeBuilder(result: QueryResult): MockBuilder {
    const chain = (): MockBuilder => makeBuilder(result)
    return {
      select: chain,
      eq: chain,
      not: chain,
      is: chain,
      in: chain,
      limit: chain,
      order: chain,
      update: chain,
      upsert: chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: (v: QueryResult) => unknown) => resolve(result),
    }
  }

  function makeDb() {
    return {
      from: (table: string) =>
        makeBuilder(state.responses[table] ?? { data: null, error: null }),
    }
  }

  return { state, makeDb }
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => h.makeDb(),
}))

import { registrarPresenca } from "@/services/presenca"

// Atalhos pra montar as respostas por tabela em cada cenário.
function setup(opts: {
  status?: string
  exigePresenca?: boolean
  unidade?: { proprietario_id: string } | null
  proprietario?: { id: string; cpf: string | null } | null
  send?: { id: string; token: string; presente_em: string | null } | null
  assembleia?: unknown
}) {
  h.state.responses = {
    assembleias: {
      data:
        opts.assembleia === undefined
          ? {
              id: "a1",
              condominio_id: "c1",
              status: opts.status ?? "aberta",
              exige_presenca: opts.exigePresenca ?? false,
            }
          : opts.assembleia,
      error: null,
    },
    unidades: { data: opts.unidade ?? null, error: null },
    proprietarios: { data: opts.proprietario ?? null, error: null },
    assembleia_sends: { data: opts.send ?? null, error: null },
  }
}

const UNIDADE = { proprietario_id: "p1" }
const PROP = { id: "p1", cpf: "123.456.789-01" }

beforeEach(() => {
  h.state.responses = {}
})

describe("registrarPresenca", () => {
  it("self-service: unidade + CPF corretos liberam o voto", async () => {
    setup({ exigePresenca: false, unidade: UNIDADE, proprietario: PROP, send: null })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(typeof r.token).toBe("string")
  })

  it("modo mesa: quem NÃO foi marcado presente não vota", async () => {
    setup({ exigePresenca: true, unidade: UNIDADE, proprietario: PROP, send: null })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("presente")
  })

  it("modo mesa: marcado presente pela mesa libera o voto (retorna o token)", async () => {
    setup({
      exigePresenca: true,
      unidade: UNIDADE,
      proprietario: PROP,
      send: { id: "s1", token: "tok-123", presente_em: "2026-10-10T12:00:00Z" },
    })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.token).toBe("tok-123")
  })

  it("CPF que não bate é recusado (mensagem genérica)", async () => {
    setup({ unidade: UNIDADE, proprietario: { id: "p1", cpf: "999.999.999-99" } })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("não confere")
  })

  it("unidade inexistente é recusada (sem revelar que não existe)", async () => {
    setup({ unidade: null, proprietario: PROP })
    const r = await registrarPresenca("a1", { numero: "Z999", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("não confere")
  })

  it("proprietário sem CPF cadastrado cai no aviso de procurar o síndico", async () => {
    setup({ unidade: UNIDADE, proprietario: { id: "p1", cpf: null } })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("síndico")
  })

  it("assembleia encerrada não aceita entrada", async () => {
    setup({ status: "encerrada", unidade: UNIDADE, proprietario: PROP })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("aberta")
  })

  it("assembleia inexistente é recusada", async () => {
    setup({ assembleia: null })
    const r = await registrarPresenca("inexistente", { numero: "B108", bloco: null, cpf: "1" })
    expect(r.ok).toBe(false)
  })
})
