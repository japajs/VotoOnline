import { describe, it, expect, vi } from "vitest"

// montarExtratoParticipacao é PURA (sem banco). Importar o módulo puxa
// createServerClient no topo (e nos serviços que ele importa), então mockamos
// pra não depender de env — a função testada não toca no banco.
vi.mock("@/lib/supabase/server", () => ({ createServerClient: () => ({}) }))

import {
  montarExtratoParticipacao,
  type ExtratoSendRow,
  type ExtratoProcuracao,
} from "@/services/relatorios"

type Unid = { numero: string; bloco: string | null }
const u = (numero: string): Unid => ({ numero, bloco: null })

// Monta um send de teste. `snapshot` simula o unidades_snapshot do voto (no
// representante vem SOMADO com o do outorgante); `cadastro` é o imóvel do dono.
function send(
  id: string,
  proprietario_id: string,
  nome: string,
  opts: {
    votado_em?: string | null
    presente_em?: string | null
    snapshot?: Unid[] | null
    cadastro: Unid[]
  }
): ExtratoSendRow {
  return {
    id,
    proprietario_id,
    nome_snapshot: nome,
    votado_em: opts.votado_em ?? null,
    presente_em: opts.presente_em ?? null,
    unidades_snapshot: opts.snapshot ?? null,
    proprietarios: { nome, unidades: opts.cadastro },
  }
}

describe("montarExtratoParticipacao — contagem por imóvel", () => {
  it("sem procuração: soma os imóveis de cada dono, uma vez cada", () => {
    const rows: ExtratoSendRow[] = [
      send("sA", "A", "A", { votado_em: "2026-01-01T10:00:00Z", snapshot: [u("101")], cadastro: [u("101")] }),
      send("sB", "B", "B", { cadastro: [u("102")] }), // não votou
    ]
    const count = new Map<string, number>([["sA", 2]])
    const { resumo } = montarExtratoParticipacao(rows, count, [], 2)
    expect(resumo.imoveis).toBe(2)
    expect(resumo.votouGeral).toBe(1)
    expect(resumo.naoVotou).toBe(1)
    expect(resumo.presentes).toBe(1)
  })

  it("procuração: NÃO duplica o imóvel do outorgante (bug do Carlos: 310 vs 300)", () => {
    // B (imóvel 102) outorgou pro representante C (imóvel 103). C votou tudo e o
    // seu snapshot do voto vem SOMADO com o imóvel do outorgante [103, 102].
    const rows: ExtratoSendRow[] = [
      send("sA", "A", "A", { votado_em: "2026-01-01T10:00:00Z", snapshot: [u("101")], cadastro: [u("101")] }),
      send("sB", "B", "B", { cadastro: [u("102")] }), // outorgante, não votou por si
      send("sC", "C", "C", {
        votado_em: "2026-01-01T11:00:00Z",
        snapshot: [u("103"), u("102")], // somado (peso) — NÃO pode contar 2x
        cadastro: [u("103")],
      }),
      send("sD", "D", "D", { cadastro: [u("104")] }), // não votou
    ]
    const count = new Map<string, number>([
      ["sA", 3],
      ["sC", 3],
    ])
    const procs: ExtratoProcuracao[] = [
      { outorgante_id: "B", outorgado_id: "C", outorgado_nome: "C" },
    ]
    const { linhas, resumo } = montarExtratoParticipacao(rows, count, procs, 3)

    // 4 imóveis (101,102,103,104), cada um UMA vez — não 5.
    expect(resumo.imoveis).toBe(4)
    // 102 (do outorgante B) entra como "Votou geral" via o voto de C, não "Não votou".
    expect(resumo.votouGeral).toBe(3) // A, B(via C), C
    expect(resumo.naoVotou).toBe(1) // só D
    expect(resumo.presentes).toBe(3) // A, B(via C), C
    expect(resumo.votouParcial).toBe(0)

    const linhaB = linhas.find((l) => l.proprietarioNome === "B")!
    expect(linhaB.qtdImoveis).toBe(1) // só o imóvel próprio
    expect(linhaB.unidades).toBe("102")
    expect(linhaB.viaProcuracao).toBe(true)
    expect(linhaB.representanteNome).toBe("C")
    expect(linhaB.status).toBe("completo") // participou via representante

    const linhaC = linhas.find((l) => l.proprietarioNome === "C")!
    expect(linhaC.qtdImoveis).toBe(1) // SÓ o próprio (103), sem o delegado
    expect(linhaC.unidades).toBe("103")
    expect(linhaC.viaProcuracao).toBeFalsy()
  })

  it("procuração com representante que ainda NÃO votou: imóvel do outorgante conta 1x e fica pendente", () => {
    const rows: ExtratoSendRow[] = [
      send("sB", "B", "B", { cadastro: [u("102")] }), // outorgante
      send("sC", "C", "C", { cadastro: [u("103")] }), // representante ainda não votou
    ]
    const count = new Map<string, number>() // ninguém respondeu
    const procs: ExtratoProcuracao[] = [
      { outorgante_id: "B", outorgado_id: "C", outorgado_nome: "C" },
    ]
    const { resumo } = montarExtratoParticipacao(rows, count, procs, 3)
    expect(resumo.imoveis).toBe(2) // 102 e 103, uma vez cada
    expect(resumo.naoVotou).toBe(2)
    expect(resumo.votouGeral).toBe(0)
  })
})
