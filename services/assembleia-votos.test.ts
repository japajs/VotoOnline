import { describe, it, expect, vi, beforeEach } from "vitest"

// Trava de segurança da votação PAUTA POR PAUTA: um voto numa pauta que a mesa
// ainda não abriu (votacao_aberta=false) tem de ser recusado no núcleo do
// registro (createAssembleiaRespostas → validarVotoOuFalhar), não só na tela.
// Mockamos o cliente Supabase (respostas por tabela) e a checagem de procuração.

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
  then: (resolve: (v: QueryResult) => unknown) => unknown
}

const h = vi.hoisted(() => {
  // `outorgou` controla o mock de outorgouProcuracao por teste (quem outorgou
  // procuração não vota por si — trava de integridade no núcleo do registro).
  const state: { responses: Record<string, QueryResult>; outorgou: boolean } = {
    responses: {},
    outorgou: false,
  }
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
      from: (table: string) => makeBuilder(state.responses[table] ?? { data: null, error: null }),
    }
  }
  return { state, makeDb }
})

vi.mock("@/lib/supabase/server", () => ({ createServerClient: () => h.makeDb() }))
// outorgouProcuracao controlado por h.state.outorgou (default false, pra isolar
// as outras travas; um teste liga pra verificar o bloqueio de procuração).
vi.mock("@/services/procuracoes", () => ({
  outorgouProcuracao: () => Promise.resolve(h.state.outorgou),
  getOutorgantesIds: () => Promise.resolve([]),
}))

import {
  createAssembleiaRespostas,
  getPautasVotadasPorProprietario,
} from "@/services/assembleia-votos"

function sendRow(opts?: {
  status?: string
  exigePresenca?: boolean
  presenteEm?: string | null
  inadimplente?: boolean
  votacaoPorPauta?: boolean
}) {
  return {
    data: {
      assembleia_id: "a1",
      proprietario_id: "p-owner",
      votado_em: null,
      presente_em: opts && "presenteEm" in opts ? opts.presenteEm : "2026-10-12T12:00:00Z",
      proprietarios: {
        nome: "Fulano",
        cpf: "123",
        email: "f@f.com",
        telefone: null,
        inadimplente: opts?.inadimplente ?? false,
        unidades: [{ numero: "101", bloco: null, fracao_ideal: null }],
      },
      assembleias: {
        status: opts?.status ?? "aberta",
        exige_presenca: opts?.exigePresenca ?? false,
        votacao_por_pauta: opts?.votacaoPorPauta ?? false,
        condominios: { criterio_peso: "unidade" },
      },
    },
    error: null,
  }
}

beforeEach(() => {
  h.state.responses = {}
  h.state.outorgou = false
})

describe("createAssembleiaRespostas — trava pauta por pauta", () => {
  it("recusa voto numa pauta que a mesa NÃO abriu (votacao_aberta=false)", async () => {
    h.state.responses = {
      assembleia_sends: sendRow({ votacaoPorPauta: true }),
      pautas: { data: [{ id: "p1", votacao_aberta: false }], error: null },
    }
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }])
    ).rejects.toThrow(/não está aberta/i)
  })

  it("recusa se QUALQUER pauta enviada estiver fechada (uma aberta, outra não)", async () => {
    h.state.responses = {
      assembleia_sends: sendRow({ votacaoPorPauta: true }),
      pautas: {
        data: [
          { id: "p1", votacao_aberta: true },
          { id: "p2", votacao_aberta: false },
        ],
        error: null,
      },
    }
    await expect(
      createAssembleiaRespostas("s1", [
        { pauta_id: "p1", resposta: "Sim" },
        { pauta_id: "p2", resposta: "Não" },
      ])
    ).rejects.toThrow(/não está aberta/i)
  })
})

// As regras de integridade que protegem a assembleia real: quem pode votar,
// quando, e uma vez só. Todas barradas no núcleo do registro.
describe("createAssembleiaRespostas — integridade do voto", () => {
  it("recusa voto quando a assembleia não está aberta (encerrada)", async () => {
    h.state.responses = { assembleia_sends: sendRow({ status: "encerrada" }) }
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }])
    ).rejects.toThrow(/assembleia não está aberta/i)
  })

  it("recusa voto de proprietário inadimplente", async () => {
    h.state.responses = { assembleia_sends: sendRow({ inadimplente: true }) }
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }])
    ).rejects.toThrow(/inadimplente/i)
  })

  it("recusa voto quando exige presença e o proprietário não está presente", async () => {
    h.state.responses = {
      assembleia_sends: sendRow({ exigePresenca: true, presenteEm: null }),
    }
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }])
    ).rejects.toThrow(/presente/i)
  })

  it("recusa reenviar voto numa pauta já respondida (voto não pode ser alterado)", async () => {
    h.state.responses = {
      assembleia_sends: sendRow(),
      pautas: { data: [{ id: "p1", votacao_aberta: true }], error: null },
      assembleia_respostas: { data: [{ pauta_id: "p1" }], error: null },
    }
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }])
    ).rejects.toThrow(/já foram respondidas/i)
  })

  it("recusa voto de quem outorgou procuração (quem vota é o representante)", async () => {
    h.state.responses = {
      assembleia_sends: sendRow(),
      pautas: { data: [{ id: "p1", votacao_aberta: true }], error: null },
    }
    h.state.outorgou = true
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }])
    ).rejects.toThrow(/procuração/i)
  })

  it("a procuração barra até o lançamento manual da mesa (viaMesa não isenta)", async () => {
    h.state.responses = {
      assembleia_sends: sendRow(),
      pautas: { data: [{ id: "p1", votacao_aberta: true }], error: null },
    }
    h.state.outorgou = true
    await expect(
      createAssembleiaRespostas("s1", [{ pauta_id: "p1", resposta: "Sim" }], {}, { viaMesa: true })
    ).rejects.toThrow(/procuração/i)
  })
})

// Distinção voto TOTAL × PARCIAL na lista de proprietários (pedido do Carlos):
// contar quantas pautas DISTINTAS cada proprietário já respondeu.
describe("getPautasVotadasPorProprietario", () => {
  it("conta pautas distintas por proprietário (duplicata não soma de novo)", async () => {
    h.state.responses = {
      assembleia_respostas: {
        data: [
          { pauta_id: "p1", assembleia_sends: { proprietario_id: "owner-a" } },
          { pauta_id: "p2", assembleia_sends: { proprietario_id: "owner-a" } },
          { pauta_id: "p1", assembleia_sends: { proprietario_id: "owner-a" } }, // repetida
          { pauta_id: "p1", assembleia_sends: { proprietario_id: "owner-b" } },
        ],
        error: null,
      },
    }
    const mapa = await getPautasVotadasPorProprietario("a1")
    expect(mapa.get("owner-a")).toBe(2) // votou p1 e p2 → total se a assembleia tem 2 pautas
    expect(mapa.get("owner-b")).toBe(1) // votou só p1 → parcial
  })

  it("ignora respostas sem proprietário vinculado", async () => {
    h.state.responses = {
      assembleia_respostas: {
        data: [
          { pauta_id: "p1", assembleia_sends: null },
          { pauta_id: "p1", assembleia_sends: { proprietario_id: "owner-a" } },
        ],
        error: null,
      },
    }
    const mapa = await getPautasVotadasPorProprietario("a1")
    expect(mapa.size).toBe(1)
    expect(mapa.get("owner-a")).toBe(1)
  })
})
