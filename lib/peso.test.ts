import { describe, expect, it } from "vitest"
import {
  converterEscalaFracaoIdeal,
  detectarDivisorEscalaFracaoIdeal,
  getPesoParticipante,
  getPesoTotalCondominio,
  getQuorumEfetivo,
} from "./peso"

describe("getPesoParticipante", () => {
  it("critério 'unidade' (padrão): peso é a quantidade de unidades", () => {
    const proprietario = { unidades: [{ fracao_ideal: null }, { fracao_ideal: null }] }
    expect(getPesoParticipante(proprietario)).toBe(2)
    expect(getPesoParticipante(proprietario, "unidade")).toBe(2)
  })

  it("sem nenhuma unidade vinculada, peso é 0 (não undefined/NaN)", () => {
    expect(getPesoParticipante({})).toBe(0)
    expect(getPesoParticipante({ unidades: [] })).toBe(0)
  })

  it("critério 'fracao_ideal': peso é a soma das frações", () => {
    const proprietario = { unidades: [{ fracao_ideal: 0.01 }, { fracao_ideal: 0.02 }] }
    expect(getPesoParticipante(proprietario, "fracao_ideal")).toBeCloseTo(0.03)
  })

  it("critério 'fracao_ideal': unidade sem fração preenchida conta como 0, não quebra a soma", () => {
    const proprietario = { unidades: [{ fracao_ideal: 0.05 }, { fracao_ideal: null }, {}] }
    expect(getPesoParticipante(proprietario, "fracao_ideal")).toBeCloseTo(0.05)
  })
})

describe("getPesoTotalCondominio", () => {
  it("critério 'unidade': total é a quantidade de unidades do condomínio inteiro", () => {
    const unidades = [{ fracao_ideal: null }, { fracao_ideal: null }, { fracao_ideal: null }]
    expect(getPesoTotalCondominio(unidades)).toBe(3)
  })

  it("critério 'fracao_ideal': total é a soma de todas as frações", () => {
    const unidades = [{ fracao_ideal: 0.1 }, { fracao_ideal: 0.2 }, { fracao_ideal: 0.3 }]
    expect(getPesoTotalCondominio(unidades, "fracao_ideal")).toBeCloseTo(0.6)
  })

  it("condomínio sem nenhuma unidade cadastrada: total é 0", () => {
    expect(getPesoTotalCondominio([])).toBe(0)
    expect(getPesoTotalCondominio([], "fracao_ideal")).toBe(0)
  })
})

describe("getQuorumEfetivo", () => {
  it("sem 1ª/2ª convocação configurada (data_1a_convocacao null): usa sempre quorum_minimo", () => {
    const resultado = getQuorumEfetivo({
      quorum_minimo: 0.5,
      quorum_minimo_2a: null,
      data_1a_convocacao: null,
      dataReferencia: new Date("2026-09-12T12:00:00Z"),
    })
    expect(resultado).toEqual({ quorumAplicavel: 0.5, convocacaoAplicada: null })
  })

  it("dataReferencia antes do prazo da 1ª convocação: aplica quorum_minimo (1ª)", () => {
    const resultado = getQuorumEfetivo({
      quorum_minimo: 0.5,
      quorum_minimo_2a: 0.25,
      data_1a_convocacao: "2026-09-12T08:30:00Z",
      dataReferencia: new Date("2026-09-12T08:00:00Z"),
    })
    expect(resultado).toEqual({ quorumAplicavel: 0.5, convocacaoAplicada: 1 })
  })

  it("dataReferencia exatamente no prazo da 1ª convocação: ainda conta como 1ª (limite inclusivo)", () => {
    const resultado = getQuorumEfetivo({
      quorum_minimo: 0.5,
      quorum_minimo_2a: 0.25,
      data_1a_convocacao: "2026-09-12T08:30:00Z",
      dataReferencia: new Date("2026-09-12T08:30:00Z"),
    })
    expect(resultado).toEqual({ quorumAplicavel: 0.5, convocacaoAplicada: 1 })
  })

  it("dataReferencia depois do prazo da 1ª convocação: aplica quorum_minimo_2a (2ª)", () => {
    const resultado = getQuorumEfetivo({
      quorum_minimo: 0.5,
      quorum_minimo_2a: 0.25,
      data_1a_convocacao: "2026-09-12T08:30:00Z",
      dataReferencia: new Date("2026-09-12T09:00:00Z"),
    })
    expect(resultado).toEqual({ quorumAplicavel: 0.25, convocacaoAplicada: 2 })
  })

  it("2ª convocação sem quorum_minimo_2a configurado: quorumAplicavel vira null (sem checagem)", () => {
    const resultado = getQuorumEfetivo({
      quorum_minimo: 0.5,
      quorum_minimo_2a: null,
      data_1a_convocacao: "2026-09-12T08:30:00Z",
      dataReferencia: new Date("2026-09-12T09:00:00Z"),
    })
    expect(resultado).toEqual({ quorumAplicavel: null, convocacaoAplicada: 2 })
  })
})

describe("detectarDivisorEscalaFracaoIdeal", () => {
  it("planilha real do Caldas Novas Flat: 220 unidades (12×0,364 + 10×0,492 por andar, 10 andares) somam 92,88 → porcentagem, divisor 100", () => {
    // Regressão do achado de escala: sem converter, o e-mail de convite
    // diria "Seu peso de voto: 36,4000%" pra quem tem 0,364%.
    const soma = 10 * (12 * 0.364 + 10 * 0.492)
    expect(soma).toBeCloseTo(92.88, 6)
    expect(detectarDivisorEscalaFracaoIdeal(soma)).toBe(100)
  })

  it("já em fração de 1 (soma ≈ 1): não converte", () => {
    expect(detectarDivisorEscalaFracaoIdeal(1)).toBe(1)
    expect(detectarDivisorEscalaFracaoIdeal(0.9288)).toBe(1)
    expect(detectarDivisorEscalaFracaoIdeal(1.4)).toBe(1)
  })

  it("importação parcial em fração de 1 (soma pequena): não converte", () => {
    expect(detectarDivisorEscalaFracaoIdeal(0.14)).toBe(1)
  })

  it("milésimos (soma ≈ 1000) e décimos de milésimo (soma ≈ 10000)", () => {
    expect(detectarDivisorEscalaFracaoIdeal(1000)).toBe(1000)
    expect(detectarDivisorEscalaFracaoIdeal(10000)).toBe(10000)
  })

  it("soma que não parece nenhuma escala: devolve null em vez de adivinhar", () => {
    expect(detectarDivisorEscalaFracaoIdeal(3.2)).toBeNull()
    expect(detectarDivisorEscalaFracaoIdeal(15)).toBeNull()
    expect(detectarDivisorEscalaFracaoIdeal(180)).toBeNull()
  })

  it("sem valor nenhum (soma 0): nada a converter", () => {
    expect(detectarDivisorEscalaFracaoIdeal(0)).toBe(1)
  })
})

describe("converterEscalaFracaoIdeal", () => {
  it("0,364 (%) → 0,00364 (fração de 1), respeitando as 6 casas da coluna numeric(14,6)", () => {
    expect(converterEscalaFracaoIdeal(0.364, 100)).toBe(0.00364)
    expect(converterEscalaFracaoIdeal(0.492, 100)).toBe(0.00492)
  })

  it("depois de converter, a soma do condomínio inteiro fica ≈ 0,9288 (peso e quórum continuam proporcionais)", () => {
    const unidades = [
      ...Array.from({ length: 120 }, () => 0.364),
      ...Array.from({ length: 100 }, () => 0.492),
    ].map((v) => converterEscalaFracaoIdeal(v, 100))
    const soma = unidades.reduce((a, b) => a + b, 0)
    expect(soma).toBeCloseTo(0.9288, 5)
    expect(detectarDivisorEscalaFracaoIdeal(soma)).toBe(1)
  })
})
