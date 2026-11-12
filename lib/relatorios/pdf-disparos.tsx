import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { APP_NAME, APP_VERSION, APP_AUTORIA } from "@/lib/constants"
import type { Assembleia, Condominio } from "@/types"
import type { DisparoHistorico, DisparoTipo } from "@/services/relatorios"
import { formatDateTimeBR, statusLabelPT } from "./utils"

// Comprovante de disparos de e-mail em PDF (pedido do Carlos: documento
// organizado pra apresentar à síndica, provando os envios). Lê o histórico
// COMPLETO (um registro por disparo, do log append-only assembleia_disparos),
// em ordem cronológica — mostra que os e-mails saíram, quando e com qual
// status de entrega. Substitui o XLSX anterior (que só listava o último envio
// a cada imóvel).

export interface DisparosPDFProps {
  assembleia: Assembleia
  condominio: Condominio
  disparos: DisparoHistorico[]
  // Texto do período filtrado (ex.: "01/11/2026 a 05/11/2026" ou "Todos os
  // disparos") — calculado por quem chama, a partir das datas escolhidas.
  periodoLabel: string
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
  enviado: "#6B7280",
  entregue: "#15803D",
  bounce: "#B91C1C",
  spam: "#B45309",
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
  /* resumo */
  partRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    marginBottom: 10,
    overflow: "hidden",
    flexWrap: "wrap",
  },
  partCell: { width: "25%", paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
  partNum: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  partLbl: { fontSize: 6.5, color: C.muted, marginTop: 2, textAlign: "center" },
  /* legenda */
  legenda: {
    backgroundColor: C.tableHeader,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  legendaTitulo: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 3 },
  legendaItem: { fontSize: 7.5, color: C.text, marginBottom: 1.5, lineHeight: 1.4 },
  legendaForte: { fontFamily: "Helvetica-Bold" },
  /* tabela */
  table: { borderWidth: 1, borderColor: C.border, borderRadius: 2 },
  tRowHeader: {
    flexDirection: "row",
    backgroundColor: C.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  cData: { width: "15%", paddingVertical: 4, paddingHorizontal: 5 },
  cImovel: { width: "11%", paddingVertical: 4, paddingHorizontal: 5 },
  cNome: { width: "24%", paddingVertical: 4, paddingHorizontal: 5 },
  cEmail: { width: "27%", paddingVertical: 4, paddingHorizontal: 5 },
  cTipo: { width: "11%", paddingVertical: 4, paddingHorizontal: 5 },
  cStatus: { width: "12%", paddingVertical: 4, paddingHorizontal: 5 },
  thText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted },
  tdText: { fontSize: 7, color: C.text },
  tdMuted: { fontSize: 6.5, color: C.muted },
  tdStatus: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  vazio: { fontSize: 9, color: C.muted, paddingVertical: 20, textAlign: "center" },
})

const TIPO_LABEL: Record<DisparoTipo, string> = {
  convocacao: "Convocação",
  nova_pauta: "Nova pauta",
  lembrete: "Lembrete",
  backfill: "Registro ant.",
}

// Status mais forte do envio, na ordem de gravidade: spam > bounce > entregue >
// falhou > enviado. "Enviado" = o provedor aceitou; "Entregue" = confirmou a
// entrega na caixa (via webhook). Bounce = não chegou (e-mail errado/inexistente).
function statusInfo(d: DisparoHistorico): { label: string; color: string } {
  if (d.spamEm) return { label: "Spam", color: C.spam }
  if (d.bounceEm) return { label: "Bounce", color: C.bounce }
  if (d.entregueEm) return { label: "Entregue", color: C.entregue }
  if (d.status === "failed") return { label: "Falhou", color: C.bounce }
  return { label: "Enviado", color: C.enviado }
}

export function DisparosPDF({
  assembleia,
  condominio,
  disparos,
  periodoLabel,
  emitidoPor,
  emitidoEm,
}: DisparosPDFProps) {
  // Ordem de IMÓVEL (pedido do Carlos: fica mais fácil e rápido de localizar um
  // imóvel na lista). Compara o imóvel já formatado (ex.: "B0401") com ordenação
  // numérica → bloco+número na sequência certa; "—" (sem imóvel) vai pro fim.
  // Empate (mesmo imóvel, vários disparos) cai no cronológico (mais antigo →
  // mais recente), pra ler as remessas daquele imóvel em ordem.
  const linhas = [...disparos].sort((a, b) => {
    const ua = a.unidades && a.unidades !== "—" ? a.unidades : "￿"
    const ub = b.unidades && b.unidades !== "—" ? b.unidades : "￿"
    const cmp = ua.localeCompare(ub, undefined, { numeric: true })
    if (cmp !== 0) return cmp
    const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0
    const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0
    return ta - tb
  })

  const nEnviados = disparos.filter((d) => d.status === "sent").length
  const nEntregues = disparos.filter((d) => d.entregueEm).length
  const nBounce = disparos.filter((d) => d.bounceEm).length
  const nSpam = disparos.filter((d) => d.spamEm).length
  const nFalhas = disparos.filter((d) => d.status === "failed").length
  const imoveis = new Set(disparos.map((d) => d.unidades).filter((u) => u && u !== "—")).size

  return (
    <Document
      title={`Comprovante de disparos - ${assembleia.titulo}`}
      author={APP_NAME}
      creator={`${APP_NAME} v${APP_VERSION}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.pageHeader} fixed>
          <View>
            <Text style={s.phBrand}>{APP_NAME}</Text>
            <Text style={s.phSub}>Sistema de Assembleias Eletrônicas para Condomínios</Text>
          </View>
          <Text style={s.phLabel}>COMPROVANTE DE DISPAROS</Text>
        </View>

        <Text style={s.reportTitle}>Comprovante de disparos de e-mail</Text>
        <Text style={s.reportCondo}>
          {condominio.nome} — {assembleia.titulo}
        </Text>

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
            <Text style={s.infoLbl}>PERÍODO</Text>
            <Text style={s.infoVal}>{periodoLabel}</Text>
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

        <Text style={s.sectionLabel}>RESUMO</Text>
        <View style={s.partRow} wrap={false}>
          <View style={s.partCell}>
            <Text style={s.partNum}>{disparos.length}</Text>
            <Text style={s.partLbl}>Disparos</Text>
          </View>
          <View style={s.partCell}>
            <Text style={s.partNum}>{imoveis}</Text>
            <Text style={s.partLbl}>Imóveis</Text>
          </View>
          <View style={s.partCell}>
            <Text style={s.partNum}>{nEnviados}</Text>
            <Text style={s.partLbl}>Enviados</Text>
          </View>
          <View style={s.partCell}>
            <Text style={[s.partNum, { color: C.entregue }]}>{nEntregues}</Text>
            <Text style={s.partLbl}>Entregues</Text>
          </View>
          <View style={s.partCell}>
            <Text style={[s.partNum, { color: C.bounce }]}>{nBounce}</Text>
            <Text style={s.partLbl}>Bounce</Text>
          </View>
          <View style={s.partCell}>
            <Text style={[s.partNum, { color: C.spam }]}>{nSpam}</Text>
            <Text style={s.partLbl}>Spam</Text>
          </View>
          <View style={s.partCell}>
            <Text style={[s.partNum, { color: C.bounce }]}>{nFalhas}</Text>
            <Text style={s.partLbl}>Falhas</Text>
          </View>
        </View>

        <View style={s.legenda} wrap={false}>
          <Text style={s.legendaTitulo}>O QUE CADA STATUS SIGNIFICA</Text>
          <Text style={s.legendaItem}>
            <Text style={s.legendaForte}>Enviado</Text> — o provedor de e-mail aceitou a mensagem e
            a colocou na fila de entrega (saiu do sistema).
          </Text>
          <Text style={s.legendaItem}>
            <Text style={s.legendaForte}>Entregue</Text> — o servidor do destinatário confirmou o
            recebimento na caixa (confirmação automática do provedor).
          </Text>
          <Text style={s.legendaItem}>
            <Text style={s.legendaForte}>Bounce</Text> — não chegou: e-mail errado ou inexistente no
            cadastro (corrigir o endereço ou usar outro canal).
          </Text>
          <Text style={s.legendaItem}>
            <Text style={s.legendaForte}>Spam</Text> — o destinatário marcou como spam.
          </Text>
        </View>

        <Text style={s.sectionLabel}>DISPAROS (EM ORDEM DE IMÓVEL)</Text>
        {linhas.length === 0 ? (
          <Text style={s.vazio}>Nenhum disparo no período selecionado.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.tRowHeader} fixed>
              <View style={s.cData}>
                <Text style={s.thText}>DATA/HORA</Text>
              </View>
              <View style={s.cImovel}>
                <Text style={s.thText}>IMÓVEL</Text>
              </View>
              <View style={s.cNome}>
                <Text style={s.thText}>NOME</Text>
              </View>
              <View style={s.cEmail}>
                <Text style={s.thText}>E-MAIL</Text>
              </View>
              <View style={s.cTipo}>
                <Text style={s.thText}>TIPO</Text>
              </View>
              <View style={s.cStatus}>
                <Text style={s.thText}>STATUS</Text>
              </View>
            </View>
            {linhas.map((d, i) => {
              const st = statusInfo(d)
              return (
                <View key={i} style={s.tRow} wrap={false}>
                  <View style={s.cData}>
                    <Text style={s.tdText}>{formatDateTimeBR(d.sentAt)}</Text>
                  </View>
                  <View style={s.cImovel}>
                    <Text style={s.tdText}>{d.unidades}</Text>
                  </View>
                  <View style={s.cNome}>
                    <Text style={s.tdText}>{d.nome}</Text>
                  </View>
                  <View style={s.cEmail}>
                    <Text style={s.tdMuted}>{d.email ?? "—"}</Text>
                  </View>
                  <View style={s.cTipo}>
                    <Text style={s.tdMuted}>{TIPO_LABEL[d.tipo]}</Text>
                  </View>
                  <View style={s.cStatus}>
                    <Text style={[s.tdStatus, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
              )
            })}
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
