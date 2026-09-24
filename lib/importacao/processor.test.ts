import { describe, expect, it } from "vitest"
import { processarLinhas } from "./processor"
import type { ImportacaoLinha } from "@/types"

// Reduz o boilerplate de montar uma linha de planilha — só declara o que
// cada teste realmente precisa customizar.
function linha(overrides: Partial<ImportacaoLinha> & { _linhaOriginal: number }): ImportacaoLinha {
  return {
    imovel: "A101",
    nome: "Fulano de Tal",
    whatsapp: null,
    email: null,
    inadimplente: null,
    fracaoIdeal: null,
    cpf: null,
    ...overrides,
  }
}

// Números das unidades de um proprietário, na ordem — a maioria dos testes
// só se importa com quais unidades entraram, não com a fração de cada uma.
function numeros(unidades: { numero: string }[]): string[] {
  return unidades.map((u) => u.numero)
}

describe("processarLinhas — casos básicos", () => {
  it("uma linha simples vira um proprietário com uma unidade, sem erros", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 2, nome: "Maria Silva", imovel: "A101" }),
    ])
    expect(resultado.totalProprietarios).toBe(1)
    expect(resultado.totalUnidades).toBe(1)
    expect(resultado.proprietarios[0]).toMatchObject({ nome: "Maria Silva", inadimplente: false })
    expect(numeros(resultado.proprietarios[0].unidades)).toEqual(["A101"])
    expect(resultado.erros).toHaveLength(0)
  })

  it("nome vazio: linha é ignorada e gera erro, não vira proprietário", () => {
    const resultado = processarLinhas([linha({ _linhaOriginal: 3, nome: "   ", imovel: "A102" })])
    expect(resultado.totalProprietarios).toBe(0)
    expect(resultado.linhasIgnoradas).toBe(1)
    expect(resultado.erros[0]).toMatchObject({ campo: "Nome", linha: 3 })
  })

  it("imóvel vazio: linha é ignorada e gera erro", () => {
    const resultado = processarLinhas([linha({ _linhaOriginal: 4, imovel: "  " })])
    expect(resultado.totalProprietarios).toBe(0)
    expect(resultado.linhasIgnoradas).toBe(1)
    expect(resultado.erros[0]).toMatchObject({ campo: "Imóvel", linha: 4 })
  })

  it("e-mail em formato inválido: proprietário é criado sem e-mail, com aviso", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 5, nome: "João Souza", email: "não-é-um-email" }),
    ])
    expect(resultado.proprietarios[0]).toMatchObject({ nome: "João Souza", email: null })
    expect(resultado.erros).toContainEqual(
      expect.objectContaining({ campo: "E-mail", mensagem: expect.stringContaining("inválido") })
    )
  })

  it("mesma unidade repetida para o mesmo proprietário: 2ª ocorrência é ignorada", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 6, nome: "Ana Costa", imovel: "B201", email: "ana@example.com" }),
      linha({ _linhaOriginal: 7, nome: "Ana Costa", imovel: "B201", email: "ana@example.com" }),
    ])
    expect(resultado.totalProprietarios).toBe(1)
    expect(numeros(resultado.proprietarios[0].unidades)).toEqual(["B201"])
    expect(resultado.linhasIgnoradas).toBe(1)
    expect(resultado.erros).toContainEqual(
      expect.objectContaining({ campo: "Imóvel", mensagem: expect.stringContaining("duplicada") })
    )
  })
})

describe("processarLinhas — agrupamento de proprietário com mais de uma unidade", () => {
  it("mesmo nome e mesmo e-mail em linhas diferentes: funde num só proprietário com as duas unidades", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 10, nome: "Carlos Pereira", imovel: "C101", email: "carlos@example.com" }),
      linha({ _linhaOriginal: 11, nome: "Carlos Pereira", imovel: "C102", email: "carlos@example.com" }),
    ])
    expect(resultado.totalProprietarios).toBe(1)
    expect(resultado.duplicidades).toBe(1)
    expect(numeros(resultado.proprietarios[0].unidades)).toEqual(["C101", "C102"])
  })

  it("mesma pessoa com variação de acento no nome entre as linhas: ainda funde num só cadastro", () => {
    // Achado de auditoria: sem normalizar acento na chave de agrupamento,
    // "José Silva" e "Jose Silva" (mesmo e-mail, mesma pessoa, só a grafia
    // do nome variando) viravam DOIS cadastros em vez de um só com duas
    // unidades.
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 20, nome: "José Silva", imovel: "D101", email: "jose@example.com" }),
      linha({ _linhaOriginal: 21, nome: "Jose Silva", imovel: "D102", email: "jose@example.com" }),
    ])
    expect(resultado.totalProprietarios).toBe(1)
    expect(numeros(resultado.proprietarios[0].unidades)).toEqual(["D101", "D102"])
    // Nomes diferentes só por acento não devem disparar o aviso de e-mail
    // compartilhado — são a mesma pessoa, não um caso suspeito.
    expect(resultado.erros).not.toContainEqual(
      expect.objectContaining({ mensagem: expect.stringContaining("nomes diferentes") })
    )
  })
})

describe("processarLinhas — e-mail compartilhado por donos diferentes (bug real do condomínio Águas da Serra)", () => {
  it("várias unidades de pessoas DIFERENTES sob o mesmo e-mail (portaria/zelador): não funde, cada uma vira um proprietário separado", () => {
    // Caso real: 5 unidades usando o e-mail da portaria
    // "paulinhoaguasdaserra@hotmail.com" — a importação antiga fundia tudo
    // num só cadastro ("Maria Calixta com 5 aptos"), e as outras 4 pessoas
    // nunca ganhavam cadastro próprio.
    const email = "paulinhoaguasdaserra@hotmail.com"
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 30, nome: "Maria Calixta de F Goncalves", imovel: "C0404", email }),
      linha({ _linhaOriginal: 31, nome: "Damiao Vieira da Silva", imovel: "C0806", email }),
      linha({ _linhaOriginal: 32, nome: "Maria Lucia G Vieira", imovel: "D0606", email }),
      linha({ _linhaOriginal: 33, nome: "Maria Calixta de F Goncalves", imovel: "D0703", email }),
      linha({ _linhaOriginal: 34, nome: "Geovane Alexandre de Souza", imovel: "E0902", email }),
    ])

    // 4 proprietários distintos: Maria Calixta (com 2 unidades reais dela),
    // Damiao, Maria Lucia e Geovane (1 unidade cada, cadastro próprio).
    expect(resultado.totalProprietarios).toBe(4)
    expect(resultado.totalUnidades).toBe(5)

    const porNome = Object.fromEntries(
      resultado.proprietarios.map((p) => [p.nome, numeros(p.unidades)])
    )
    expect(porNome["Maria Calixta de F Goncalves"]).toEqual(["C0404", "D0703"])
    expect(porNome["Damiao Vieira da Silva"]).toEqual(["C0806"])
    expect(porNome["Maria Lucia G Vieira"]).toEqual(["D0606"])
    expect(porNome["Geovane Alexandre de Souza"]).toEqual(["E0902"])

    // E o aviso de e-mail compartilhado precisa existir, citando as 4
    // pessoas — pra o síndico confirmar se é intencional (era, nesse caso:
    // contato da portaria) ou erro de digitação.
    const aviso = resultado.erros.find(
      (e) => e.campo === "E-mail" && e.mensagem.includes("nomes diferentes")
    )
    expect(aviso).toBeDefined()
    expect(aviso?.mensagem).toContain("4 nomes diferentes")
    expect(aviso?.dados).toContain("damiao vieira da silva")
    expect(aviso?.dados).toContain("geovane alexandre de souza")
  })

  it("mesmo nome, mesmo e-mail, porém CPF não faz parte da chave — planilha não traz CPF pra esta função (fica a cargo da revisão manual)", () => {
    // Documenta uma limitação conhecida: duas pessoas diferentes com o
    // MESMO nome completo e MESMO e-mail (coincidência ou erro de
    // digitação) ainda se fundem num só cadastro aqui — só o cruzamento
    // manual com CPF (como fizemos hoje via SQL) pega esse caso residual.
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 40, nome: "Jose Reis Oliveira Santos", imovel: "A0501", email: "jr@example.com" }),
      linha({ _linhaOriginal: 41, nome: "Jose Reis Oliveira Santos", imovel: "C0906", email: "jr@example.com" }),
    ])
    expect(resultado.totalProprietarios).toBe(1)
    expect(numeros(resultado.proprietarios[0].unidades)).toEqual(["A0501", "C0906"])
  })
})

describe("processarLinhas — Restrição/inadimplente (planilha real: condomínio com 33% das unidades marcadas)", () => {
  it("célula de Restrição preenchida vira proprietário inadimplente", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 50, nome: "Pessoa Devedora", imovel: "A101", inadimplente: "inadimplente" }),
    ])
    expect(resultado.proprietarios[0].inadimplente).toBe(true)
  })

  it("célula de Restrição vazia vira proprietário adimplente (não bloqueado)", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 51, nome: "Pessoa em Dia", imovel: "A102", inadimplente: null }),
    ])
    expect(resultado.proprietarios[0].inadimplente).toBe(false)
  })

  it("proprietário com 2 unidades, só uma marcada inadimplente: o cadastro inteiro fica inadimplente", () => {
    // proprietarios.inadimplente é uma flag por PESSOA, não por unidade —
    // se qualquer uma das unidades dele veio marcada, ele não pode votar.
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 60, nome: "Dono Misto", imovel: "A101", email: "misto@example.com", inadimplente: "inadimplente" }),
      linha({ _linhaOriginal: 61, nome: "Dono Misto", imovel: "A102", email: "misto@example.com", inadimplente: null }),
    ])
    expect(resultado.totalProprietarios).toBe(1)
    expect(resultado.proprietarios[0].inadimplente).toBe(true)
  })

  it('coluna chamada literalmente "Inadimplente" com "Não" não marca como inadimplente', () => {
    // Achado de revisão: a 1ª versão tratava QUALQUER célula não vazia como
    // inadimplente — mas o dicionário de sinônimos também casa uma coluna
    // chamada "Inadimplente" (não só "Restrição"), e essas costumam vir
    // preenchidas com "Sim"/"Não" em toda linha. Sem reconhecer "Não" como
    // negativo, todo proprietário em dia ficava bloqueado de votar.
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 62, nome: "Pessoa em Dia (coluna Sim/Não)", imovel: "A103", inadimplente: "Não" }),
    ])
    expect(resultado.proprietarios[0].inadimplente).toBe(false)
  })

  it('"Sim" na coluna Inadimplente marca como inadimplente', () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 63, nome: "Pessoa Devedora (coluna Sim/Não)", imovel: "A104", inadimplente: "Sim" }),
    ])
    expect(resultado.proprietarios[0].inadimplente).toBe(true)
  })
})

describe("processarLinhas — Fração ideal", () => {
  it("fração com ponto decimal é lida corretamente", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 70, nome: "Dona Fração", imovel: "A101", fracaoIdeal: "0.364" }),
    ])
    expect(resultado.proprietarios[0].unidades[0]).toMatchObject({ numero: "A101", fracaoIdeal: 0.364 })
  })

  it("fração com vírgula decimal (planilha exportada em pt-BR) também é lida", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 71, nome: "Dona Fração BR", imovel: "A102", fracaoIdeal: "0,492" }),
    ])
    expect(resultado.proprietarios[0].unidades[0].fracaoIdeal).toBe(0.492)
  })

  it("fração inválida (texto não numérico): unidade entra com fração nula e gera aviso, sem bloquear a linha", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 72, nome: "Fração Ruim", imovel: "A103", fracaoIdeal: "abc" }),
    ])
    expect(resultado.proprietarios[0].unidades[0].fracaoIdeal).toBeNull()
    expect(resultado.erros).toContainEqual(
      expect.objectContaining({ campo: "Fração ideal", mensagem: expect.stringContaining("inválida") })
    )
  })

  it("cada unidade guarda sua própria fração, mesmo fundidas no mesmo proprietário", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 80, nome: "Dois Aptos", imovel: "A101", email: "dois@example.com", fracaoIdeal: "0.364" }),
      linha({ _linhaOriginal: 81, nome: "Dois Aptos", imovel: "B201", email: "dois@example.com", fracaoIdeal: "0.492" }),
    ])
    expect(resultado.proprietarios[0].unidades).toEqual([
      { numero: "A101", fracaoIdeal: 0.364 },
      { numero: "B201", fracaoIdeal: 0.492 },
    ])
  })
})

describe("processarLinhas — CPF", () => {
  it("CPF da planilha é atribuído ao proprietário", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 90, nome: "Dono com CPF", imovel: "A101", cpf: "123.456.789-00" }),
    ])
    expect(resultado.proprietarios[0].cpf).toBe("123.456.789-00")
  })

  it("CPF divergente entre linhas fundidas no mesmo proprietário: mantém o primeiro e gera aviso", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 91, nome: "Dono Duplo", imovel: "A101", email: "duplo@example.com", cpf: "111.111.111-11" }),
      linha({ _linhaOriginal: 92, nome: "Dono Duplo", imovel: "A102", email: "duplo@example.com", cpf: "222.222.222-22" }),
    ])
    expect(resultado.proprietarios[0].cpf).toBe("111.111.111-11")
    expect(resultado.erros).toContainEqual(
      expect.objectContaining({ campo: "CPF", mensagem: expect.stringContaining("diverge") })
    )
  })
})

describe("processarLinhas — escala da fração ideal (planilha em porcentagem)", () => {
  it("frações somando ≈ 92,88 (porcentagem) são gravadas divididas por 100 e a escala é sinalizada no preview", () => {
    // 22 unidades por andar × 10 andares no Caldas Novas Flat: 12 de 0,364 e 10 de 0,492.
    const linhas = Array.from({ length: 220 }, (_, i) =>
      linha({
        _linhaOriginal: i + 2,
        nome: `Dono ${i}`,
        imovel: `U${i}`,
        fracaoIdeal: i % 22 < 12 ? "0.364" : "0.492",
      })
    )
    const resultado = processarLinhas(linhas)
    const soma = resultado.proprietarios.reduce(
      (acc, p) => acc + p.unidades.reduce((a, u) => a + (u.fracaoIdeal ?? 0), 0),
      0
    )
    expect(resultado.fracaoIdealEscala?.divisor).toBe(100)
    expect(resultado.fracaoIdealEscala?.soma).toBeCloseTo(92.88, 4)
    expect(soma).toBeCloseTo(0.9288, 4)
    expect(resultado.proprietarios[0].unidades[0].fracaoIdeal).toBe(0.00364)
  })

  it("frações já em fração de 1: não converte", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 2, nome: "A", imovel: "1", fracaoIdeal: "0.5" }),
      linha({ _linhaOriginal: 3, nome: "B", imovel: "2", fracaoIdeal: "0.5" }),
    ])
    expect(resultado.fracaoIdealEscala?.divisor).toBe(1)
    expect(resultado.proprietarios[0].unidades[0].fracaoIdeal).toBe(0.5)
  })

  it("soma fora de qualquer escala: mantém os valores como vieram e sinaliza divisor null", () => {
    const resultado = processarLinhas([
      linha({ _linhaOriginal: 2, nome: "A", imovel: "1", fracaoIdeal: "7" }),
      linha({ _linhaOriginal: 3, nome: "B", imovel: "2", fracaoIdeal: "8" }),
    ])
    expect(resultado.fracaoIdealEscala?.divisor).toBeNull()
    expect(resultado.proprietarios[0].unidades[0].fracaoIdeal).toBe(7)
  })

  it("planilha sem coluna de fração: nenhuma informação de escala no preview", () => {
    const resultado = processarLinhas([linha({ _linhaOriginal: 2, nome: "A", imovel: "1" })])
    expect(resultado.fracaoIdealEscala).toBeUndefined()
  })
})
