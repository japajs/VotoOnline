import React from "react"
import type { ReactElement } from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import type { DocumentProps } from "@react-pdf/renderer"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { getCondominioById } from "@/services/condominios"
import { getAllProprietarios } from "@/services/proprietarios"
import { CadastroPDF } from "@/lib/relatorios/pdf-cadastro"
import { safeFilename, formatDateTimeBR } from "@/lib/relatorios/utils"
import { APP_NAME } from "@/lib/constants"

// "Lista do cadastro" em PDF, por condomínio (pedido do Carlos): a relação do
// cadastro em ORDEM DE IMÓVEL. POST porque a tela manda os IDS do FILTRO ATIVO
// (Filtros ▾ + busca) no corpo — assim o PDF obedece o filtro e imprime o nome
// dele no cabeçalho ("8 relatórios numa opção só"). Mesmo nível de acesso dos
// outros relatórios: logado e não-visualizador, com acesso ao condomínio.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ condominioId: string }> }
) {
  const session = await getSession()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })
  if (session.perfil === "visualizador")
    return new NextResponse("Forbidden", { status: 403 })

  const { condominioId } = await params

  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return new NextResponse("Not Found", { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; filtroLabel?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : []
  const filtroLabel = typeof body.filtroLabel === "string" ? body.filtroLabel : undefined

  const [condominio, todos] = await Promise.all([
    getCondominioById(condominioId),
    getAllProprietarios(condominioId),
  ])

  if (!condominio) return new NextResponse("Not Found", { status: 404 })

  // Recorta aos ids do filtro ativo (a tela sempre manda a lista exibida). Sem
  // ids = PDF vazio (não "todos") — o filtro não casou com ninguém.
  const idSet = new Set(ids)
  const proprietarios = todos.filter((p) => idSet.has(p.id))

  const element = React.createElement(CadastroPDF, {
    condominio,
    proprietarios,
    emitidoPor: session.nome,
    emitidoEm: formatDateTimeBR(new Date().toISOString()),
    filtroLabel,
  }) as ReactElement<DocumentProps>

  const pdfBuffer = await renderToBuffer(element)

  const condo = safeFilename(condominio.nome)
  const filename = `${APP_NAME}_Cadastro_${condo}.pdf`

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
