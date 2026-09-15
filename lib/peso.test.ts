import { describe, expect, it } from "vitest"
import { getPesoParticipante, getPesoTotalCondominio, getQuorumEfetivo } from "./peso"

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
