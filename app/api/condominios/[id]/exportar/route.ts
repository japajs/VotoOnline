import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { getCondominioById } from "@/services/condominios"
import { getAllProprietarios } from "@/services/proprietarios"
import { sanitizarLinhas } from "@/lib/relatorios/utils"
import { formatUnidade } from "@/lib/unidade-format"
import { APP_NAME } from "@/lib/constants"
import type { Proprietario } from "@/types"

// Monta o XLSX de proprietários (uma linha por unidade). Inclui a coluna
// "Imóvel" no formato combinado que aparece na tela (ex.: "D0204") — pedido do
// Carlos: a exportação não trazia o imóvel pra filtrar no Excel; as colunas
// Unidade/Bloco separadas continuam, mas "Imóvel" é a que casa com a lista.
function gerarXlsxProprietarios(nomeCondominio: string, proprietarios: Proprietario[]) {
  const rows: string[][] = []
  for (const prop of proprietarios) {
    const unidades = prop.unidades ?? []
    const conjuge = prop.conjuge ?? ""
    if (unidades.length === 0) {
      rows.push([prop.nome, prop.email ?? "", prop.cpf ?? "", prop.telefone ?? "", conjuge, "", "", ""])
    } else {
      for (const u of unidades) {
        rows.push([
          prop.nome,
          prop.email ?? "",
          prop.cpf ?? "",
          prop.telefone ?? "",
          conjuge,
          formatUnidade(u),
          u.numero,
          u.bloco ?? "",
        ])
      }
    }
  }

  const header = ["Nome", "E-mail", "CPF", "Telefone / WhatsApp", "Cônjuge", "Imóvel", "Unidade", "Bloco"]
  // Auditoria de segurança: escapa células que começam com = + - @ (nome/
  // e-mail/CPF vêm do cadastro e poderiam virar fórmula no Excel). Mesma
  // defesa já usada na apuração (ver lib/relatorios/utils.ts:sanitizarLinhas).
  const ws = XLSX.utils.aoa_to_sheet(sanitizarLinhas([header, ...rows]))

  ws["!cols"] = [
    { wch: 36 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ]

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = { font: { bold: true } }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Proprietários")
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const filename = `${APP_NAME}_${nomeCondominio.replace(/[^a-z0-9]/gi, "_")}_Proprietarios.xlsx`
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

async function carregar(id: string) {
  const session = await getSession()
  if (!session) return { erro: new NextResponse("Unauthorized", { status: 401 }) }
  if (session.perfil === "visualizador") return { erro: new NextResponse("Forbidden", { status: 403 }) }

  // Achado de auditoria LGPD: sem esta checagem, um usuário com escopo PESSOAL
  // (restrito a certos condomínios) conseguia exportar nome+CPF+e-mail+telefone
  // de QUALQUER condomínio só trocando o id na URL.
  const acesso = await requireAcessoCondominio(id)
  if (!acesso.ok) return { erro: new NextResponse("Not Found", { status: 404 }) }

  const [condominio, proprietarios] = await Promise.all([
    getCondominioById(id).catch(() => null),
    getAllProprietarios(id).catch(() => [] as Proprietario[]),
  ])
  if (!condominio) return { erro: new NextResponse("Not found", { status: 404 }) }
  return { condominio, proprietarios }
}

// GET: exporta TODOS os proprietários do condomínio (comportamento de sempre).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await carregar(id)
  if ("erro" in r) return r.erro
  return gerarXlsxProprietarios(r.condominio.nome, r.proprietarios)
}

// POST: exporta só os proprietários enviados em `ids` (pedido do Carlos: a
// exportação tem que respeitar o filtro/busca da tela — a lista manda os ids
// que estão sendo exibidos). Sem `ids` válido, cai no comportamento do GET.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await carregar(id)
  if ("erro" in r) return r.erro

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : null
  const proprietarios = ids ? r.proprietarios.filter((p) => ids.includes(p.id)) : r.proprietarios
  return gerarXlsxProprietarios(r.condominio.nome, proprietarios)
}
