// Remove o código do país (+55/55) quando presente — só reconhecido quando o
// total de dígitos é 12 ou 13 (DDD + número + "55" na frente). Com 10 ou 11
// dígitos não mexe: um DDD 55 (Rio Grande do Sul) sozinho tem esse mesmo
// prefixo e não pode ser confundido com o código do país.
function removerCodigoPais(digitos: string): string {
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return digitos.slice(2)
  }
  return digitos
}

// Separadores comuns usados quando alguém cola dois contatos no mesmo campo
// (planilha ou formulário) — vírgula, ponto e vírgula, barra, "e"/"ou" como
// palavra isolada, ou quebra de linha.
const SEPARADOR_MULTIPLOS_CONTATOS = /[,;/|\n]+|\s+(?:e|ou)\s+/i

// Divide um valor em candidatos individuais (para detectar "dois celulares
// colados na mesma célula" na importação, ou já gravados assim em cadastros
// antigos). Nunca usada para formatar sozinha — só para decidir se existe
// mais de um valor onde deveria haver um só.
export function dividirCandidatosContato(valor: string): string[] {
  return valor
    .split(SEPARADOR_MULTIPLOS_CONTATOS)
    .map((v) => v.trim())
    .filter(Boolean)
}

// Máscara de exibição do celular — só formatação visual, nunca altera o que
// está gravado no banco. Cobre os dois tamanhos comuns no Brasil (11 dígitos
// com o 9º dígito, ou 10 dígitos no formato antigo), removendo o +55 antes de
// aplicar a máscara. Alguns cadastros antigos têm dois números no mesmo
// campo (ex.: "+55 64 3223-6130;+55 64 99626-4200") — nesse caso mostra só o
// primeiro, em vez do texto bruto com o +55 e o separador à mostra (item 2/3
// do pedido: manter/exibir apenas um celular). Qualquer outra coisa (número
// incompleto etc.) é exibida como veio, sem forçar uma máscara que
// distorceria o dado.
export function formatCelular(telefone: string): string {
  const candidatos = dividirCandidatosContato(telefone)
  const primeiro = candidatos[0] ?? telefone
  const digitos = removerCodigoPais(primeiro.replace(/\D/g, ""))
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  }
  return primeiro
}

// Normaliza um celular para armazenamento: remove tudo que não é dígito e o
// código do país, e valida que sobrou um número nacional válido (10 ou 11
// dígitos — DDD + fixo/celular). Retorna null se não for um celular
// reconhecível, para o chamador decidir se rejeita ou ignora o campo.
export function normalizarCelular(valor: string): string | null {
  const digitos = removerCodigoPais(valor.replace(/\D/g, ""))
  return digitos.length === 10 || digitos.length === 11 ? digitos : null
}

// Validação simples de formato de e-mail, compartilhada entre cadastro
// manual, edição e importação — mesma regex já usada em
// lib/importacao/processor.ts, só que exportada para reuso.
export function validarEmailFormato(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())
}

// CPF só com dígitos (remove pontos/traços). Usado pra comparar o CPF digitado
// na entrada com o do cadastro (ver services/presenca.ts) sem sofrer com
// formatação diferente.
export function normalizarCpf(valor: string): string {
  return valor.replace(/\D/g, "")
}

// CPF tem os 11 dígitos (só confere o tamanho — não valida os dígitos
// verificadores). Usado pra saber se um cadastro dá pra se autoidentificar no
// link de entrada (quem não tem CPF cai no voto manual).
export function cpfCompleto(valor: string | null | undefined): boolean {
  return normalizarCpf(valor ?? "").length === 11
}

// Valida os dígitos verificadores do CPF (algoritmo da Receita) — não só o
// tamanho. Rejeita sequências de dígitos iguais (111.111.111-11, 777...-77) e
// CPF com DV errado (pedido do Carlos: "777.777.777-77 não é CPF válido e a
// rotina aceitava"). Não consulta a Receita — só a matemática dos dígitos.
export function validarCpf(valor: string | null | undefined): boolean {
  const cpf = normalizarCpf(valor ?? "")
  if (cpf.length !== 11) return false
  // Todos os 11 dígitos iguais passam na conta dos DV, mas não são CPF válido.
  if (/^(\d)\1{10}$/.test(cpf)) return false
  const digitoVerificador = (base: string, pesoInicial: number): number => {
    let soma = 0
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i)
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  if (digitoVerificador(cpf.slice(0, 9), 10) !== Number(cpf[9])) return false
  if (digitoVerificador(cpf.slice(0, 10), 11) !== Number(cpf[10])) return false
  return true
}

// CNPJ tem 14 dígitos (só tamanho). normalizarCpf é um simples tira-não-dígitos,
// serve igual pra CNPJ.
export function cnpjCompleto(valor: string | null | undefined): boolean {
  return normalizarCpf(valor ?? "").length === 14
}

// Documento completo: CPF (11) ou CNPJ (14) dígitos. Condomínio tem unidade de
// empresa (CNPJ), então identidade/cadastro aceitam os dois (pedido do Carlos).
export function cpfOuCnpjCompleto(valor: string | null | undefined): boolean {
  const n = normalizarCpf(valor ?? "").length
  return n === 11 || n === 14
}

// Valida os dígitos verificadores do CNPJ (algoritmo da Receita). Rejeita os 14
// dígitos iguais (00000000000000 e afins). Só a matemática, não consulta nada.
export function validarCnpj(valor: string | null | undefined): boolean {
  const c = normalizarCpf(valor ?? "")
  if (c.length !== 14) return false
  if (/^(\d)\1{13}$/.test(c)) return false
  const dv = (base: string, pesos: number[]): number => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  if (dv(c.slice(0, 12), p1) !== Number(c[12])) return false
  if (dv(c.slice(0, 13), p2) !== Number(c[13])) return false
  return true
}

// CPF (11) válido OU CNPJ (14) válido — a trava única pro documento no cadastro,
// na alteração e na importação.
export function validarCpfOuCnpj(valor: string | null | undefined): boolean {
  const d = normalizarCpf(valor ?? "")
  if (d.length === 11) return validarCpf(d)
  if (d.length === 14) return validarCnpj(d)
  return false
}

// CPF formatado 000.000.000-00 para exibição (só formata quando tem os 11
// dígitos; caso contrário devolve o que veio, ou null se vazio). Usado na
// lista de proprietários pro operador conferir rápido o CPF quando alguém diz
// que o link de entrada retornou "CPF ou unidade inválida" (pedido do Carlos).
export function formatCpf(valor: string | null | undefined): string | null {
  const bruto = (valor ?? "").trim()
  if (!bruto) return null
  const d = normalizarCpf(bruto)
  if (d.length !== 11) return bruto
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Formata CPF (11 díg. → 000.000.000-00) OU CNPJ (14 díg. → 00.000.000/0000-00)
// a partir de qualquer entrada; enquanto ainda não tem 11/14 dígitos, devolve só
// os dígitos (máscara progressiva). Usada no campo de alteração de CPF/CNPJ
// (pedido do Carlos: estava aceitando letras e sem formatação).
export function formatCpfCnpj(valor: string | null | undefined): string {
  const d = (valor ?? "").replace(/\D/g, "")
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

// Remove acentos, hífens e espaços, e baixa a caixa — assim buscar "joao",
// "C0502", "C-0502" ou "c 0502" encontra "João" ou a unidade "C-0502"
// independente de como foi digitado. Compartilhada entre toda busca de
// proprietário/unidade na aplicação (lista de proprietários, disparo de
// assembleia etc.).
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]/g, "")
    .toLowerCase()
}

// "imóvel"/"imóveis" (opcionalmente seguido de um adjetivo que pluraliza de
// forma regular, ex.: "representado"/"representados") — extraído porque a
// mesma conta (singular/plural na tela de resultado, no disparo de
// assembleia e nos PDFs de apuração/ata) tinha virado o mesmo ternário
// copiado em 5 lugares diferentes.
export function pluralImovel(quantidade: number, adjetivo?: string): string {
  const imovel = quantidade === 1 ? "imóvel" : "imóveis"
  if (!adjetivo) return imovel
  return `${imovel} ${quantidade === 1 ? adjetivo : `${adjetivo}s`}`
}
