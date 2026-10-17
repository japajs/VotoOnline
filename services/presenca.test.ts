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
  update: (payload?: unknown) => MockBuilder
  upsert: () => MockBuilder
  insert: (payload?: unknown) => Promise<QueryResult>
  maybeSingle: () => Promise<QueryResult>
  single: () => Promise<QueryResult>
  // torna o builder "awaitable" (ex.: `await db.from(x).update(...).eq(...)`)
  then: (resolve: (v: QueryResult) => unknown) => unknown
}

const h = vi.hoisted(() => {
  // `inserts`/`updates` registram os payloads escritos, pra os testes
  // afirmarem o comportamento (criou send? gravou presente_em? limpou?).
  const state: {
    responses: Record<string, QueryResult>
    inserts: unknown[]
    updates: unknown[]
  } = { responses: {}, inserts: [], updates: [] }

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
      update: (payload?: unknown) => {
        state.updates.push(payload)
        return makeBuilder(result)
      },
      upsert: chain,
      insert: (payload?: unknown) => {
        state.inserts.push(payload)
        return Promise.resolve({ data: null, error: null })
      },
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

import { registrarPresenca, marcarPresenca } from "@/services/presenca"

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
  h.state.inserts = []
  h.state.updates = []
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

  it("modo mesa: identidade válida sem presença registra a tentativa de entrada", async () => {
    setup({ exigePresenca: true, unidade: UNIDADE, proprietario: PROP, send: null })
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    // Gravou a tentativa (pra a mesa ver e confirmar), SEM marcar presente.
    expect(h.state.inserts).toHaveLength(1)
    const ins = h.state.inserts[0] as Record<string, unknown>
    expect(ins.tentou_entrar_em).toBeTruthy()
    expect(ins.presente_em).toBeUndefined()
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

  it("outorgante: quem deu procuração não entra por si (quem participa é o procurador)", async () => {
    setup({ exigePresenca: false, unidade: UNIDADE, proprietario: PROP, send: null })
    h.state.responses.procuracoes = { data: [{ id: "pr1" }], error: null }
    const r = await registrarPresenca("a1", { numero: "B108", bloco: null, cpf: "12345678901" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("procuração")
    // Não marcou presença (não criou send nem gravou presente_em).
    expect(h.state.inserts).toHaveLength(0)
  })
})

// marcarPresenca é o que a mesa aciona na Chamada E na caixa de presença da
// tela principal (lista de proprietários). Só mexe em assembleia_sends —
// cria/atualiza presente_em — e nunca "despresenta" quem já votou.
function setupSend(send: { id: string; presente_em: string | null; votado_em: string | null } | null) {
  h.state.responses = { assembleia_sends: { data: send, error: null } }
}

describe("marcarPresenca", () => {
  it("marcar: cria o send (com token + presente_em) quando ainda não existe", async () => {
    setupSend(null)
    await marcarPresenca("a1", "p1", true)
    expect(h.state.inserts).toHaveLength(1)
    const ins = h.state.inserts[0] as Record<string, unknown>
    expect(ins.assembleia_id).toBe("a1")
    expect(ins.proprietario_id).toBe("p1")
    expect(typeof ins.token).toBe("string")
    expect(ins.presente_em).toBeTruthy()
    expect(h.state.updates).toHaveLength(0)
  })

  it("marcar: grava presente_em quando o send existe sem presença", async () => {
    setupSend({ id: "s1", presente_em: null, votado_em: null })
    await marcarPresenca("a1", "p1", true)
    expect(h.state.updates).toHaveLength(1)
    const up = h.state.updates[0] as Record<string, unknown>
    expect(up.presente_em).toBeTruthy()
    expect(h.state.inserts).toHaveLength(0)
  })

  it("marcar: é no-op quando já está presente (não sobrescreve presente_em)", async () => {
    setupSend({ id: "s1", presente_em: "2026-10-10T12:00:00Z", votado_em: null })
    await marcarPresenca("a1", "p1", true)
    expect(h.state.updates).toHaveLength(0)
    expect(h.state.inserts).toHaveLength(0)
  })

  it("desmarcar: limpa presente_em (presente_em = null)", async () => {
    setupSend({ id: "s1", presente_em: "2026-10-10T12:00:00Z", votado_em: null })
    await marcarPresenca("a1", "p1", false)
    expect(h.state.updates).toHaveLength(1)
    const up = h.state.updates[0] as Record<string, unknown>
    expect(up.presente_em).toBeNull()
  })

  it("desmarcar: recusa quem já votou (caminho do revert otimista da UI)", async () => {
    setupSend({ id: "s1", presente_em: "2026-10-10T12:00:00Z", votado_em: "2026-10-10T12:30:00Z" })
    await expect(marcarPresenca("a1", "p1", false)).rejects.toThrow(/já votou/i)
    expect(h.state.updates).toHaveLength(0)
  })

  it("desmarcar: é no-op quando não há send", async () => {
    setupSend(null)
    await marcarPresenca("a1", "p1", false)
    expect(h.state.updates).toHaveLength(0)
    expect(h.state.inserts).toHaveLength(0)
  })

  it("marcar: ao confirmar presença, zera a tentativa de entrada", async () => {
    setupSend({ id: "s1", presente_em: null, votado_em: null })
    await marcarPresenca("a1", "p1", true)
    expect(h.state.updates).toHaveLength(1)
    const up = h.state.updates[0] as Record<string, unknown>
    expect(up.presente_em).toBeTruthy()
    expect(up.tentou_entrar_em).toBeNull()
  })

  it("marcar: recusa quem outorgou procuração (presença é representada pelo procurador)", async () => {
    h.state.responses = {
      assembleia_sends: { data: null, error: null },
      procuracoes: { data: [{ id: "pr1" }], error: null },
    }
    await expect(marcarPresenca("a1", "p1", true)).rejects.toThrow(/procuração/i)
    expect(h.state.inserts).toHaveLength(0)
    expect(h.state.updates).toHaveLength(0)
  })
})
