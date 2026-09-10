import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { APP_NAME, APP_VERSION } from "@/lib/constants"
import type { Assembleia, AssembleiaApuracao, Condominio } from "@/types"
import type { VotoDetalhado } from "@/services/relatorios"
import { formatDateTimeBR, pctStr, statusLabelPT } from "./utils"

export interface ApuracaoPDFProps {
  assembleia: Assembleia
  condominio: Condominio
  apuracao: AssembleiaApuracao
  votosDetalhados: VotoDetalhado[]
  emitidoPor: string
  emitidoEm: string
}

const C = {
  primary: "#4F46E5",
  primaryDark: "#3730A3",
  primaryLight: "#C7D2FE",
  tableHeader: "#F9FAFB",
  border: "#E5E7EB",
  text: "#111827",
  muted: "#6B7280",
  sim: "#15803D",
  nao: "#B91C1C",
  abstencao: "#B45309",
  white: "#FFFFFF",
  simBg: "#DCFCE7",
  naoBg: "#FEE2E2",
  abstBg: "#FEF3C7",
}

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.text,
    paddingHorizontal: 36,
    paddingTop: 52,
    paddingBottom: 48,
    lineHeight: 1.45,
  },
  /* ── fixed header ─────────────────────── */
  pageHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: C.primary,
    paddingHorizontal: 36,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phBrand: { color: C.white, fontSize: 11, fontFamily: "Helvetica-Bold" },
  phSub: { color: C.primaryLight, fontSize: 7 },
  phLabel: { color: C.primaryLight, fontSize: 7 },
  /* ── fixed footer ─────────────────────── */
  pageFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 36,
    paddingVertical: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 7, color: C.muted },
  /* ── typography ───────────────────────── */
  reportTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  reportCondo: { fontSize: 9, color: C.muted, marginBottom: 14 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 3,
  },
  /* ── info grid ────────────────────────── */
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  infoCell: { width: "50%", marginBottom: 8 },
  infoCell100: { width: "100%", marginBottom: 8 },
  infoLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted },
  infoVal: { fontSize: 9, color: C.text, marginTop: 1 },
  /* ── participation row ────────────────── */
  partRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    marginBottom: 14,
    overflow: "hidden",
  },
  partCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center" },
  partBorderR: { borderRightWidth: 1, borderRightColor: C.border },
  partNum: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  partLbl: { fontSize: 7, color: C.muted, marginTop: 2, textAlign: "center" },
  /* ── pauta block ──────────────────────── */
  pautaBlock: { marginBottom: 10 },
  pautaHeader: { flexDirection: "row", alignItems: "baseline", marginBottom: 3 },
  pautaIdx: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted, marginRight: 6 },
  pautaTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  pautaNovaBadge: {
    marginLeft: 6,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: C.abstencao,
    backgroundColor: C.abstBg,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  pautaDesc: { fontSize: 8, color: C.muted, marginBottom: 8, lineHeight: 1.5 },
  /* ── result tables ────────────────────── */
  tablePair: { flexDirection: "row", marginBottom: 6 },
  tableHalf: { flex: 1 },
  tableFull: { marginBottom: 10 },
  tableLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    marginBottom: 3,
  },
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 2,
  },
  tRowHeader: {
    flexDirection: "row",
    backgroundColor: C.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tRowLast: { flexDirection: "row" },
  tcWide: { flex: 2, paddingVertical: 5, paddingHorizontal: 7 },
  tcNarrow: { flex: 1, paddingVertical: 5, paddingHorizontal: 7, textAlign: "right" },
  thText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted },
  tdText: { fontSize: 8, color: C.text },
  tdSim: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.sim },
  tdNao: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.nao },
  tdAbst: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.abstencao },
  /* ── verdict ──────────────────────────── */
  verdict: {
    marginTop: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 3,
    alignItems: "center",
  },
  verdictText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white },
  verdictSub: { fontSize: 7, color: C.white, marginTop: 1, opacity: 0.85 },
  /* ── divider ──────────────────────────── */
  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 12 },
  /* ── aviso de resultado parcial ───────── */
  avisoParcial: {
    backgroundColor: C.abstBg,
    borderWidth: 1,
    borderColor: C.abstencao,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  avisoParcialText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.abstencao },
  /* ── detalhamento de votos (por unidade) ── */
  detLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    marginTop: 4,
    marginBottom: 3,
  },
  detTable: { borderWidth: 1, borderColor: C.border, borderRadius: 2 },
  detRowHeader: {
    flexDirection: "row",
    backgroundColor: C.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  detRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  detCellUnidade: { width: "16%", paddingVertical: 4, paddingHorizontal: 6 },
  detCellNome: { width: "30%", paddingVertical: 4, paddingHorizontal: 6 },
  detCellEmail: { width: "34%", paddingVertical: 4, paddingHorizontal: 6 },
  detCellResposta: { width: "20%", paddingVertical: 4, paddingHorizontal: 6 },
  detThText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted },
  detTdText: { fontSize: 7, color: C.text },
})

function verdictColor(v: string): string {
  if (v === "SIM" || v === "APROVADA") return C.sim
  if (v === "NÃO" || v === "REJEITADA") return C.nao
  if (v === "EMPATE") return C.muted
  return C.muted
}

function calcVerdict(sim: number, nao: number, total: number): string {
  if (total === 0) return "SEM VOTOS"
  if (sim > nao) return "SIM"
  if (nao > sim) return "NÃO"
  return "EMPATE"
}

// Auditoria de assembleias — Fase 1: aprovação ponderada respeita
// pauta.quorum_aprovacao (maioria simples, 2/3, unanimidade etc.) — nunca
// mais ">50%" fixo. Este PDF é o documento oficial de apuração (a ata),
// então é o lugar mais importante pra essa conta estar certa.
function verdictAprovacao(aprovada: boolean | null): string {
  if (aprovada === null) return "SEM VOTOS"
  return aprovada ? "APROVADA" : "REJEITADA"
}

const CORES_OPCOES = ["#4F46E5", "#0EA5E9", "#15803D", "#D946EF", "#EA580C", "#0D9488"]

// Um bloco de resultado Sim/Não (usado duas vezes por pauta: "por
// participantes" e "ponderado por unidades"). `full` decide se ele ocupa a
// largura toda com fontes maiores (assembleia de 1 pauta só, sem o espaço em
// branco de sempre) ou a metade, compacto (2+ pautas, como já era).
function BlocoResultadoSimNao({
  titulo,
  colUnidade,
  sim,
  nao,
  abstencao,
  total,
  verdict,
  verdictSub,
  full,
}: {
  titulo: string
  colUnidade: string
  sim: number
  nao: number
  abstencao: number
  total: number
  verdict: string
  verdictSub?: string
  full: boolean
}) {
  const wide = full ? { ...s.tcWide, paddingVertical: 8, paddingHorizontal: 10 } : s.tcWide
  const narrow = full ? { ...s.tcNarrow, paddingVertical: 8, paddingHorizontal: 10 } : s.tcNarrow
  const thText = full ? { ...s.thText, fontSize: 8 } : s.thText
  const tdText = full ? { ...s.tdText, fontSize: 10 } : s.tdText
  const tdSim = full ? { ...s.tdSim, fontSize: 10 } : s.tdSim
  const tdNao = full ? { ...s.tdNao, fontSize: 10 } : s.tdNao
  const tdAbst = full ? { ...s.tdAbst, fontSize: 10 } : s.tdAbst

  return (
    <View>
      <Text style={full ? { ...s.tableLabel, fontSize: 8 } : s.tableLabel}>{titulo}</Text>
      <View style={s.table}>
        <View style={s.tRowHeader}>
          <View style={wide}>
            <Text style={thText}>RESPOSTA</Text>
          </View>
          <View style={narrow}>
            <Text style={thText}>{colUnidade}</Text>
          </View>
          <View style={narrow}>
            <Text style={thText}>%</Text>
          </View>
        </View>
        <View style={s.tRow}>
          <View style={wide}>
            <Text style={tdSim}>SIM</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{sim}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{pctStr(sim, total)}</Text>
          </View>
        </View>
        <View style={s.tRow}>
          <View style={wide}>
            <Text style={tdNao}>NÃO</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{nao}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{pctStr(nao, total)}</Text>
          </View>
        </View>
        <View style={s.tRowLast}>
          <View style={wide}>
            <Text style={tdAbst}>ABSTENÇÃO</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{abstencao}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{pctStr(abstencao, total)}</Text>
          </View>
        </View>
      </View>
      <View
        style={[s.verdict, { backgroundColor: verdictColor(verdict) }, full ? { paddingVertical: 8 } : {}]}
      >
        <Text style={full ? { ...s.verdictText, fontSize: 11 } : s.verdictText}>{verdict}</Text>
        {verdictSub ? <Text style={s.verdictSub}>{verdictSub}</Text> : null}
      </View>
    </View>
  )
}

function PautaMultiplaEscolha({
  item,
  full,
}: {
  item: AssembleiaApuracao["pautas"][number]
  full: boolean
}) {
  const { ponderado, por_participantes, opcoes_resultado = [] } = item
  const opcoes = [...opcoes_resultado].sort((a, b) => b.ponderado - a.ponderado)
  const tw = opcoes.reduce((sum, o) => sum + o.ponderado, 0) + ponderado.abstencao
  const tp = opcoes.reduce((sum, o) => sum + o.participantes, 0) + por_participantes.abstencao
  const vencedora = tw > 0 && opcoes.length > 0 ? opcoes[0] : null

  const wide = full ? { ...s.tcWide, paddingVertical: 8, paddingHorizontal: 10 } : s.tcWide
  const narrow = full ? { ...s.tcNarrow, paddingVertical: 8, paddingHorizontal: 10 } : s.tcNarrow
  const thText = full ? { ...s.thText, fontSize: 8 } : s.thText
  const tdText = full ? { ...s.tdText, fontSize: 10 } : s.tdText
  const tdAbst = full ? { ...s.tdAbst, fontSize: 10 } : s.tdAbst

  return (
    <View style={s.table}>
      <View style={s.tRowHeader}>
        <View style={wide}>
          <Text style={thText}>OPÇÃO</Text>
        </View>
        <View style={narrow}>
          <Text style={thText}>PARTIC.</Text>
        </View>
        <View style={narrow}>
          <Text style={thText}>UNID.</Text>
        </View>
        <View style={narrow}>
          <Text style={thText}>%</Text>
        </View>
      </View>
      {opcoes.map((o, i) => (
        <View key={o.opcao_id} style={i === opcoes.length - 1 && ponderado.abstencao === 0 ? s.tRowLast : s.tRow}>
          <View style={wide}>
            <Text style={{ ...tdText, color: CORES_OPCOES[i % CORES_OPCOES.length], fontFamily: "Helvetica-Bold" }}>
              {o.label}
            </Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{o.participantes}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{o.ponderado}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{pctStr(o.ponderado, tw)}</Text>
          </View>
        </View>
      ))}
      {ponderado.abstencao > 0 && (
        <View style={s.tRowLast}>
          <View style={wide}>
            <Text style={tdAbst}>ABSTENÇÃO</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{por_participantes.abstencao}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{ponderado.abstencao}</Text>
          </View>
          <View style={narrow}>
            <Text style={tdText}>{pctStr(ponderado.abstencao, tw)}</Text>
          </View>
        </View>
      )}
      {vencedora ? (
        <View style={[s.verdict, { backgroundColor: CORES_OPCOES[opcoes.indexOf(vencedora) % CORES_OPCOES.length] }, full ? { paddingVertical: 8 } : {}]}>
          <Text style={full ? { ...s.verdictText, fontSize: 11 } : s.verdictText}>{vencedora.label.toUpperCase()}</Text>
          <Text style={s.verdictSub}>
            {vencedora.ponderado} unid. · {tp} participante{tp === 1 ? "" : "s"}
          </Text>
        </View>
      ) : (
        <View style={[s.verdict, { backgroundColor: C.muted }]}>
          <Text style={s.verdictText}>SEM VOTOS</Text>
        </View>
      )}
    </View>
  )
}

// Tabela de detalhamento por unidade — Unidade / Nome / E-mail / Resposta.
// Substitui o que antes seria um endereço IP por e-mail (o IP continua só no
// banco, para auditoria técnica — nunca aparece aqui). Fica FORA do bloco
// `wrap={false}` da pauta, de propósito: pode ter dezenas de linhas e
// precisa poder quebrar entre páginas livremente, diferente do resumo
// (pequeno, sempre cabe, por isso esse sim fica atômico).
// Auditoria de assembleias — Fase 5: pauta sigilosa não mostra o
// detalhamento nominal — só uma nota, o resultado agregado já está no
// resumo acima (POR PARTICIPANTES / PONDERADO).
function DetalhamentoVotos({ votos, sigiloso }: { votos: VotoDetalhado[]; sigiloso: boolean }) {
  if (sigiloso) {
    return (
      <View>
        <Text style={s.detLabel}>DETALHAMENTO DOS VOTOS</Text>
        <Text style={s.tdText}>
          Pauta sigilosa — detalhamento individual não disponível. Ver resultado agregado acima.
        </Text>
      </View>
    )
  }
  if (votos.length === 0) return null
  return (
    <View>
      <Text style={s.detLabel}>DETALHAMENTO DOS VOTOS</Text>
      <View style={s.detTable}>
        <View style={s.detRowHeader} fixed>
          <View style={s.detCellUnidade}>
            <Text style={s.detThText}>UNIDADE</Text>
          </View>
          <View style={s.detCellNome}>
            <Text style={s.detThText}>NOME</Text>
          </View>
          <View style={s.detCellEmail}>
            <Text style={s.detThText}>E-MAIL</Text>
          </View>
          <View style={s.detCellResposta}>
            <Text style={s.detThText}>RESPOSTA</Text>
          </View>
        </View>
        {votos.map((v, i) => (
          <View key={i} style={s.detRow}>
            <View style={s.detCellUnidade}>
              <Text style={s.detTdText}>{v.unidades}</Text>
            </View>
            <View style={s.detCellNome}>
              <Text style={s.detTdText}>{v.nome}</Text>
            </View>
            <View style={s.detCellEmail}>
              <Text style={s.detTdText}>{v.email ?? "—"}</Text>
            </View>
            <View style={s.detCellResposta}>
              <Text style={s.detTdText}>{v.resposta}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

export function ApuracaoPDF({
  assembleia,
  condominio,
  apuracao,
  votosDetalhados,
  emitidoPor,
  emitidoEm,
}: ApuracaoPDFProps) {
  const { total_enviados, total_respondidos } = apuracao

  // Layout inteligente (item 1 do pedido): com só 1 pauta, a página sobrava
  // muito espaço em branco — tabelas full-width com fonte maior em vez do
  // par lado a lado compacto (pensado originalmente para caber várias
  // pautas). Com 2+ pautas, mantém o layout compacto de sempre.
  const layoutExpandido = apuracao.pautas.length === 1

  // "Incluída após a abertura" (evolução do fluxo): comparar contra
  // assembleia.data_abertura pareceria natural, mas esse campo é gravado
  // pelo relógio da aplicação (JS), enquanto pauta.created_at vem do
  // relógio do banco — os dois podem divergir (confirmado em teste: ~73s de
  // diferença neste ambiente). Em vez disso, compara cada pauta com a mais
  // antiga da própria assembleia: todas as pautas do lote original nascem
  // no mesmo INSERT (mesmo `now()` de transação), então só uma pauta
  // adicionada depois — via ação separada — tem created_at estritamente
  // maior. Mesma fonte de relógio dos dois lados, sem risco de descompasso.
  const primeiraPautaCreatedAtMs = Math.min(
    ...apuracao.pautas.map((p) => new Date(p.pauta.created_at).getTime())
  )
  const pautaIncluidaDepois = (pautaCreatedAt: string) =>
    new Date(pautaCreatedAt).getTime() > primeiraPautaCreatedAtMs

  return (
    <Document
      title={`Apuracao - ${assembleia.titulo}`}
      author={APP_NAME}
      creator={`${APP_NAME} v${APP_VERSION}`}
    >
      <Page size="A4" style={s.page}>
        {/* ── Fixed header ──────────────────── */}
        <View style={s.pageHeader} fixed>
          <View>
            <Text style={s.phBrand}>{APP_NAME}</Text>
            <Text style={s.phSub}>Sistema de Assembleias Eletrônicas para Condomínios</Text>
          </View>
          <Text style={s.phLabel}>RELATÓRIO DE APURAÇÃO</Text>
        </View>

        {/* ── Report title ──────────────────── */}
        <Text style={s.reportTitle}>{assembleia.titulo}</Text>
        <Text style={s.reportCondo}>{condominio.nome}</Text>

        {/* Auditoria funcional: sem isso, um PDF gerado antes do
            encerramento parecia um resultado final — o status só aparecia
            discreto entre outros campos, fácil de passar despercebido num
            documento que pode circular como se fosse definitivo. */}
        {assembleia.status !== "encerrada" ? (
          <View style={s.avisoParcial}>
            <Text style={s.avisoParcialText}>
              ⚠ RESULTADO PARCIAL — VOTAÇÃO{" "}
              {assembleia.status === "aberta"
                ? "EM ANDAMENTO"
                : assembleia.status === "pausada"
                  ? "PAUSADA"
                  : "AINDA NÃO INICIADA"}
              , SUJEITO A ALTERAÇÃO
            </Text>
          </View>
        ) : null}

        {/* ── Assembly info ─────────────────── */}
        <Text style={s.sectionLabel}>INFORMAÇÕES DA ASSEMBLEIA</Text>
        <View style={s.infoGrid}>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>CONDOMÍNIO</Text>
            <Text style={s.infoVal}>{condominio.nome}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>STATUS</Text>
            <Text style={s.infoVal}>{statusLabelPT(assembleia.status)}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>ABERTURA</Text>
            <Text style={s.infoVal}>{formatDateTimeBR(assembleia.data_abertura)}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>ENCERRAMENTO</Text>
            <Text style={s.infoVal}>{formatDateTimeBR(assembleia.data_encerramento)}</Text>
          </View>
          {assembleia.descricao ? (
            <View style={s.infoCell100}>
              <Text style={s.infoLbl}>DESCRIÇÃO</Text>
              <Text style={s.infoVal}>{assembleia.descricao}</Text>
            </View>
          ) : null}
          {condominio.sindico_nome ? (
            <View style={s.infoCell}>
              <Text style={s.infoLbl}>SÍNDICO</Text>
              <Text style={s.infoVal}>{condominio.sindico_nome}</Text>
            </View>
          ) : null}
          {condominio.endereco ? (
            <View style={s.infoCell}>
              <Text style={s.infoLbl}>ENDEREÇO</Text>
              <Text style={s.infoVal}>{condominio.endereco}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Participation ─────────────────── */}
        <Text style={s.sectionLabel}>PARTICIPAÇÃO GERAL</Text>
        <View style={s.partRow}>
          <View style={[s.partCell, s.partBorderR]}>
            <Text style={s.partNum}>{total_enviados}</Text>
            <Text style={s.partLbl}>Convites enviados</Text>
          </View>
          <View style={[s.partCell, s.partBorderR]}>
            <Text style={s.partNum}>{total_respondidos}</Text>
            <Text style={s.partLbl}>Responderam</Text>
          </View>
          <View style={s.partCell}>
            <Text style={s.partNum}>{pctStr(total_respondidos, total_enviados)}</Text>
            <Text style={s.partLbl}>Taxa de participação</Text>
          </View>
        </View>

        {/* Auditoria de assembleias — Fase 1/2: quórum sobre o peso do
            CONDOMÍNIO INTEIRO (todas as unidades), diferente da
            Participação acima (que é só sobre quem recebeu convite). Gate
            em apuracao.percentual_quorum (quórum EFETIVO, já resolvido pra
            1ª ou 2ª convocação) — nunca assembleia.quorum_minimo direto,
            que é sempre o valor da 1ª mesmo com a 2ª em vigor. */}
        {apuracao.percentual_quorum !== null ? (
          <>
            <Text style={s.sectionLabel}>
              {apuracao.convocacao_aplicada !== null
                ? `QUÓRUM MÍNIMO (${apuracao.convocacao_aplicada}ª CONVOCAÇÃO)`
                : "QUÓRUM MÍNIMO"}
            </Text>
            <View style={s.partRow}>
              <View style={[s.partCell, s.partBorderR]}>
                <Text style={s.partNum}>{pctStr(apuracao.quorum_aplicavel ?? 0, 1)}</Text>
                <Text style={s.partLbl}>Exigido</Text>
              </View>
              <View style={[s.partCell, s.partBorderR]}>
                <Text style={s.partNum}>{pctStr(apuracao.percentual_quorum, 1)}</Text>
                <Text style={s.partLbl}>Atingido</Text>
              </View>
              <View style={s.partCell}>
                <Text style={[s.partNum, { color: apuracao.quorum_atingido ? C.sim : C.nao }]}>
                  {apuracao.quorum_atingido ? "SIM" : "NÃO"}
                </Text>
                <Text style={s.partLbl}>Quórum atingido?</Text>
              </View>
            </View>
          </>
        ) : null}

        {/* ── Pautas ────────────────────────── */}
        <Text style={s.sectionLabel}>RESULTADOS POR PAUTA</Text>

        {apuracao.pautas.map((item, i) => {
          const { pauta, por_participantes, ponderado, total_apartamentos_representados } = item
          const tp =
            por_participantes.sim + por_participantes.nao + por_participantes.abstencao
          const tw = ponderado.sim + ponderado.nao + ponderado.abstencao
          const vP = calcVerdict(por_participantes.sim, por_participantes.nao, tp)
          const vW = verdictAprovacao(item.aprovada)
          const votosPauta = votosDetalhados.filter((v) => v.pauta_id === pauta.id)

          return (
            <View key={pauta.id}>
              {/* Com 1 pauta só (layoutExpandido), o bloco fica grande demais
                  (fontes maiores, largura cheia) para garantir wrap={false}
                  sem risco de sobrar página em branco quando ele não cabe no
                  restante da página atual — nesse caso deixamos fluir
                  normalmente. Com 2+ pautas o bloco compacto de sempre
                  permanece atômico, evitando que o resumo de UMA pauta
                  quebre no meio entre páginas. */}
              <View style={s.pautaBlock} wrap={layoutExpandido}>
                <View style={s.pautaHeader}>
                  <Text style={s.pautaIdx}>PAUTA {i + 1}</Text>
                  <Text style={s.pautaTitle}>{pauta.titulo}</Text>
                  {pautaIncluidaDepois(pauta.created_at) ? (
                    <Text style={s.pautaNovaBadge}>INCLUÍDA APÓS A ABERTURA</Text>
                  ) : null}
                </View>
                {pauta.descricao ? (
                  <Text style={s.pautaDesc}>{pauta.descricao}</Text>
                ) : null}

                {pauta.tipo === "multipla_escolha" ? (
                  <PautaMultiplaEscolha item={item} full={layoutExpandido} />
                ) : layoutExpandido ? (
                  <View style={s.tableFull}>
                    <BlocoResultadoSimNao
                      titulo="POR PARTICIPANTES"
                      colUnidade="QTD"
                      sim={por_participantes.sim}
                      nao={por_participantes.nao}
                      abstencao={por_participantes.abstencao}
                      total={tp}
                      verdict={vP}
                      full
                    />
                    <View style={{ marginTop: 10 }}>
                      <BlocoResultadoSimNao
                        titulo="PONDERADO POR UNIDADES"
                        colUnidade="APTS"
                        sim={ponderado.sim}
                        nao={ponderado.nao}
                        abstencao={ponderado.abstencao}
                        total={tw}
                        verdict={vW}
                        verdictSub={
                          total_apartamentos_representados > 0
                            ? `${total_apartamentos_representados} apt(s) representado(s) · quórum exigido: ${Math.round(pauta.quorum_aprovacao * 100)}%`
                            : `quórum exigido: ${Math.round(pauta.quorum_aprovacao * 100)}%`
                        }
                        full
                      />
                    </View>
                  </View>
                ) : (
                  <View style={s.tablePair}>
                    <View style={[s.tableHalf, { marginRight: 6 }]}>
                      <BlocoResultadoSimNao
                        titulo="POR PARTICIPANTES"
                        colUnidade="QTD"
                        sim={por_participantes.sim}
                        nao={por_participantes.nao}
                        abstencao={por_participantes.abstencao}
                        total={tp}
                        verdict={vP}
                        full={false}
                      />
                    </View>
                    <View style={[s.tableHalf, { marginLeft: 6 }]}>
                      <BlocoResultadoSimNao
                        titulo="PONDERADO POR UNIDADES"
                        colUnidade="APTS"
                        sim={ponderado.sim}
                        nao={ponderado.nao}
                        abstencao={ponderado.abstencao}
                        total={tw}
                        verdict={vW}
                        verdictSub={
                          total_apartamentos_representados > 0
                            ? `${total_apartamentos_representados} apt(s) representado(s) · quórum exigido: ${Math.round(pauta.quorum_aprovacao * 100)}%`
                            : `quórum exigido: ${Math.round(pauta.quorum_aprovacao * 100)}%`
                        }
                        full={false}
                      />
                    </View>
                  </View>
                )}
              </View>

              <View style={{ marginBottom: 16 }}>
                <DetalhamentoVotos votos={votosPauta} sigiloso={pauta.sigiloso} />
              </View>

              {i < apuracao.pautas.length - 1 ? <View style={s.divider} /> : null}
            </View>
          )
        })}

        {/* ── Fixed footer ──────────────────── */}
        <View style={s.pageFooter} fixed>
          <Text style={s.footerText}>
            Emitido em {emitidoEm} por {emitidoPor} | {APP_NAME} v{APP_VERSION}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
