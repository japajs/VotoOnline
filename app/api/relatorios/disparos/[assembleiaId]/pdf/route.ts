import React from "react"
import type { ReactElement } from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import type { DocumentProps } from "@react-pdf/renderer"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getHistoricoDisparos } from "@/services/relatorios"
import { DisparosPDF } from "@/lib/relatorios/pdf-disparos"
import { safeFilename, formatDateTimeBR } from "@/lib/relatorios/utils"
import { APP_NAME } from "@/lib/constants"

// Comprovante de disparos em PDF (pedido do Carlos: documento organizado pra
// provar os envios à síndica). Mesmo nível de acesso do relatório de apuração:
// logado e não-visualizador, com acesso ao condomínio — traz e-mails dos
// condôminos (PII), não pode vazar pro visualizador.
//
// Filtro por período opcional via query ?de=YYYY-MM-DD&ate=YYYY-MM-DD (pedido
// do Carlos: "solicitar a data antes de filtrar"). O dia é interpretado no fuso
// de Brasília (-03:00) — início do dia pra `de`, fim do dia pra `ate`.

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

function diaValido(v: string | null): string | null {
  return v && DIA_RE.test(v) ? v : null
}
function fmtDiaBR(dia: string): string {
  const [ano, mes, d] = dia.split("-")
  return `${d}/${mes}/${ano}`
}

export async function GET(
  req: Request,
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

  const url = new URL(req.url)
  const deDia = diaValido(url.searchParams.get("de"))
  const ateDia = diaValido(url.searchParams.get("ate"))
  const de = deDia ? `${deDia}T00:00:00.000-03:00` : null
  const ate = ateDia ? `${ateDia}T23:59:59.999-03:00` : null

  const periodoLabel =
    deDia && ateDia
      ? `${fmtDiaBR(deDia)} a ${fmtDiaBR(ateDia)}`
      : deDia
        ? `A partir de ${fmtDiaBR(deDia)}`
        : ateDia
          ? `Até ${fmtDiaBR(ateDia)}`
          : "Todos os disparos"

  const [condominio, disparos] = await Promise.all([
    getCondominioById(assembleia.condominio_id),
    getHistoricoDisparos(assembleiaId, { de, ate }),
  ])

  if (!condominio) return new NextResponse("Condomínio não encontrado", { status: 404 })

  const element = React.createElement(DisparosPDF, {
    assembleia,
    condominio,
    disparos,
    periodoLabel,
    emitidoPor: session.nome,
    emitidoEm: formatDateTimeBR(new Date().toISOString()),
  }) as ReactElement<DocumentProps>

  const pdfBuffer = await renderToBuffer(element)

  const condo = safeFilename(condominio.nome)
  const titulo = safeFilename(assembleia.titulo)
  const filename = `${APP_NAME}_Disparos_${condo}_${titulo}.pdf`

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
