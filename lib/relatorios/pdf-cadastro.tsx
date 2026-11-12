import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { APP_NAME, APP_VERSION, APP_AUTORIA } from "@/lib/constants"
import type { Condominio, Proprietario } from "@/types"
import { formatUnidade, normalizarChaveUnidade } from "@/lib/unidade-format"

// "Lista do cadastro" em PDF (pedido do Carlos): a relação do cadastro ORGANIZADA
// EM ORDEM DE IMÓVEL (a Exportar XLSX sai em ordem alfabética de nome). Uma linha
// por IMÓVEL — um proprietário com 2 imóveis aparece 2 vezes, cada uma no seu
// lugar na ordem —, com os dados de contato. Vive no menu "Cadastro ▾".

export interface CadastroPDFProps {
  condominio: Condominio
  proprietarios: Proprietario[]
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
  zebra: "#FAFAFA",
}

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.text,
    paddingHorizontal: 36,
    paddingTop: 52,
    paddingBottom: 48,
    lineHeight: 1.4,
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
  reportCondo: { fontSize: 9, color: C.muted, marginBottom: 4 },
  resumo: { fontSize: 8, color: C.muted, marginBottom: 14 },
  /* tabela */
  table: { borderWidth: 1, borderColor: C.border, borderRadius: 2 },
  tRowHeader: {
    flexDirection: "row",
    backgroundColor: C.tableHeader,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  tRowZebra: { backgroundColor: C.zebra },
  cImovel: { width: "13%", paddingVertical: 4, paddingHorizontal: 6 },
  cNome: { width: "31%", paddingVertical: 4, paddingHorizontal: 6 },
  cCpf: { width: "15%", paddingVertical: 4, paddingHorizontal: 6 },
  cTel: { width: "16%", paddingVertical: 4, paddingHorizontal: 6 },
  cEmail: { width: "25%", paddingVertical: 4, paddingHorizontal: 6 },
  thText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted },
  tdText: { fontSize: 7, color: C.text },
  tdImovel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.text },
  tdMuted: { fontSize: 6.5, color: C.muted },
  vazio: { fontSize: 9, color: C.muted, paddingVertical: 20, textAlign: "center" },
})

interface LinhaCadastro {
  chave: string
  imovel: string
  nome: string
  cpf: string
  telefone: string
  email: string
}

// Monta uma linha por IMÓVEL, ordenada por imóvel (bloco+número, comparação
// numérica). Proprietário sem imóvel entra no fim (chave alta) com "—".
function montarLinhas(proprietarios: Proprietario[]): LinhaCadastro[] {
  const linhas: LinhaCadastro[] = []
  for (const p of proprietarios) {
    const us = p.unidades ?? []
    const base = {
      nome: p.nome,
      cpf: p.cpf?.trim() || "—",
      telefone: p.telefone?.trim() || "—",
      email: p.email?.trim() || "—",
    }
    if (us.length === 0) {
      linhas.push({ chave: "￿", imovel: "—", ...base })
    } else {
      for (const u of us) {
        linhas.push({ chave: normalizarChaveUnidade(u), imovel: formatUnidade(u), ...base })
      }
    }
  }
  return linhas.sort((a, b) => a.chave.localeCompare(b.chave, undefined, { numeric: true }))
}

function Linha({ l, zebra }: { l: LinhaCadastro; zebra: boolean }) {
  return (
    // wrap={false}: nunca corta a linha no meio por quebra de página.
    <View style={zebra ? [s.tRow, s.tRowZebra] : s.tRow} wrap={false}>
      <View style={s.cImovel}>
        <Text style={s.tdImovel}>{l.imovel}</Text>
      </View>
      <View style={s.cNome}>
        <Text style={s.tdText}>{l.nome}</Text>
      </View>
      <View style={s.cCpf}>
        <Text style={s.tdText}>{l.cpf}</Text>
      </View>
      <View style={s.cTel}>
        <Text style={s.tdText}>{l.telefone}</Text>
      </View>
      <View style={s.cEmail}>
        <Text style={s.tdMuted}>{l.email}</Text>
      </View>
    </View>
  )
}

export function CadastroPDF({ condominio, proprietarios, emitidoPor, emitidoEm }: CadastroPDFProps) {
  const linhas = montarLinhas(proprietarios)

  return (
    <Document
      title={`Lista do cadastro - ${condominio.nome}`}
      author={APP_NAME}
      creator={`${APP_NAME} v${APP_VERSION}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.pageHeader} fixed>
          <View>
            <Text style={s.phBrand}>{APP_NAME}</Text>
            <Text style={s.phSub}>Sistema de Assembleias Eletrônicas para Condomínios</Text>
          </View>
          <Text style={s.phLabel}>LISTA DO CADASTRO</Text>
        </View>

        <Text style={s.reportTitle}>Lista do cadastro</Text>
        <Text style={s.reportCondo}>{condominio.nome}</Text>
        <Text style={s.resumo}>
          {linhas.length} {linhas.length === 1 ? "imóvel" : "imóveis"} · {proprietarios.length}{" "}
          {proprietarios.length === 1 ? "proprietário" : "proprietários"} · em ordem de imóvel ·
          emitido em {emitidoEm} por {emitidoPor}
        </Text>

        {linhas.length === 0 ? (
          <Text style={s.vazio}>Nenhum proprietário cadastrado.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.tRowHeader} fixed>
              <View style={s.cImovel}>
                <Text style={s.thText}>IMÓVEL</Text>
              </View>
              <View style={s.cNome}>
                <Text style={s.thText}>PROPRIETÁRIO</Text>
              </View>
              <View style={s.cCpf}>
                <Text style={s.thText}>CPF</Text>
              </View>
              <View style={s.cTel}>
                <Text style={s.thText}>TELEFONE</Text>
              </View>
              <View style={s.cEmail}>
                <Text style={s.thText}>E-MAIL</Text>
              </View>
            </View>
            {linhas.map((l, i) => (
              <Linha key={i} l={l} zebra={i % 2 === 1} />
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
