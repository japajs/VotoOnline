import * as XLSX from "xlsx"
import { APP_NAME, APP_VERSION } from "@/lib/constants"
import type { Assembleia, AssembleiaApuracao, Condominio } from "@/types"
import type { ParticipanteRelatorio, UnidadeRelatorio, VotoDetalhado } from "@/services/relatorios"
import {
  formatDateTimeBR,
  pctStr,
  sendStatusLabelPT,
  statusLabelPT,
} from "./utils"

export interface XlsxApuracaoData {
  assembleia: Assembleia
  condominio: Condominio
  apuracao: AssembleiaApuracao
  participantes: ParticipanteRelatorio[]
  unidades: UnidadeRelatorio[]
  votosDetalhados: VotoDetalhado[]
  emitidoPor: string
  emitidoEm: string
}

// Auditoria de segurança: previne Formula/CSV Injection — um texto vindo do
// cadastro (nome, e-mail, observações etc.) que comece com =, +, - ou @
// seria interpretado como fórmula ao abrir a planilha no Excel. Prefixa com
// apóstrofo para forçar leitura como texto literal, sem mudar o valor visto.
const PREFIXOS_FORMULA = new Set(["=", "+", "-", "@"])

function sanitizarCelula<T extends string | number>(valor: T): T {
  if (typeof valor === "string" && valor.length > 0 && PREFIXOS_FORMULA.has(valor[0]!)) {
    return (`'${valor}` as unknown) as T
  }
  return valor
}

function sanitizarLinhas<T extends (string | number)[]>(linhas: T[]): T[] {
  return linhas.map((linha) => linha.map((c) => sanitizarCelula(c)) as T)
}

function boldRow(ws: XLSX.WorkSheet, rowIdx: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c })
    const cell = ws[addr]
    if (cell) cell.s = { font: { bold: true } }
  }
}

export function gerarXlsxApuracao(data: XlsxApuracaoData): Buffer {
  const {
    assembleia,
    condominio,
    apuracao,
    participantes,
    unidades,
    votosDetalhados,
    emitidoPor,
    emitidoEm,
  } = data
  const wb = XLSX.utils.book_new()

  /* ── Tab 1: Resumo Geral ─────────────────────────────────────────────── */
  const taxaPart = pctStr(apuracao.total_respondidos, apuracao.total_enviados)

  const resumoRows: (string | number)[][] = [
    [`RELATÓRIO DE APURAÇÃO — ${APP_NAME} v${APP_VERSION}`],
    [],
    ["DADOS DO CONDOMÍNIO"],
    ["Condomínio", condominio.nome],
    ["Endereço", condominio.endereco ?? ""],
    ["Síndico", condominio.sindico_nome ?? ""],
    ["Contato síndico", condominio.sindico_contato ?? ""],
    [],
    ["DADOS DA ASSEMBLEIA"],
    ["Título", assembleia.titulo],
    ["Descrição", assembleia.descricao ?? ""],
    // Auditoria funcional: sem o aviso embutido, um arquivo gerado antes do
    // encerramento (rascunho/aberta) mostra números que parecem definitivos
    // — o status sozinho na célula ao lado é fácil de não notar.
    [
      "Status",
      assembleia.status !== "encerrada"
        ? `${statusLabelPT(assembleia.status)} — ⚠ RESULTADO PARCIAL, SUJEITO A ALTERAÇÃO`
        : statusLabelPT(assembleia.status),
    ],
    ["Abertura", formatDateTimeBR(assembleia.data_abertura)],
    ["Encerramento", formatDateTimeBR(assembleia.data_encerramento)],
    [],
    ["PARTICIPAÇÃO"],
    ["Convites enviados", apuracao.total_enviados],
    ["Responderam", apuracao.total_respondidos],
    ["Taxa de participação", taxaPart],
    [],
    // Auditoria de assembleias — Fase 1/2: quórum sobre o peso do
    // CONDOMÍNIO INTEIRO (todas as unidades), métrica diferente da
    // Participação acima (que é só sobre quem recebeu convite). Gate em
    // apuracao.percentual_quorum (quórum EFETIVO — já resolvido pra 1ª ou
    // 2ª convocação), nunca em assembleia.quorum_minimo direto: esse é
    // sempre o valor da 1ª convocação, mesmo quando a 2ª já está em vigor.
    ...(apuracao.percentual_quorum !== null
      ? ([
          [
            apuracao.convocacao_aplicada !== null
              ? `QUÓRUM MÍNIMO (${apuracao.convocacao_aplicada}ª CONVOCAÇÃO)`
              : "QUÓRUM MÍNIMO",
          ],
          ["Exigido", pctStr(apuracao.quorum_aplicavel ?? 0, 1)],
          ["Atingido", pctStr(apuracao.percentual_quorum, 1)],
          [
            "Resultado",
            apuracao.quorum_atingido ? "QUÓRUM ATINGIDO" : "QUÓRUM NÃO ATINGIDO",
          ],
          [],
        ] as (string | number)[][])
      : []),
    ["PAUTAS VOTADAS", assembleia.pautas?.length ?? 0],
    ...(assembleia.pautas ?? []).map((p, i) => [`Pauta ${i + 1}`, p.titulo]),
    [],
    ["Emitido em", emitidoEm],
    ["Emitido por", emitidoPor],
  ]

  const wsResumo = XLSX.utils.aoa_to_sheet(sanitizarLinhas(resumoRows))
  wsResumo["!cols"] = [{ wch: 26 }, { wch: 52 }]
  boldRow(wsResumo, 0, 2)
  boldRow(wsResumo, 2, 1)
  boldRow(wsResumo, 8, 1)
  boldRow(wsResumo, 15, 1)
  boldRow(wsResumo, 20, 2)
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo Geral")

  /* ── Tab 2: Resultados por Pauta (apenas pautas Sim/Não) ─────────────── */
  const pautasSimNao = apuracao.pautas.filter((p) => p.pauta.tipo !== "multipla_escolha")
  const pautasMultiplaEscolha = apuracao.pautas.filter((p) => p.pauta.tipo === "multipla_escolha")

  const resHeader = [
    "#",
    "Pauta",
    "SIM (part.)",
    "NÃO (part.)",
    "Abst. (part.)",
    "Total part.",
    "% SIM",
    "% NÃO",
    "% Abst.",
    "SIM (imóv.)",
    "NÃO (imóv.)",
    "Abst. (imóv.)",
    "Total imóv.",
    "% SIM (imóv.)",
    "% NÃO (imóv.)",
    "% Abst. (imóv.)",
    "Resultado (part.)",
    "Quórum exigido",
    "Resultado (ponderado)",
    "Incluída após abertura",
  ]

  // Item 8 do pedido de evolução: sinaliza no relatório quando uma pauta foi
  // adicionada depois que a assembleia já estava aberta. Não usa
  // assembleia.data_abertura (relógio da aplicação) contra pauta.created_at
  // (relógio do banco) — os dois podem divergir (confirmado em teste, ~73s
  // de diferença neste ambiente). Compara em vez disso cada pauta com a
  // mais antiga da própria assembleia: o lote original inteiro nasce no
  // mesmo INSERT (mesmo `now()` de transação), então só uma pauta
  // adicionada depois, numa chamada separada, tem created_at maior — sempre
  // a mesma fonte de relógio dos dois lados.
  const primeiraPautaCreatedAtMs = Math.min(
    ...apuracao.pautas.map((p) => new Date(p.pauta.created_at).getTime())
  )
  const foiIncluidaAposAbertura = (pautaCreatedAt: string): string =>
    new Date(pautaCreatedAt).getTime() > primeiraPautaCreatedAtMs ? "Sim" : "Não"

  const resRows = pautasSimNao.map((p, i) => {
    const tp = p.por_participantes.sim + p.por_participantes.nao + p.por_participantes.abstencao
    const tw = p.ponderado.sim + p.ponderado.nao + p.ponderado.abstencao
    const vP =
      tp === 0
        ? "SEM VOTOS"
        : p.por_participantes.sim > p.por_participantes.nao
          ? "SIM"
          : p.por_participantes.nao > p.por_participantes.sim
            ? "NÃO"
            : "EMPATE"
    // Auditoria de assembleias — Fase 1: `p.aprovada` já vem calculado do
    // servidor respeitando pauta.quorum_aprovacao (maioria simples, 2/3,
    // unanimidade etc.) — nunca mais ">50%" fixo aqui. Este é o documento
    // oficial de apuração, o lugar mais importante pra essa conta estar
    // certa.
    const vW = p.aprovada === null ? "SEM VOTOS" : p.aprovada ? "APROVADA" : "REJEITADA"

    return [
      i + 1,
      p.pauta.titulo,
      p.por_participantes.sim,
      p.por_participantes.nao,
      p.por_participantes.abstencao,
      tp,
      pctStr(p.por_participantes.sim, tp),
      pctStr(p.por_participantes.nao, tp),
      pctStr(p.por_participantes.abstencao, tp),
      p.ponderado.sim,
      p.ponderado.nao,
      p.ponderado.abstencao,
      tw,
      pctStr(p.ponderado.sim, tw),
      pctStr(p.ponderado.nao, tw),
      pctStr(p.ponderado.abstencao, tw),
      vP,
      pctStr(p.pauta.quorum_aprovacao, 1),
      vW,
      foiIncluidaAposAbertura(p.pauta.created_at),
    ]
  })

  const wsRes = XLSX.utils.aoa_to_sheet(sanitizarLinhas([resHeader, ...resRows]))
  wsRes["!cols"] = [
    { wch: 4 }, { wch: 40 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 18 },
  ]
  boldRow(wsRes, 0, resHeader.length)
  XLSX.utils.book_append_sheet(wb, wsRes, "Resultados por Pauta")

  /* ── Tab (opcional): Múltipla Escolha ─────────────────────────────────
     Só é adicionada quando existe ao menos uma pauta desse tipo — uma
     assembleia só com pautas Sim/Não gera o mesmo workbook de sempre. */
  if (pautasMultiplaEscolha.length > 0) {
    const meHeader = ["Pauta", "Opção", "Participantes", "% part.", "Imóveis (ponderado)", "% ponderado"]
    const meRows: (string | number)[][] = []

    pautasMultiplaEscolha.forEach((p) => {
      const opcoes = [...(p.opcoes_resultado ?? [])].sort((a, b) => b.ponderado - a.ponderado)
      const totalParticipantes =
        opcoes.reduce((sum, o) => sum + o.participantes, 0) + p.por_participantes.abstencao
      const totalPonderado = opcoes.reduce((sum, o) => sum + o.ponderado, 0) + p.ponderado.abstencao

      const marcaNova = foiIncluidaAposAbertura(p.pauta.created_at) === "Sim" ? " (incluída após abertura)" : ""
      meRows.push([`${p.pauta.titulo}${marcaNova}`])
      opcoes.forEach((o) => {
        meRows.push([
          "",
          o.label,
          o.participantes,
          pctStr(o.participantes, totalParticipantes),
          o.ponderado,
          pctStr(o.ponderado, totalPonderado),
        ])
      })
      if (p.ponderado.abstencao > 0) {
        meRows.push([
          "",
          "Abstenção",
          p.por_participantes.abstencao,
          pctStr(p.por_participantes.abstencao, totalParticipantes),
          p.ponderado.abstencao,
          pctStr(p.ponderado.abstencao, totalPonderado),
        ])
      }
      meRows.push([])
    })

    const wsMe = XLSX.utils.aoa_to_sheet(sanitizarLinhas([meHeader, ...meRows]))
    wsMe["!cols"] = [{ wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 12 }]
    boldRow(wsMe, 0, meHeader.length)
    XLSX.utils.book_append_sheet(wb, wsMe, "Múltipla Escolha")
  }

  /* ── Tab 3: Participantes ────────────────────────────────────────────── */
  const partHeader = ["Nome", "E-mail", "Telefone", "Status envio", "Respondeu?", "Enviado em"]
  const partRows = participantes.map((p) => [
    p.nome,
    p.email ?? "",
    p.telefone ?? "",
    sendStatusLabelPT(p.send_status),
    p.respondeu ? "Sim" : "Não",
    formatDateTimeBR(p.sent_at),
  ])

  const wsPart = XLSX.utils.aoa_to_sheet(sanitizarLinhas([partHeader, ...partRows]))
  wsPart["!cols"] = [
    { wch: 36 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
  ]
  boldRow(wsPart, 0, partHeader.length)
  XLSX.utils.book_append_sheet(wb, wsPart, "Participantes")

  /* ── Tab 4: Imóveis ──────────────────────────────────────────────────── */
  const unidHeader = ["Nº Imóvel", "Bloco", "Proprietário", "E-mail"]
  const unidRows = unidades.map((u) => [u.numero, u.bloco ?? "", u.proprietario, u.email ?? ""])

  const wsUnid = XLSX.utils.aoa_to_sheet(sanitizarLinhas([unidHeader, ...unidRows]))
  wsUnid["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 30 }]
  boldRow(wsUnid, 0, unidHeader.length)
  XLSX.utils.book_append_sheet(wb, wsUnid, "Imóveis")

  /* ── Tab 5: Detalhamento de Votos (Unidade/Nome/E-mail/Resposta) ──────
     Substitui o que seria uma coluna de Endereço IP — o IP continua só no
     banco, para auditoria técnica, nunca em relatório.

     Auditoria de assembleias — Fase 5: pautas marcadas sigiloso ficam de
     fora daqui — o vínculo nome↔voto nunca aparece no export pra elas, só
     o resultado agregado (já presente na aba "Resultados por Pauta"). */
  const tituloPorPauta = new Map(apuracao.pautas.map((p) => [p.pauta.id, p.pauta.titulo]))
  const pautasSigilosas = apuracao.pautas.filter((p) => p.pauta.sigiloso)
  const idsSigilosos = new Set(pautasSigilosas.map((p) => p.pauta.id))
  const detHeader = ["Pauta", "Imóvel(is)", "Nome", "E-mail", "Resposta"]
  const detRows = votosDetalhados
    .filter((v) => !idsSigilosos.has(v.pauta_id))
    .map((v) => [
      tituloPorPauta.get(v.pauta_id) ?? "—",
      v.unidades,
      v.nome,
      v.email ?? "",
      v.resposta,
    ])
  if (pautasSigilosas.length > 0) {
    detRows.push([])
    detRows.push([
      `Pauta(s) sigilosa(s) — detalhamento individual não disponível, ver resultado agregado na aba "Resultados por Pauta": ${pautasSigilosas.map((p) => p.pauta.titulo).join(", ")}`,
    ])
  }

  const wsDet = XLSX.utils.aoa_to_sheet(sanitizarLinhas([detHeader, ...detRows]))
  wsDet["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 32 }, { wch: 30 }, { wch: 20 }]
  boldRow(wsDet, 0, detHeader.length)
  XLSX.utils.book_append_sheet(wb, wsDet, "Detalhamento de Votos")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
