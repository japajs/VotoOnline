import { describe, it, expect } from "vitest"
import {
  normalizarCpf,
  cpfCompleto,
  validarCpf,
  formatCpf,
  validarEmailFormato,
  normalizarCelular,
  formatCelular,
} from "./format"

describe("normalizarCpf", () => {
  it("mantém só os dígitos", () => {
    expect(normalizarCpf("123.456.789-01")).toBe("12345678901")
    expect(normalizarCpf("12345678901")).toBe("12345678901")
    expect(normalizarCpf(" 123 456 789 01 ")).toBe("12345678901")
    expect(normalizarCpf("")).toBe("")
  })

  it("digitações diferentes do mesmo CPF casam (usado na entrada)", () => {
    expect(normalizarCpf("123.456.789-01")).toBe(normalizarCpf("12345678901"))
  })
})

describe("cpfCompleto", () => {
  it("true só com 11 dígitos", () => {
    expect(cpfCompleto("123.456.789-01")).toBe(true)
    expect(cpfCompleto("12345678901")).toBe(true)
    expect(cpfCompleto("1234567890")).toBe(false) // 10
    expect(cpfCompleto("123456789012")).toBe(false) // 12
    expect(cpfCompleto("")).toBe(false)
    expect(cpfCompleto(null)).toBe(false)
    expect(cpfCompleto(undefined)).toBe(false)
  })
})

describe("validarCpf", () => {
  it("aceita CPF com dígitos verificadores corretos", () => {
    expect(validarCpf("111.444.777-35")).toBe(true)
    expect(validarCpf("11144477735")).toBe(true)
    expect(validarCpf("123.456.789-09")).toBe(true)
  })

  it("rejeita sequências de dígitos iguais (ex.: 777.777.777-77)", () => {
    expect(validarCpf("77777777777")).toBe(false)
    expect(validarCpf("00000000000")).toBe(false)
    expect(validarCpf("111.111.111-11")).toBe(false)
  })

  it("rejeita DV errado e tamanho inválido", () => {
    expect(validarCpf("11144477700")).toBe(false)
    expect(validarCpf("12345678900")).toBe(false)
    expect(validarCpf("1234567890")).toBe(false) // 10 dígitos
    expect(validarCpf("")).toBe(false)
    expect(validarCpf(null)).toBe(false)
    expect(validarCpf(undefined)).toBe(false)
  })
})

describe("formatCpf", () => {
  it("aplica a máscara 000.000.000-00 com 11 dígitos", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01")
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01")
    expect(formatCpf(" 12345678901 ")).toBe("123.456.789-01")
  })

  it("devolve o valor como veio quando não tem 11 dígitos", () => {
    expect(formatCpf("1234567890")).toBe("1234567890")
    expect(formatCpf("abc")).toBe("abc")
  })

  it("null para vazio/ausente (não renderiza a linha de CPF)", () => {
    expect(formatCpf("")).toBeNull()
    expect(formatCpf("   ")).toBeNull()
    expect(formatCpf(null)).toBeNull()
    expect(formatCpf(undefined)).toBeNull()
  })
})

describe("validarEmailFormato", () => {
  it("aceita válido, rejeita inválido", () => {
    expect(validarEmailFormato("a@b.com")).toBe(true)
    expect(validarEmailFormato(" joao@exemplo.com.br ")).toBe(true)
    expect(validarEmailFormato("semarroba.com")).toBe(false)
    expect(validarEmailFormato("a@b")).toBe(false)
    expect(validarEmailFormato("a @b.com")).toBe(false)
  })
})

describe("normalizarCelular", () => {
  it("remove +55 e aceita 10/11 dígitos", () => {
    expect(normalizarCelular("+55 (64) 99603-8370")).toBe("64996038370")
    expect(normalizarCelular("(64) 3223-6130")).toBe("6432236130")
    expect(normalizarCelular("123")).toBeNull()
  })
})

describe("formatCelular", () => {
  it("aplica máscara de 11 e 10 dígitos", () => {
    expect(formatCelular("64996038370")).toBe("(64) 99603-8370")
    expect(formatCelular("6432236130")).toBe("(64) 3223-6130")
  })
})
