import { describe, expect, it } from "vitest"
import { detectarColunas, normalizeHeader } from "./mapper"
import type { CampoImportacao } from "@/types"

// Mapa coluna → campo detectado, pra asserir sem depender da ordem.
function deteccao(headers: string[]): Record<string, CampoImportacao | null> {
  return Object.fromEntries(detectarColunas(headers).map((d) => [d.header, d.campoDetetado]))
}

describe("detectarColunas — detecção básica", () => {
  it("reconhece imóvel, nome, e-mail, celular e CPF pelos cabeçalhos comuns", () => {
    const d = deteccao(["Unidade", "Proprietário", "E-mail", "Celular", "CPF"])
    expect(d["Unidade"]).toBe("imovel")
    expect(d["Proprietário"]).toBe("nome")
    expect(d["E-mail"]).toBe("email")
    expect(d["Celular"]).toBe("whatsapp")
    expect(d["CPF"]).toBe("cpf")
  })

  it("cada campo é usado só uma vez — a 2ª coluna que casaria o mesmo campo fica sem detecção", () => {
    // "Unidade" e "Bloco" são ambos apelidos de imóvel: a 1ª vence, a 2ª não.
    const d = detectarColunas(["Unidade", "Bloco"])
    expect(d[0].campoDetetado).toBe("imovel")
    expect(d[1].campoDetetado).toBeNull()
  })
})

describe("detectarColunas — cônjuge / 2º participante", () => {
  it("reconhece a coluna CÔNJUGE (com e sem acento) e variações", () => {
    expect(deteccao(["Cônjuge"])["Cônjuge"]).toBe("conjuge")
    expect(deteccao(["Conjuge"])["Conjuge"]).toBe("conjuge")
    expect(deteccao(["Esposa"])["Esposa"]).toBe("conjuge")
    expect(deteccao(["2º Participante"])["2º Participante"]).toBe("conjuge")
  })
})

describe("detectarColunas — inadimplente (polaridade)", () => {
  it("reconhece Restrição / Inadimplente / Inadimplência / Devedor", () => {
    expect(deteccao(["Restrição"])["Restrição"]).toBe("inadimplente")
    expect(deteccao(["Inadimplente"])["Inadimplente"]).toBe("inadimplente")
    expect(deteccao(["Inadimplência"])["Inadimplência"]).toBe("inadimplente")
    expect(deteccao(["Devedor"])["Devedor"]).toBe("inadimplente")
  })

  it('NÃO trata "Adimplência" como inadimplente — polaridade invertida bloquearia quem está em dia', () => {
    // Guarda de regressão: uma coluna "Adimplência=Sim" (está em dia) NÃO pode
    // mapear pra inadimplente, senão resolverInadimplente leria "Sim" como
    // inadimplente e impediria de votar quem está adimplente (efeito legal).
    expect(deteccao(["Adimplência"])["Adimplência"]).toBeNull()
    expect(deteccao(["Adimplente"])["Adimplente"]).toBeNull()
  })
})

describe("normalizeHeader", () => {
  it("baixa caixa, remove acento e tudo que não é alfanumérico", () => {
    expect(normalizeHeader("  Cônjuge / 2º ")).toBe("conjuge2")
    expect(normalizeHeader("Inadimplência")).toBe("inadimplencia")
  })
})
