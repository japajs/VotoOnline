import { NextResponse } from "next/server"
import { getSession, requireAcessoCondominio } from "@/lib/auth"
import { getAssembleiaById } from "@/services/assembleias"
import { getCondominioById } from "@/services/condominios"
import { getHistoricoDisparos } from "@/services/relatorios"
import { gerarXlsxDisparos } from "@/lib/relatorios/xlsx-disparos"
import { safeFilename, formatDateTimeBR } from "@/lib/relatorios/utils"
import { APP_NAME } from "@/lib/constants"

// Comprovante de disparos em XLSX (pedido do Carlos: documentar os envios pra
// provar à síndica que os e-mails foram disparados). Mesmo nível de acesso do
// relatório de apuração: logado e não-visualizador, com acesso ao condomínio —
// a planilha traz e-mails dos condôminos (PII), não pode vazar pro visualizador.
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

  const [condominio, disparos] = await Promise.all([
    getCondominioById(assembleia.condominio_id),
    getHistoricoDisparos(assembleiaId),
  ])

  if (!condominio) return new NextResponse("Condomínio não encontrado", { status: 404 })

  const buffer = gerarXlsxDisparos({
    assembleia,
    condominio,
    disparos,
    emitidoPor: session.nome,
    emitidoEm: formatDateTimeBR(new Date().toISOString()),
  })

  const condo = safeFilename(condominio.nome)
  const titulo = safeFilename(assembleia.titulo)
  const filename = `${APP_NAME}_Disparos_${condo}_${titulo}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
