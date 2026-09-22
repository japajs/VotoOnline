import type { CampoImportacao, DeteccaoColuna, ImportacaoLinha } from "@/types"

// ─── Dicionário de sinônimos ──────────────────────────────────────────────────
// Fonte única de verdade para reconhecimento de colunas. Para adicionar novos
// sinônimos, edite apenas este objeto.

type CampoMapeavel = Exclude<CampoImportacao, "ignorar">

export const ALIASES: Record<CampoMapeavel, string[]> = {
  imovel: [
    "imovel",
    "unidade",
    "apartamento",
    "apto",
    "ap",
    "numero",
    "nr",
    "no",
    "num",
    "bloco",
    "unidadeautonoma",
    "apartamentono",
    "apartamentonr",
    "apartamentono",
    "unidadeno",
  ],
  nome: [
    "nome",
    "proprietario",
    "morador",
    "titular",
    "condomino",
    "nomecompleto",
    "nomeproprietario",
  ],
  whatsapp: [
    "whatsapp",
    "telefone",
    "celular",
    "fone",
    "tel",
    "contato",
    "phone",
    "celulartelefone",
    "telefonecellular",
    "zap",
  ],
  email: [
    "email",
    "mail",
    "correioeletronico",
    "correio",
    "emailaddress",
    "enderecoeletronico",
    "emaillabel",
  ],
  inadimplente: ["restricao", "inadimplente"],
  fracaoIdeal: ["fracao", "fracaoideal"],
  cpf: ["cpf", "cpfcnpj"],
}

// ─── Normalização ─────────────────────────────────────────────────────────────

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

// ─── Detecção automática ──────────────────────────────────────────────────────

export function detectarColunas(headers: string[]): DeteccaoColuna[] {
  const usados = new Set<CampoMapeavel>()

  return headers.map((header, colIdx) => {
    const normalized = normalizeHeader(header)
    let campoDetetado: CampoImportacao | null = null

    for (const [campo, aliases] of Object.entries(ALIASES) as [CampoMapeavel, string[]][]) {
      if (aliases.includes(normalized) && !usados.has(campo)) {
        campoDetetado = campo
        usados.add(campo)
        break
      }
    }

    return { colIdx, header, campoDetetado }
  })
}

// ─── Aplicação do mapeamento ──────────────────────────────────────────────────

export function aplicarMapeamento(
  rows: string[][],
  mapeamento: Record<number, CampoImportacao>
): ImportacaoLinha[] {
  const linhas: ImportacaoLinha[] = []

  rows.forEach((row, rowIdx) => {
    const campos: Partial<Record<CampoMapeavel, string | null>> = {}

    for (const [colIdxStr, campo] of Object.entries(mapeamento)) {
      if (campo === "ignorar") continue
      const val = row[parseInt(colIdxStr)]?.trim() ?? ""
      campos[campo as CampoMapeavel] = val || null
    }

    const imovel = campos.imovel
    const nome = campos.nome
    if (!imovel || !nome) return

    linhas.push({
      imovel,
      nome,
      whatsapp: campos.whatsapp ?? null,
      email: campos.email ?? null,
      inadimplente: campos.inadimplente ?? null,
      fracaoIdeal: campos.fracaoIdeal ?? null,
      cpf: campos.cpf ?? null,
      _linhaOriginal: rowIdx + 2, // +1 para 1-index, +1 pelo cabeçalho
    })
  })

  return linhas
}
