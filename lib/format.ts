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
