import { describe, it, expect, vi, beforeEach } from "vitest"

// Trava crítica de cartório (PR #84): ao ENCERRAR, o sistema não pode
// sobrescrever a data/hora de encerramento que o operador preencheu à mão — é
// essa que sai no boletim/ata (a hora exata que a mesa declarou encerrada). Só
// carimba "agora" quando o campo está vazio. Mock leve do Supabase, mesmo
// padrão de services/presenca.test.ts, capturando os payloads dos updates.

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
  insert: (payload?: unknown) => Promise<QueryResult>
  maybeSingle: () => Promise<QueryResult>
  single: () => Promise<QueryResult>
  then: (resolve: (v: QueryResult) => unknown) => unknown
}

const h = vi.hoisted(() => {
  const state: {
    responses: Record<string, QueryResult>
    updates: Record<string, unknown[]>
  } = { responses: {}, updates: {} }

  function makeBuilder(table: string, result: QueryResult): MockBuilder {
    const chain = (): MockBuilder => makeBuilder(table, result)
    return {
      select: chain,
      eq: chain,
      not: chain,
      is: chain,
      in: chain,
      limit: chain,
      order: chain,
      update: (payload?: unknown) => {
        ;(state.updates[table] ??= []).push(payload)
        return makeBuilder(table, result)
      },
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: (v: QueryResult) => unknown) => resolve(result),
    }
  }

  function makeDb() {
    return {
      from: (table: string) => makeBuilder(table, state.responses[table] ?? { data: null, error: null }),
    }
  }

  return { state, makeDb }
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => h.makeDb(),
}))

import { updateAssembleiaStatus } from "@/services/assembleias"

function primeiroUpdate(table: string): Record<string, unknown> {
  return ((h.state.updates[table] ?? [])[0] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  h.state.responses = {}
  h.state.updates = {}
})

describe("updateAssembleiaStatus — encerramento", () => {
  it("ao encerrar, MANTÉM a data_encerramento já preenchida (não sobrescreve)", async () => {
    h.state.responses = {
      assembleias: {
        data: {
          status: "aberta",
          data_abertura: "2026-10-18T12:00:00.000Z",
          data_encerramento: "2026-10-18T14:20:00.000Z", // hora declarada pela mesa
        },
        error: null,
      },
      pautas: { data: null, error: null },
    }

    await updateAssembleiaStatus("a1", "encerrada")

    const upd = primeiroUpdate("assembleias")
    expect(upd.status).toBe("encerrada")
    // Não toca em data_encerramento → o valor preenchido à mão permanece.
    expect(upd.data_encerramento).toBeUndefined()
  })

  it("ao encerrar SEM data_encerramento, carimba a hora do encerramento", async () => {
    h.state.responses = {
      assembleias: {
        data: {
          status: "aberta",
          data_abertura: "2026-10-18T12:00:00.000Z",
          data_encerramento: null,
        },
        error: null,
      },
      pautas: { data: null, error: null },
    }

    await updateAssembleiaStatus("a1", "encerrada")

    const upd = primeiroUpdate("assembleias")
    expect(upd.status).toBe("encerrada")
    // Campo vazio → grava "agora" pra sempre haver um valor no boletim.
    expect(typeof upd.data_encerramento).toBe("string")
  })

  it("assembleia já encerrada não pode ser reaberta por esta função", async () => {
    h.state.responses = {
      assembleias: {
        data: { status: "encerrada", data_abertura: null, data_encerramento: "2026-10-18T14:20:00.000Z" },
        error: null,
      },
    }
    await expect(updateAssembleiaStatus("a1", "aberta")).rejects.toThrow(/não pode ser reaberta/i)
  })
})
