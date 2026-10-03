import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { getCondominioById } from "@/services/condominios"
import { getAllProprietarios } from "@/services/proprietarios"
import { sanitizarLinhas } from "@/lib/relatorios/utils"
import { APP_NAME } from "@/lib/constants"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })
  if (session.perfil === "visualizador") return new NextResponse("Forbidden", { status: 403 })

  const { id } = await params

  // Achado de auditoria LGPD: sem esta checagem, um usuário com escopo
  // PESSOAL (restrito a certos condomínios) conseguia exportar nome+CPF+
  // e-mail+telefone de QUALQUER condomínio só trocando o id na URL — as
  // rotas irmãs de relatório já faziam essa checagem, esta não fazia.
  const acesso = await requireAcessoCondominio(id)
  if (!acesso.ok) return new NextResponse("Not Found", { status: 404 })

  const [condominio, proprietarios] = await Promise.all([
    getCondominioById(id).catch(() => null),
    getAllProprietarios(id).catch(() => []),
  ])

  if (!condominio) return new NextResponse("Not found", { status: 404 })

  // Monta as linhas: uma por unidade, com dados do proprietário repetidos
  const rows: string[][] = []

  for (const prop of proprietarios) {
    const unidades = prop.unidades ?? []
    if (unidades.length === 0) {
      rows.push([prop.nome, prop.email ?? "", prop.cpf ?? "", prop.telefone ?? "", "", ""])
    } else {
      for (const u of unidades) {
        rows.push([
          prop.nome,
          prop.email ?? "",
          prop.cpf ?? "",
          prop.telefone ?? "",
          u.numero,
          u.bloco ?? "",
        ])
      }
    }
  }

  const header = ["Nome", "E-mail", "CPF", "Telefone / WhatsApp", "Unidade", "Bloco"]
  // Auditoria de segurança: escapa células que começam com = + - @ (nome/
  // e-mail/CPF vêm do cadastro e poderiam virar fórmula no Excel). Mesma
  // defesa já usada na apuração (ver lib/relatorios/utils.ts:sanitizarLinhas).
  const ws = XLSX.utils.aoa_to_sheet(sanitizarLinhas([header, ...rows]))

  // Larguras de coluna
  ws["!cols"] = [
    { wch: 36 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
  ]

  // Estilo do cabeçalho (negrito)
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = { font: { bold: true } }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Proprietários")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const filename = `${APP_NAME}_${condominio.nome.replace(/[^a-z0-9]/gi, "_")}_Proprietarios.xlsx`

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
