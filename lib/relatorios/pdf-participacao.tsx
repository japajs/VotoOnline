import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { APP_NAME, APP_VERSION, APP_AUTORIA } from "@/lib/constants"
import type { Assembleia, Condominio } from "@/types"
import type {
  ExtratoParticipacao,
  ExtratoParticipacaoLinha,
  ParticipacaoStatus,
} from "@/services/relatorios"
import { formatDateTimeBR, statusLabelPT } from "./utils"

// Extrato de participação em PDF (pedido do Carlos: um "extrato da apuração"
// baixável, que TRAZ a data e hora do voto por imóvel — ótimo pra auditar). É a
// versão imprimível da tabela "Participação (controle interno)" da tela, com um
// cabeçalho de contadores POR IMÓVEL (Imóveis, Presentes, Votou geral, Votou
// parcial, Não votou).

export interface ParticipacaoPDFProps {
  assembleia: Assembleia
  condominio: Condominio
  extrato: ExtratoParticipacao
  emitidoPor: string
  emitidoEm: string
}

const C = {
  primary: "#4F46E5",
  primaryLight: "#C7D2FE",
  tableHeader: "#F9FAFB",
  border: "#E5E7EB",
  text: "#111827",
  muted: "#6B7280",
  white: "#FFFFFF",
  geral: "#15803D",
  parcial: "#B45309",
  pendente: "#6B7280",
  presente: "#4F46E5",
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
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  infoCell: { width: "50%", marginBottom: 8 },
  infoLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted },
  infoVal: { fontSize: 9, color: C.text, marginTop: 1 },
  /* resumo por imóvel */
  partRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    marginBottom: 6,
    overflow: "hidden",
  },
  partCell: { width: "20%", paddingVertical: 10, paddingHorizontal: 6, alignItems: "center" },
  partBorderR: { borderRightWidth: 1, borderRightColor: C.border },
  partNum: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  partLbl: { fontSize: 6.5, color: C.muted, marginTop: 2, textAlign: "center" },
  nota: { fontSize: 6.5, color: C.muted, marginBottom: 10 },
  /* tabela */
  table: { borderWidth: 1, borderColor: C.border, borderRadius: 2 },
  tRowHeader: {
    flexDirection: "row",
    backgroundColor: C.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  cImovel: { width: "16%", paddingVertical: 4, paddingHorizontal: 6 },
  cNome: { width: "34%", paddingVertical: 4, paddingHorizontal: 6 },
  cPautas: { width: "14%", paddingVertical: 4, paddingHorizontal: 6, textAlign: "center" },
  cStatus: { width: "18%", paddingVertical: 4, paddingHorizontal: 6 },
  cData: { width: "18%", paddingVertical: 4, paddingHorizontal: 6 },
  thText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted },
  tdText: { fontSize: 7, color: C.text },
  tdMuted: { fontSize: 6.5, color: C.muted },
  tdStatus: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  vazio: { fontSize: 9, color: C.muted, paddingVertical: 20, textAlign: "center" },
})

const STATUS_LABEL: Record<ParticipacaoStatus, string> = {
  completo: "Votou geral",
  parcial: "Votou parcial",
  pendente: "Não votou",
}
const STATUS_COLOR: Record<ParticipacaoStatus, string> = {
  completo: C.geral,
  parcial: C.parcial,
  pendente: C.pendente,
}

function Linha({ l }: { l: ExtratoParticipacaoLinha }) {
  return (
    // wrap={false}: a linha nunca é cortada no meio por quebra de página (um
    // imóvel com 2 unidades não fica separado do nome/status na outra página).
    <View style={s.tRow} wrap={false}>
      <View style={s.cImovel}>
        <Text style={s.tdText}>{l.unidades}</Text>
      </View>
      <View style={s.cNome}>
        <Text style={s.tdText}>{l.proprietarioNome}</Text>
      </View>
      <View style={s.cPautas}>
        <Text style={s.tdText}>
          {l.pautasRespondidas}/{l.totalPautas}
        </Text>
      </View>
      <View style={s.cStatus}>
        <Text style={[s.tdStatus, { color: STATUS_COLOR[l.status] }]}>{STATUS_LABEL[l.status]}</Text>
      </View>
      <View style={s.cData}>
        <Text style={s.tdMuted}>{formatDateTimeBR(l.ultimaResposta)}</Text>
      </View>
    </View>
  )
}

export function ParticipacaoPDF({
  assembleia,
  condominio,
  extrato,
  emitidoPor,
  emitidoEm,
}: ParticipacaoPDFProps) {
  const { linhas, resumo } = extrato

  return (
    <Document
      title={`Extrato de participacao - ${assembleia.titulo}`}
      author={APP_NAME}
      creator={`${APP_NAME} v${APP_VERSION}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.pageHeader} fixed>
          <View>
            <Text style={s.phBrand}>{APP_NAME}</Text>
            <Text style={s.phSub}>Sistema de Assembleias Eletrônicas para Condomínios</Text>
          </View>
          <Text style={s.phLabel}>EXTRATO DE PARTICIPAÇÃO</Text>
        </View>

        <Text style={s.reportTitle}>Extrato de participação</Text>
        <Text style={s.reportCondo}>
          {condominio.nome} — {assembleia.titulo}
        </Text>

        {/* Aviso de parcial quando a votação ainda não encerrou — o extrato pode
            circular como se fosse final. */}
        {assembleia.status !== "encerrada" ? (
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.parcial, marginBottom: 10 }}>
            ⚠ PARCIAL — votação ainda não encerrada, os números podem mudar.
          </Text>
        ) : null}

        <Text style={s.sectionLabel}>INFORMAÇÕES</Text>
        <View style={s.infoGrid} wrap={false}>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>CONDOMÍNIO</Text>
            <Text style={s.infoVal}>{condominio.nome}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>ASSEMBLEIA</Text>
            <Text style={s.infoVal}>{assembleia.titulo}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>STATUS DA ASSEMBLEIA</Text>
            <Text style={s.infoVal}>{statusLabelPT(assembleia.status)}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>EMITIDO EM</Text>
            <Text style={s.infoVal}>{emitidoEm}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLbl}>EMITIDO POR</Text>
            <Text style={s.infoVal}>{emitidoPor}</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>RESUMO (POR IMÓVEL)</Text>
        <View style={s.partRow} wrap={false}>
          <View style={[s.partCell, s.partBorderR]}>
            <Text style={s.partNum}>{resumo.imoveis}</Text>
            <Text style={s.partLbl}>Imóveis</Text>
          </View>
          <View style={[s.partCell, s.partBorderR]}>
            <Text style={[s.partNum, { color: C.presente }]}>{resumo.presentes}</Text>
            <Text style={s.partLbl}>Presentes</Text>
          </View>
          <View style={[s.partCell, s.partBorderR]}>
            <Text style={[s.partNum, { color: C.geral }]}>{resumo.votouGeral}</Text>
            <Text style={s.partLbl}>Votou geral</Text>
          </View>
          <View style={[s.partCell, s.partBorderR]}>
            <Text style={[s.partNum, { color: C.parcial }]}>{resumo.votouParcial}</Text>
            <Text style={s.partLbl}>Votou parcial</Text>
          </View>
          <View style={s.partCell}>
            <Text style={[s.partNum, { color: C.pendente }]}>{resumo.naoVotou}</Text>
            <Text style={s.partLbl}>Não votou</Text>
          </View>
        </View>
        <Text style={s.nota}>
          Contagem por imóvel (um proprietário com 2 imóveis conta 2). Presentes = marcados presentes
          pela mesa ou que já votaram.
        </Text>

        <Text style={s.sectionLabel}>PARTICIPAÇÃO POR IMÓVEL</Text>
        {linhas.length === 0 ? (
          <Text style={s.vazio}>Nenhuma participação registrada ainda.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.tRowHeader} fixed>
              <View style={s.cImovel}>
                <Text style={s.thText}>IMÓVEL</Text>
              </View>
              <View style={s.cNome}>
                <Text style={s.thText}>PROPRIETÁRIO</Text>
              </View>
              <View style={s.cPautas}>
                <Text style={s.thText}>PAUTAS</Text>
              </View>
              <View style={s.cStatus}>
                <Text style={s.thText}>STATUS</Text>
              </View>
              <View style={s.cData}>
                <Text style={s.thText}>ÚLTIMO VOTO</Text>
              </View>
            </View>
            {linhas.map((l, i) => (
              <Linha key={i} l={l} />
            ))}
          </View>
        )}

        <View style={s.pageFooter} fixed>
          <View>
            <Text style={s.footerText}>
              Emitido em {emitidoEm} por {emitidoPor} | {APP_NAME} v{APP_VERSION}
            </Text>
            <Text style={s.footerText}>{APP_AUTORIA}</Text>
          </View>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
