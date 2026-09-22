import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { APP_NAME, APP_VERSION } from "@/lib/constants"
import { pluralImovel } from "@/lib/format"
import type { Assembleia, AssembleiaApuracao, Condominio } from "@/types"
import type { VotoDetalhado } from "@/services/relatorios"
import { formatDateTimeBR, formatDateBR } from "./utils"

// Auditoria de assembleias — Fase 3: Ata formal, documento narrativo pra
// assinatura/registro — diferente do PDF de Apuração (lib/relatorios/
// pdf-apuracao.tsx), que é um relatório de dados/tabelas. Reaproveita a
// mesma apuração já calculada (quórum efetivo, aprovação por pauta), só
// muda a forma de apresentação.
export interface AtaPDFProps {
  assembleia: Assembleia
  condominio: Condominio
  apuracao: AssembleiaApuracao
  votosDetalhados: VotoDetalhado[]
  emitidoPor: string
  emitidoEm: string
}

const C = {
  primary: "#16233F",
  border: "#D8D2C2",
  text: "#1C1C1C",
  muted: "#6B6558",
  white: "#FFFFFF",
}

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.text,
    paddingHorizontal: 56,
    paddingTop: 64,
    paddingBottom: 56,
    lineHeight: 1.5,
  },
  pageHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: C.primary,
    paddingHorizontal: 56,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phBrand: { color: C.white, fontSize: 11, fontFamily: "Helvetica-Bold" },
  phLabel: { color: "#C9A227", fontSize: 7, fontFamily: "Helvetica-Bold" },
  pageFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 56,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: C.muted },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  subtitle: { fontSize: 9, color: C.muted, textAlign: "center", marginBottom: 18 },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 3,
  },
  paragraph: { marginBottom: 8, textAlign: "justify" },
  pautaBlock: { marginBottom: 10 },
  pautaTitle: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  pautaResult: { fontFamily: "Helvetica-Bold" },
  presentesGrid: { flexDirection: "row", flexWrap: "wrap" },
  presenteItem: { width: "50%", fontSize: 9, marginBottom: 3 },
  signatureBlock: { marginTop: 48, alignItems: "center" },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: C.text,
    width: 260,
    paddingTop: 4,
    marginTop: 40,
    textAlign: "center",
  },
  signatureLabel: { fontSize: 9 },
})

function participantesUnicos(votos: VotoDetalhado[]): { nome: string; unidades: string }[] {
  const vistos = new Map<string, { nome: string; unidades: string }>()
  for (const v of votos) {
    const chave = `${v.nome}|${v.email ?? ""}`
    if (!vistos.has(chave)) vistos.set(chave, { nome: v.nome, unidades: v.unidades })
  }
  return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

function textoConvocacao(assembleia: Assembleia, apuracao: AssembleiaApuracao): string | null {
  if (assembleia.quorum_minimo === null && assembleia.data_1a_convocacao === null) return null

  if (assembleia.data_1a_convocacao === null) {
    return `A assembleia foi convocada com quórum mínimo de ${Math.round((assembleia.quorum_minimo ?? 0) * 100)}% do condomínio.`
  }

  const limite = formatDateTimeBR(assembleia.data_1a_convocacao)
  if (apuracao.convocacao_aplicada === 2) {
    return `A assembleia foi convocada em 1ª convocação, com quórum mínimo de ${Math.round((assembleia.quorum_minimo ?? 0) * 100)}%, até ${limite}. Não tendo sido atingido o quórum da 1ª convocação até essa data, a assembleia prosseguiu em 2ª convocação${assembleia.quorum_minimo_2a !== null ? `, com quórum mínimo de ${Math.round(assembleia.quorum_minimo_2a * 100)}%` : ", sem quórum mínimo exigido"}.`
  }
  return `A assembleia foi convocada em 1ª convocação, com quórum mínimo de ${Math.round((assembleia.quorum_minimo ?? 0) * 100)}%, com data-limite em ${limite}.`
}

export function AtaPDF({
  assembleia,
  condominio,
  apuracao,
  votosDetalhados,
  emitidoPor,
  emitidoEm,
}: AtaPDFProps) {
  const presentes = participantesUnicos(votosDetalhados)
  const convocacaoTexto = textoConvocacao(assembleia, apuracao)
  const quorumTexto =
    apuracao.percentual_quorum !== null
      ? `Verificado o quórum, constatou-se a representação de ${Math.round(apuracao.percentual_quorum * 100)}% do peso total do condomínio, ${apuracao.quorum_atingido ? "atingindo" : "não atingindo"} o mínimo exigido de ${Math.round((apuracao.quorum_aplicavel ?? 0) * 100)}%.`
      : null

  return (
    <Document title={`Ata - ${assembleia.titulo}`} author={APP_NAME} creator={`${APP_NAME} v${APP_VERSION}`}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.pageHeader} fixed>
          <Text style={s.phBrand}>{APP_NAME}</Text>
          <Text style={s.phLabel}>ATA DE ASSEMBLEIA</Text>
        </View>

        <Text style={s.title}>Ata de Assembleia</Text>
        <Text style={s.subtitle}>{condominio.nome}</Text>

        <View>
          <Text style={s.paragraph}>
            Aos {formatDateBR(assembleia.data_encerramento ?? assembleia.data_abertura ?? emitidoEm)},
            reuniram-se os condôminos do {condominio.nome}
            {condominio.endereco ? `, situado em ${condominio.endereco}` : ""}, por meio do sistema de
            votação eletrônica {APP_NAME}, para deliberar sobre a assembleia intitulada &quot;
            {assembleia.titulo}&quot;
            {assembleia.descricao ? `, com o seguinte contexto: ${assembleia.descricao}` : ""}
            {condominio.sindico_nome ? `, sob a administração de ${condominio.sindico_nome}` : ""}.
          </Text>

          {convocacaoTexto && <Text style={s.paragraph}>{convocacaoTexto}</Text>}
          {quorumTexto && <Text style={s.paragraph}>{quorumTexto}</Text>}

          <Text style={s.paragraph}>
            Participaram da votação {apuracao.total_respondidos} de {apuracao.total_enviados} condômino(s)
            convidado(s).
          </Text>
        </View>

        {presentes.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionLabel}>Participantes</Text>
            <View style={s.presentesGrid}>
              {presentes.map((p, i) => (
                <Text key={i} style={s.presenteItem}>
                  • {p.nome} ({p.unidades})
                </Text>
              ))}
            </View>
          </View>
        )}

        <Text style={s.sectionLabel}>Ordem do Dia e Deliberações</Text>
        {apuracao.pautas.map((item, i) => {
          const { pauta } = item
          const multiplaEscolha = pauta.tipo === "multipla_escolha"
          const opcoesOrdenadas = [...(item.opcoes_resultado ?? [])].sort((a, b) => b.ponderado - a.ponderado)
          const vencedora =
            multiplaEscolha && opcoesOrdenadas.length > 0 && opcoesOrdenadas[0]!.ponderado > 0
              ? opcoesOrdenadas[0]
              : null

          let resultadoTexto: string
          if (multiplaEscolha) {
            resultadoTexto = vencedora
              ? `Opção mais votada: ${vencedora.label} (${vencedora.ponderado} ${pluralImovel(vencedora.ponderado, "ponderado")}).`
              : "Sem votos registrados."
          } else if (item.aprovada === null) {
            resultadoTexto = "Sem votos registrados."
          } else {
            resultadoTexto = `${item.aprovada ? "APROVADA" : "REJEITADA"} — Sim: ${item.ponderado.sim} · Não: ${item.ponderado.nao} · Abstenção: ${item.ponderado.abstencao} (quórum de aprovação exigido: ${Math.round(pauta.quorum_aprovacao * 100)}%).`
          }

          return (
            <View key={pauta.id} style={s.pautaBlock} wrap={false}>
              <Text style={s.pautaTitle}>
                {i + 1}. {pauta.titulo}
                {pauta.sigiloso ? " (votação sigilosa)" : ""}
              </Text>
              {pauta.descricao && <Text style={s.paragraph}>{pauta.descricao}</Text>}
              <Text style={s.pautaResult}>{resultadoTexto}</Text>
            </View>
          )
        })}

        <Text style={s.paragraph}>
          Nada mais havendo a tratar, foi encerrada a presente assembleia, da qual se lavrou a presente
          ata, gerada eletronicamente pelo sistema {APP_NAME} em {emitidoEm}, por {emitidoPor}.
        </Text>

        <View style={s.signatureBlock} wrap={false}>
          <View style={s.signatureLine}>
            <Text style={s.signatureLabel}>{condominio.sindico_nome ?? "Síndico(a) / Administração"}</Text>
          </View>
        </View>

        <View style={s.pageFooter} fixed>
          <Text style={s.footerText}>
            {APP_NAME} v{APP_VERSION} — documento gerado eletronicamente, sujeito a assinatura
          </Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
