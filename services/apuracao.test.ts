import { describe, it, expect, vi } from "vitest"
import type { Pauta } from "@/types"

// Apuração / contagem de votos — o resultado da assembleia. Funções puras:
// importar o módulo puxa createServerClient no topo, então mockamos pra não
// depender de env (nenhuma destas funções toca no banco).
vi.mock("@/lib/supabase/server", () => ({ createServerClient: () => ({}) }))

import {
  calcularAprovacao,
  apurarSimNao,
  apurarMultiplaEscolha,
  calcularFunilPresenca,
  type FunilSend,
} from "@/services/assembleia-votos"

type Row = { pauta_id: string; resposta: "Sim" | "Não" | "Abstenção" | null; opcao_id: string | null; peso: number }

describe("calcularAprovacao (Sim / (Sim+Não), abstenção fora)", () => {
  it("null quando ninguém votou Sim nem Não", () => {
    expect(calcularAprovacao(0, 0, 0.5)).toEqual({
      percentual_aprovacao: null,
      aprovada: null,
      empate: false,
    })
  })

  it("EMPATE exato (Sim == Não) não é aprovado — o sistema não decide empate", () => {
    const r = calcularAprovacao(5, 5, 0.5)
    expect(r.empate).toBe(true)
    expect(r.aprovada).toBe(false) // não declara APROVADA num empate
    expect(r.percentual_aprovacao).toBe(0.5)
  })

  it("aprova com maioria simples (Sim > Não)", () => {
    const r = calcularAprovacao(6, 4, 0.5)
    expect(r.percentual_aprovacao).toBeCloseTo(0.6)
    expect(r.aprovada).toBe(true)
  })

  it("rejeita quando Não supera Sim", () => {
    expect(calcularAprovacao(4, 6, 0.5).aprovada).toBe(false)
  })

  it("respeita quórum qualificado de 2/3", () => {
    expect(calcularAprovacao(6, 4, 2 / 3).aprovada).toBe(false) // 60% < 66,7%
    expect(calcularAprovacao(7, 3, 2 / 3).aprovada).toBe(true) // 70% >= 66,7%
  })
})

describe("apurarSimNao", () => {
  it("conta por participante e ponderado pelo peso congelado", () => {
    const rows: Row[] = [
      { pauta_id: "p1", resposta: "Sim", opcao_id: null, peso: 2 },
      { pauta_id: "p1", resposta: "Sim", opcao_id: null, peso: 3 },
      { pauta_id: "p1", resposta: "Não", opcao_id: null, peso: 1 },
      { pauta_id: "p1", resposta: "Abstenção", opcao_id: null, peso: 4 },
    ]
    const r = apurarSimNao(rows, 0.5)
    expect(r.por_participantes).toEqual({ sim: 2, nao: 1, abstencao: 1 })
    expect(r.ponderado).toEqual({ sim: 5, nao: 1, abstencao: 4 })
    expect(r.total_apartamentos_representados).toBe(10)
    expect(r.aprovada).toBe(true) // 5/(5+1) ≈ 83%
  })

  it("abstenção não entra na base de aprovação (não bloqueia)", () => {
    const rows: Row[] = [
      { pauta_id: "p1", resposta: "Sim", opcao_id: null, peso: 1 },
      { pauta_id: "p1", resposta: "Abstenção", opcao_id: null, peso: 10 },
    ]
    const r = apurarSimNao(rows, 0.5)
    expect(r.percentual_aprovacao).toBe(1) // 1/(1+0)
    expect(r.aprovada).toBe(true)
  })

  it("empate ponderado (Sim == Não) marca empate e NÃO aprova", () => {
    const rows: Row[] = [
      { pauta_id: "p1", resposta: "Sim", opcao_id: null, peso: 3 },
      { pauta_id: "p1", resposta: "Não", opcao_id: null, peso: 3 },
      { pauta_id: "p1", resposta: "Abstenção", opcao_id: null, peso: 1 },
    ]
    const r = apurarSimNao(rows, 0.5)
    expect(r.empate).toBe(true)
    expect(r.aprovada).toBe(false)
  })

  it("sem votos → aprovada null e total zero", () => {
    const r = apurarSimNao([], 0.5)
    expect(r.aprovada).toBeNull()
    expect(r.total_apartamentos_representados).toBe(0)
  })
})

describe("apurarMultiplaEscolha", () => {
  const pauta = { opcoes: [{ id: "a", label: "João" }, { id: "b", label: "Maria" }] } as unknown as Pauta

  it("agrupa por opção e separa abstenção", () => {
    const rows: Row[] = [
      { pauta_id: "p", resposta: null, opcao_id: "a", peso: 1 },
      { pauta_id: "p", resposta: null, opcao_id: "a", peso: 1 },
      { pauta_id: "p", resposta: null, opcao_id: "b", peso: 1 },
      { pauta_id: "p", resposta: "Abstenção", opcao_id: null, peso: 1 },
    ]
    const r = apurarMultiplaEscolha(pauta, rows)
    const a = r.opcoes_resultado.find((o) => o.opcao_id === "a")!
    const b = r.opcoes_resultado.find((o) => o.opcao_id === "b")!
    expect(a).toMatchObject({ participantes: 2, ponderado: 2 })
    expect(b).toMatchObject({ participantes: 1, ponderado: 1 })
    expect(r.ponderado.abstencao).toBe(1)
    expect(r.total_apartamentos_representados).toBe(4)
  })

  it("vencedor por PESO pode diferir do vencedor por nº de participantes", () => {
    const rows: Row[] = [
      { pauta_id: "p", resposta: null, opcao_id: "a", peso: 5 }, // 1 voto, peso 5
      { pauta_id: "p", resposta: null, opcao_id: "b", peso: 1 },
      { pauta_id: "p", resposta: null, opcao_id: "b", peso: 1 }, // 2 votos, peso 2
    ]
    const r = apurarMultiplaEscolha(pauta, rows)
    const a = r.opcoes_resultado.find((o) => o.opcao_id === "a")!
    const b = r.opcoes_resultado.find((o) => o.opcao_id === "b")!
    expect(a).toMatchObject({ participantes: 1, ponderado: 5 })
    expect(b).toMatchObject({ participantes: 2, ponderado: 2 })
    // Por peso, "a" vence (5 > 2) mesmo com menos participantes.
    const vencedorPorPeso = [...r.opcoes_resultado].sort((x, y) => y.ponderado - x.ponderado)[0]
    expect(vencedorPorPeso.opcao_id).toBe("a")
  })
})

// Funil de apuração do Carlos: das unidades presentes, quantas votaram TUDO,
// PARCIAL ou NENHUMA. Invariante: presentes = tudo + parcial + nao.
describe("calcularFunilPresenca (funil por imóvel)", () => {
  const sends: FunilSend[] = [
    // votou as 2 pautas → tudo (usa snapshot = 1)
    { id: "s1", presente: true, unidadesSnapshot: 1, unidadesCadastro: 1 },
    // votou 1 de 2 → parcial (usa snapshot = 2, ex.: 2 imóveis)
    { id: "s2", presente: true, unidadesSnapshot: 2, unidadesCadastro: 2 },
    // presente e não votou nada → nao (usa cadastro = 1)
    { id: "s3", presente: true, unidadesSnapshot: 0, unidadesCadastro: 1 },
    // ausente e não votou → fora do funil
    { id: "s4", presente: false, unidadesSnapshot: 0, unidadesCadastro: 3 },
  ]
  const votadas = new Map<string, number>([
    ["s1", 2],
    ["s2", 1],
  ])

  it("particiona os presentes em tudo / parcial / não votaram", () => {
    const r = calcularFunilPresenca(sends, votadas, 2)
    expect(r.imoveis_votaram_tudo).toBe(1) // s1
    expect(r.imoveis_parcial).toBe(2) // s2 (2 imóveis)
    expect(r.imoveis_nao_votaram).toBe(1) // s3 (cadastro), s4 é ausente → fora
    expect(r.imoveis_presentes).toBe(4) // 1 + 2 + 1
  })

  it("invariante: presentes = tudo + parcial + não votaram", () => {
    const r = calcularFunilPresenca(sends, votadas, 2)
    expect(r.imoveis_presentes).toBe(
      r.imoveis_votaram_tudo + r.imoveis_parcial + r.imoveis_nao_votaram
    )
  })

  it("quem votou todas as pautas DISPONÍVEIS conta como tudo (pauta por pauta)", () => {
    // Só 1 pauta aberta até agora; s2 votou essa 1 → tudo (não parcial).
    const r = calcularFunilPresenca(sends, new Map([["s2", 1]]), 1)
    expect(r.imoveis_votaram_tudo).toBe(2) // s2
    expect(r.imoveis_parcial).toBe(0)
    expect(r.imoveis_nao_votaram).toBe(2) // s1 e s3 presentes sem voto (cadastro 1+1)
  })
})
