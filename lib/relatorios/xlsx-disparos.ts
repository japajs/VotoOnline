import * as XLSX from "xlsx"
import { APP_NAME, APP_VERSION } from "@/lib/constants"
import type { Assembleia, Condominio } from "@/types"
import type { DisparoHistorico } from "@/services/relatorios"
import { formatDateTimeBR, sanitizarLinhas, statusLabelPT } from "./utils"

// Comprovante de disparos de e-mail (pedido do Carlos: a síndica duvidava que os
// e-mails estavam sendo disparados — precisa de um documento pra PROVAR que foi
// enviado, no estilo da pasta "Enviados"). Lista um registro por imóvel/pessoa
// com data e status de entrega. IMPORTANTE: a data/hora é a do ÚLTIMO disparo a
// cada pessoa (assembleia_sends é um upsert por proprietário) — não é o histórico
// de cada remessa; a trilha remessa-a-remessa fica no painel do provedor (Resend).

export interface XlsxDisparosData {
  assembleia: Assembleia
  condominio: Condominio
  disparos: DisparoHistorico[]
  emitidoPor: string
  emitidoEm: string
}

// Mesmo critério de gravidade da tela (spam > bounce > entregue > falhou > enviado).
function statusDisparo(d: DisparoHistorico): string {
  if (d.spamEm) return "Caiu em spam"
  if (d.bounceEm) return "Bounce (não chegou)"
  if (d.entregueEm) return "Entregue"
  if (d.status === "failed") return "Falhou no envio"
  return "Enviado"
}

function boldRow(ws: XLSX.WorkSheet, rowIdx: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIdx, c })]
    if (cell) cell.s = { font: { bold: true } }
  }
}

export function gerarXlsxDisparos(data: XlsxDisparosData): Buffer {
  const { assembleia, condominio, disparos, emitidoPor, emitidoEm } = data
  const wb = XLSX.utils.book_new()

  const nEnviados = disparos.filter((d) => d.status === "sent").length
  const nFalhas = disparos.filter((d) => d.status === "failed").length
  const nEntregues = disparos.filter((d) => d.entregueEm).length
  const nBounce = disparos.filter((d) => d.bounceEm).length
  const nSpam = disparos.filter((d) => d.spamEm).length

  const cabecalho: (string | number)[][] = [
    [`COMPROVANTE DE DISPAROS DE E-MAIL — ${APP_NAME} v${APP_VERSION}`],
    [],
    ["Condomínio", condominio.nome],
    ["Assembleia", assembleia.titulo],
    ["Status da assembleia", statusLabelPT(assembleia.status)],
    ["Emitido em", emitidoEm],
    ["Emitido por", emitidoPor],
    [],
    ["RESUMO"],
    ["Imóveis com disparo (tentativas de envio)", disparos.length],
    ["Enviados", nEnviados],
    ["Entregues (confirmado pelo provedor)", nEntregues],
    ["Bounce — não chegou (e-mail errado/inexistente)", nBounce],
    ["Marcados como spam", nSpam],
    ["Falharam no envio", nFalhas],
    [],
    [
      "Observação",
      "A confirmação de entrega (Entregue/Bounce/Spam) é retornada pelo provedor de e-mail. A data/hora é a do ÚLTIMO disparo a cada imóvel. Para o histórico de cada remessa (data a data), consulte o painel do provedor.",
    ],
    [],
  ]

  const tblHeader = [
    "Imóvel",
    "Nome",
    "E-mail",
    "Status",
    "Enviado em",
    "Entregue em",
    "Bounce em",
    "Spam em",
  ]
  const tblRows = disparos.map((d) => [
    d.unidades,
    d.nome,
    d.email ?? "",
    statusDisparo(d),
    formatDateTimeBR(d.sentAt),
    formatDateTimeBR(d.entregueEm),
    formatDateTimeBR(d.bounceEm),
    formatDateTimeBR(d.spamEm),
  ])

  const ws = XLSX.utils.aoa_to_sheet(sanitizarLinhas([...cabecalho, tblHeader, ...tblRows]))
  ws["!cols"] = [
    { wch: 14 },
    { wch: 34 },
    { wch: 32 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ]
  boldRow(ws, 0, 1) // título
  boldRow(ws, 8, 1) // "RESUMO"
  boldRow(ws, cabecalho.length, tblHeader.length) // cabeçalho da tabela
  XLSX.utils.book_append_sheet(wb, ws, "Disparos")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
