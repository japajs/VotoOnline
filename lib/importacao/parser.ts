import type { ImportacaoLinha, LeituraArquivo } from "@/types"
import { detectarColunas, aplicarMapeamento } from "./mapper"
import type { CampoImportacao } from "@/types"

// ─── Leitura bruta do arquivo ─────────────────────────────────────────────────

// Auditoria funcional: CSV é texto puro, sem nenhuma informação de
// codificação embutida (diferente de .xlsx, que é um ZIP com XML já em
// UTF-8) — passar os bytes crus pro XLSX.read (type "array"/"buffer") faz a
// própria lib adivinhar a codificação, e ela adivinha errado: todo acento
// vira mojibake ("Proprietário" → "ProprietÃ¡rio"), ou seja, praticamente
// todo nome brasileiro. Decodifica explicitamente aqui: tenta UTF-8 (o mais
// comum hoje, inclusive com BOM — TextDecoder já ignora o BOM sozinho) e,
// só se os bytes não formarem UTF-8 válido, cai pra Windows-1252 (o "ANSI"
// que o Excel no Windows ainda usa por padrão ao salvar "CSV" em vez de
// "CSV UTF-8"). .xlsx/.xls continuam indo como bytes crus — são binários,
// decodificar como texto quebraria o arquivo.
function decodeCsvText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

export async function parseFileRaw(file: File): Promise<LeituraArquivo> {
  const XLSX = await import("xlsx")

  const buffer = await file.arrayBuffer()
  const isCsv = file.name.toLowerCase().endsWith(".csv")
  const workbook = isCsv
    ? XLSX.read(decodeCsvText(buffer), { type: "string", raw: false })
    : XLSX.read(buffer, { type: "array", raw: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [], totalLinhas: 0 }

  const sheet = workbook.Sheets[sheetName]
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  })

  if (allRows.length === 0) return { headers: [], rows: [], totalLinhas: 0 }

  const headers = (allRows[0] as unknown[]).map((h) => String(h ?? "").trim())
  const rows = allRows
    .slice(1)
    .map((row) => (row as unknown[]).map((c) => String(c ?? "").trim()))

  return { headers, rows, totalLinhas: rows.length }
}

// ─── Compatibilidade com wizard v1 (removido na Etapa 2) ─────────────────────

export interface ParseResult {
  linhas: ImportacaoLinha[]
  colunasFaltando: string[]
}

export async function parseFile(file: File): Promise<ParseResult> {
  const leitura = await parseFileRaw(file)

  if (leitura.headers.length === 0) {
    return { linhas: [], colunasFaltando: ["imovel", "nome"] }
  }

  const deteccoes = detectarColunas(leitura.headers)

  const mapeamento: Record<number, CampoImportacao> = {}
  deteccoes.forEach((d) => {
    if (d.campoDetetado && d.campoDetetado !== "ignorar") {
      mapeamento[d.colIdx] = d.campoDetetado
    }
  })

  const camposEncontrados = new Set(Object.values(mapeamento))
  const colunasFaltando = (["imovel", "nome"] as const).filter(
    (c) => !camposEncontrados.has(c)
  )

  if (colunasFaltando.length > 0) {
    return { linhas: [], colunasFaltando }
  }

  const linhas = aplicarMapeamento(leitura.rows, mapeamento)
  return { linhas, colunasFaltando: [] }
}
