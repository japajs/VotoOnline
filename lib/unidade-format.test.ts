import { describe, it, expect } from "vitest"
import { normalizarChaveUnidade, formatUnidade, menorNumeroUnidade } from "./unidade-format"

// Esta chave é o que casa a unidade digitada no /entrar (check-in por link)
// com o cadastro — e também o que decide duplicidade no cadastro. É o ponto
// que o Carlos levantou ("as unidades são B108, bloco junto do número").
describe("normalizarChaveUnidade", () => {
  it("gera a MESMA chave para todas as formas de digitar 'B108'", () => {
    const esperado = "B108"
    expect(normalizarChaveUnidade({ numero: "B108" })).toBe(esperado)
    expect(normalizarChaveUnidade({ numero: "B-108" })).toBe(esperado)
    expect(normalizarChaveUnidade({ numero: "b 108" })).toBe(esperado)
    expect(normalizarChaveUnidade({ numero: "108 B" })).toBe(esperado)
    expect(normalizarChaveUnidade({ numero: "B108", bloco: null })).toBe(esperado)
    expect(normalizarChaveUnidade({ numero: "108", bloco: "B" })).toBe(esperado)
    expect(normalizarChaveUnidade({ numero: "108", bloco: "b" })).toBe(esperado)
  })

  it("casa o que o morador digita no /entrar com o cadastro (bloco junto OU separado)", () => {
    // Cadastro guarda "B108" no número (jeito do Carlos): várias digitações casam.
    const cadastroJunto = normalizarChaveUnidade({ numero: "B108", bloco: null })
    expect(normalizarChaveUnidade({ numero: "b-108" })).toBe(cadastroJunto)
    expect(normalizarChaveUnidade({ numero: "B 108" })).toBe(cadastroJunto)

    // Cadastro com bloco separado casa com "B108" digitado tudo junto.
    const cadastroSeparado = normalizarChaveUnidade({ numero: "108", bloco: "B" })
    expect(normalizarChaveUnidade({ numero: "B108" })).toBe(cadastroSeparado)
  })

  it("preserva zeros à esquerda e NÃO confunde unidades diferentes", () => {
    expect(normalizarChaveUnidade({ numero: "0502", bloco: "C" })).toBe("C0502")
    expect(normalizarChaveUnidade({ numero: "C-0502" })).toBe("C0502")
    expect(normalizarChaveUnidade({ numero: "0502 C" })).toBe("C0502")

    expect(normalizarChaveUnidade({ numero: "A108" })).not.toBe(
      normalizarChaveUnidade({ numero: "B108" })
    )
    expect(normalizarChaveUnidade({ numero: "108" })).not.toBe(
      normalizarChaveUnidade({ numero: "0108" })
    )
  })

  it("lida com só números e com casa/letras", () => {
    expect(normalizarChaveUnidade({ numero: "0502" })).toBe("0502")
    expect(normalizarChaveUnidade({ numero: "Casa 5" })).toBe("CASA5")
    expect(normalizarChaveUnidade({ numero: "502", bloco: null })).toBe("502")
  })
})

describe("formatUnidade", () => {
  it("exibe como BLOCO-NÚMERO quando dá pra identificar", () => {
    expect(formatUnidade({ numero: "0502", bloco: "C" })).toBe("C-0502")
    expect(formatUnidade({ numero: "C 0502" })).toBe("C-0502")
    expect(formatUnidade({ numero: "0502 C" })).toBe("C-0502")
  })

  it("mantém o texto quando não há separação clara de bloco", () => {
    expect(formatUnidade({ numero: "012" })).toBe("012")
    expect(formatUnidade({ numero: "B108" })).toBe("B108")
  })
})

describe("menorNumeroUnidade", () => {
  it("retorna o menor número por ordem numérica (não alfabética)", () => {
    expect(menorNumeroUnidade([{ numero: "0205" }, { numero: "0101" }])).toBe("0101")
    expect(menorNumeroUnidade([{ numero: "12" }, { numero: "100" }, { numero: "9" }])).toBe("9")
  })

  it("retorna null sem unidades", () => {
    expect(menorNumeroUnidade([])).toBeNull()
  })
})
