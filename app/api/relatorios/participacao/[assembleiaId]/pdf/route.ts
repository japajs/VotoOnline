import React from "react"
import type { ReactElement } from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import type { DocumentProps } from "@react-pdf/renderer"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getExtratoParticipacao } from "@/services/relatorios"
import { ParticipacaoPDF } from "@/lib/relatorios/pdf-participacao"
import { safeFilename, formatDateTimeBR } from "@/lib/relatorios/utils"
import { APP_NAME } from "@/lib/constants"

// Extrato de participação em PDF (pedido do Carlos: um "extrato da apuração"
// baixável, com data e hora do voto por imóvel — pra apresentar/auditar). Mesmo
// nível de acesso dos outros relatórios: logado e não-visualizador, com acesso
// ao condomínio (traz nomes e participação dos condôminos).

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ assembleiaId: string }> }
) {
  const session = await getSession()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })
  if (session.perfil === "visualizador")
    return new NextResponse("Forbidden", { status: 403 })

  const { assembleiaId } = await params

  const assembleia = await getAssembleiaById(assembleiaId)
  if (!assembleia) return new NextResponse("Not Found", { status: 404 })

  const acesso = await requireAcessoCondominio(assembleia.condominio_id)
  if (!acesso.ok) return new NextResponse("Not Found", { status: 404 })

  const totalPautas = assembleia.pautas?.length ?? 0

  const [condominio, extrato] = await Promise.all([
    getCondominioById(assembleia.condominio_id),
    getExtratoParticipacao(assembleiaId, totalPautas),
  ])

  if (!condominio) return new NextResponse("Condomínio não encontrado", { status: 404 })

  const element = React.createElement(ParticipacaoPDF, {
    assembleia,
    condominio,
    extrato,
    emitidoPor: session.nome,
    emitidoEm: formatDateTimeBR(new Date().toISOString()),
  }) as ReactElement<DocumentProps>

  const pdfBuffer = await renderToBuffer(element)

  const condo = safeFilename(condominio.nome)
  const titulo = safeFilename(assembleia.titulo)
  const filename = `${APP_NAME}_Participacao_${condo}_${titulo}.pdf`

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
