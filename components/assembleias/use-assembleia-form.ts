import { useState } from "react"
import type { PautaTipo } from "@/types"

export const MAX_PAUTAS = 9
export const MIN_OPCOES = 2

export interface PautaFormState {
  titulo: string
  descricao: string
  tipo: PautaTipo
  permiteAbstencao: boolean
  // Percentual (0–100) de Sim sobre Sim+Não exigido pra aprovar — texto no
  // form pra aceitar campo vazio/em edição; convertido pra fração (0–1) só
  // na hora de enviar (ver services/pautas.ts). "50" = maioria simples.
  quorumAprovacao: string
  // Auditoria de assembleias — Fase 5: pauta sigilosa (ex.: eleição de
  // síndico) — resultado agregado continua público; PDF/Excel omitem o
  // vínculo nome↔voto no detalhamento pra essa pauta.
  sigiloso: boolean
  opcoes: string[]
}

export interface AssembleiaFormValues {
  titulo: string
  descricao: string
  dataAbertura: string
  dataEncerramento: string
  // Percentual (0–100) do peso do condomínio inteiro exigido pra
  // assembleia valer. Vazio = sem checagem de quórum mínimo.
  quorumMinimo: string
  // Auditoria de assembleias — Fase 2: 1ª/2ª convocação. data1aConvocacao
  // vazio = sem 1ª/2ª convocação (só quorumMinimo, comportamento único da
  // Fase 1). Preenchido = depois dessa data, quorumMinimo2a passa a valer
  // no lugar de quorumMinimo.
  data1aConvocacao: string
  quorumMinimo2a: string
  pautas: PautaFormState[]
}

export function novaPauta(): PautaFormState {
  return {
    titulo: "",
    descricao: "",
    tipo: "sim_nao",
    permiteAbstencao: true,
    quorumAprovacao: "50",
    sigiloso: false,
    opcoes: [],
  }
}

function valoresIniciais(initial?: Partial<AssembleiaFormValues>): AssembleiaFormValues {
  return {
    titulo: initial?.titulo ?? "",
    descricao: initial?.descricao ?? "",
    dataAbertura: initial?.dataAbertura ?? "",
    dataEncerramento: initial?.dataEncerramento ?? "",
    quorumMinimo: initial?.quorumMinimo ?? "",
    data1aConvocacao: initial?.data1aConvocacao ?? "",
    quorumMinimo2a: initial?.quorumMinimo2a ?? "",
    pautas: initial?.pautas?.length ? initial.pautas : [novaPauta()],
  }
}

// Estado e mutações do formulário de assembleia (título, descrição, datas e
// pautas) — usado tanto na criação quanto na edição, para as duas telas
// nunca divergirem em validação ou comportamento.
export function useAssembleiaForm(initial?: Partial<AssembleiaFormValues>) {
  const [titulo, setTitulo] = useState(() => valoresIniciais(initial).titulo)
  const [descricao, setDescricao] = useState(() => valoresIniciais(initial).descricao)
  const [dataAbertura, setDataAbertura] = useState(() => valoresIniciais(initial).dataAbertura)
  const [dataEncerramento, setDataEncerramento] = useState(() => valoresIniciais(initial).dataEncerramento)
  const [quorumMinimo, setQuorumMinimo] = useState(() => valoresIniciais(initial).quorumMinimo)
  const [data1aConvocacao, setData1aConvocacao] = useState(() => valoresIniciais(initial).data1aConvocacao)
  const [quorumMinimo2a, setQuorumMinimo2a] = useState(() => valoresIniciais(initial).quorumMinimo2a)
  const [pautas, setPautas] = useState<PautaFormState[]>(() => valoresIniciais(initial).pautas)

  function reset(values?: Partial<AssembleiaFormValues>) {
    const v = valoresIniciais(values)
    setTitulo(v.titulo)
    setDescricao(v.descricao)
    setDataAbertura(v.dataAbertura)
    setDataEncerramento(v.dataEncerramento)
    setQuorumMinimo(v.quorumMinimo)
    setData1aConvocacao(v.data1aConvocacao)
    setQuorumMinimo2a(v.quorumMinimo2a)
    setPautas(v.pautas)
  }

  function addPauta() {
    if (pautas.length >= MAX_PAUTAS) return
    setPautas((prev) => [...prev, novaPauta()])
  }

  function removePauta(index: number) {
    setPautas((prev) => prev.filter((_, i) => i !== index))
  }

  function updatePauta(index: number, field: "titulo" | "descricao", value: string) {
    setPautas((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function updatePautaQuorum(index: number, value: string) {
    setPautas((prev) => prev.map((p, i) => (i === index ? { ...p, quorumAprovacao: value } : p)))
  }

  function updatePautaTipo(index: number, tipo: PautaTipo) {
    setPautas((prev) =>
      prev.map((p, i) =>
        i === index
          ? { ...p, tipo, opcoes: tipo === "multipla_escolha" && p.opcoes.length === 0 ? ["", ""] : p.opcoes }
          : p
      )
    )
  }

  function togglePermiteAbstencao(index: number) {
    setPautas((prev) =>
      prev.map((p, i) => (i === index ? { ...p, permiteAbstencao: !p.permiteAbstencao } : p))
    )
  }

  function toggleSigiloso(index: number) {
    setPautas((prev) => prev.map((p, i) => (i === index ? { ...p, sigiloso: !p.sigiloso } : p)))
  }

  function addOpcao(pautaIndex: number) {
    setPautas((prev) =>
      prev.map((p, i) => (i === pautaIndex ? { ...p, opcoes: [...p.opcoes, ""] } : p))
    )
  }

  function removeOpcao(pautaIndex: number, opcaoIndex: number) {
    setPautas((prev) =>
      prev.map((p, i) =>
        i === pautaIndex ? { ...p, opcoes: p.opcoes.filter((_, oi) => oi !== opcaoIndex) } : p
      )
    )
  }

  function updateOpcao(pautaIndex: number, opcaoIndex: number, value: string) {
    setPautas((prev) =>
      prev.map((p, i) =>
        i === pautaIndex
          ? { ...p, opcoes: p.opcoes.map((o, oi) => (oi === opcaoIndex ? value : o)) }
          : p
      )
    )
  }

  function moveOpcao(pautaIndex: number, opcaoIndex: number, direction: -1 | 1) {
    setPautas((prev) =>
      prev.map((p, i) => {
        if (i !== pautaIndex) return p
        const target = opcaoIndex + direction
        if (target < 0 || target >= p.opcoes.length) return p
        const opcoes = [...p.opcoes]
        ;[opcoes[opcaoIndex], opcoes[target]] = [opcoes[target]!, opcoes[opcaoIndex]!]
        return { ...p, opcoes }
      })
    )
  }

  // Percentual em texto → fração (0–1) pra enviar ao servidor. Vazio =
  // undefined (sem checagem, no caso do quórum mínimo da assembleia).
  function pctParaFracao(texto: string): number | undefined {
    if (texto.trim() === "") return undefined
    const n = Number(texto.replace(",", "."))
    return Number.isNaN(n) ? NaN : n / 100
  }

  function quorumValido(texto: string, obrigatorio: boolean): boolean {
    const fracao = pctParaFracao(texto)
    if (fracao === undefined) return !obrigatorio
    return !Number.isNaN(fracao) && fracao > 0 && fracao <= 1
  }

  // Auditoria de assembleias — Fase 2: se data1aConvocacao está fora do
  // intervalo [dataAbertura, dataEncerramento] (quando essas datas
  // existem), a janela da 2ª convocação fica vazia ou invertida — mesma
  // regra aplicada de novo no servidor (ver validarConvocacao em
  // app/actions/assembleias.ts).
  const convocacaoValida =
    data1aConvocacao.trim() === "" ||
    ((dataEncerramento.trim() === "" || new Date(data1aConvocacao) <= new Date(dataEncerramento)) &&
      (dataAbertura.trim() === "" || new Date(data1aConvocacao) >= new Date(dataAbertura)))

  // Motivo pelo qual o Salvar está bloqueado (primeiro problema encontrado),
  // em texto pro usuário — antes o botão só ficava desabilitado sem dizer por
  // quê (bug do Carlos: mudava a abertura e "não salvava", sem saber que a
  // data-limite da 1ª convocação, lá embaixo, estava antes da abertura). A
  // tela mostra isto ao lado do botão. `canSubmit` é derivado daqui.
  const pautaInvalida = pautas.find((p) => {
    if (!p.titulo.trim()) return true
    if (!quorumValido(p.quorumAprovacao, true)) return true
    if (p.tipo !== "multipla_escolha") return false
    return p.opcoes.map((o) => o.trim()).filter(Boolean).length < MIN_OPCOES
  })
  const motivoBloqueio: string | null =
    titulo.trim().length === 0
      ? "Informe o título da assembleia."
      : !quorumValido(quorumMinimo, false)
        ? "Quórum mínimo inválido — use um número entre 1 e 100, ou deixe o campo vazio."
        : !quorumValido(quorumMinimo2a, false)
          ? "Quórum da 2ª convocação inválido — use um número entre 1 e 100, ou deixe vazio."
          : !convocacaoValida
            ? "A data-limite da 1ª convocação precisa ficar entre a abertura e o encerramento. Ajuste a 1ª convocação (ou limpe o campo)."
            : pautas.length === 0
              ? "Adicione pelo menos uma pauta."
              : pautaInvalida
                ? !pautaInvalida.titulo.trim()
                  ? "Toda pauta precisa de um título."
                  : !quorumValido(pautaInvalida.quorumAprovacao, true)
                    ? "Toda pauta precisa de um quórum de aprovação válido (entre 1 e 100)."
                    : "Pauta de múltipla escolha precisa de pelo menos 2 opções preenchidas."
                : null

  const canSubmit = motivoBloqueio === null

  return {
    titulo,
    setTitulo,
    descricao,
    setDescricao,
    dataAbertura,
    setDataAbertura,
    dataEncerramento,
    setDataEncerramento,
    quorumMinimo,
    setQuorumMinimo,
    data1aConvocacao,
    setData1aConvocacao,
    quorumMinimo2a,
    setQuorumMinimo2a,
    convocacaoValida,
    pautas,
    addPauta,
    removePauta,
    updatePauta,
    updatePautaTipo,
    updatePautaQuorum,
    togglePermiteAbstencao,
    toggleSigiloso,
    addOpcao,
    removeOpcao,
    updateOpcao,
    moveOpcao,
    canSubmit,
    motivoBloqueio,
    reset,
    pctParaFracao,
  }
}

export type AssembleiaFormApi = ReturnType<typeof useAssembleiaForm>
