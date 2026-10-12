import { describe, it, expect, vi, beforeEach } from "vitest"

// Votação pauta por pauta: abrir/fechar a votação de UMA pauta (controle da
// mesa). Mockamos o cliente Supabase e capturamos o payload do update pra
// garantir que os campos certos (votacao_aberta + datas) são gravados.
interface Builder {
  update: (payload?: unknown) => Builder
  eq: () => Builder
  then: (resolve: (v: { error: null }) => unknown) => unknown
}

const h = vi.hoisted(() => {
  const state: { updates: unknown[] } = { updates: [] }
  function makeBuilder(): Builder {
    const b: Builder = {
      update: (payload?: unknown) => {
        state.updates.push(payload)
        return b
      },
      eq: () => b,
      then: (resolve) => resolve({ error: null }),
    }
    return b
  }
  return { state, makeDb: () => ({ from: () => makeBuilder() }) }
})

vi.mock("@/lib/supabase/server", () => ({ createServerClient: () => h.makeDb() }))

import { abrirVotacaoPauta, fecharVotacaoPauta } from "@/services/pautas"

beforeEach(() => {
  h.state.updates = []
})

describe("abrir/fechar votação de pauta", () => {
  it("abrir: marca votacao_aberta=true, grava a hora de abertura e limpa a de fechamento", async () => {
    await abrirVotacaoPauta("p1")
    expect(h.state.updates).toHaveLength(1)
    const up = h.state.updates[0] as Record<string, unknown>
    expect(up.votacao_aberta).toBe(true)
    expect(up.votacao_aberta_em).toBeTruthy()
    expect(up.votacao_fechada_em).toBeNull()
  })

  it("fechar: marca votacao_aberta=false e grava a hora de fechamento", async () => {
    await fecharVotacaoPauta("p1")
    expect(h.state.updates).toHaveLength(1)
    const up = h.state.updates[0] as Record<string, unknown>
    expect(up.votacao_aberta).toBe(false)
    expect(up.votacao_fechada_em).toBeTruthy()
  })
})
