"use client"

import { memo, useMemo, useRef, useState, useTransition, useEffect, useCallback } from "react"
import {
  Users,
  Trash2,
  Plus,
  X,
  Search,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  EyeOff,
  Eraser,
  Download,
  FileText,
  Undo2,
  MoreVertical,
  Pencil,
  UserPlus,
  Send,
  ChevronDown,
  Check,
  ListFilter,
  DoorOpen,
  QrCode,
  Tv,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CriarProprietarioDialog } from "@/components/proprietarios/criar-proprietario-dialog"
import { APP_NAME } from "@/lib/constants"
import {
  deleteProprietarioAction,
  addUnidadeAction,
  removeUnidadeAction,
  anularVotoAction,
} from "@/app/actions/proprietarios"
import {
  marcarPresencaAction,
  getEstadoVotacaoLiveAction,
  setParticipanteNomeAction,
} from "@/app/actions/presenca"
import { enviarAssembleiaAction } from "@/app/actions/assembleia-votos"
import { ConfirmarSenhaDialog } from "@/components/ui/confirmar-senha-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getPesoParticipante } from "@/lib/peso"
import { formatUnidade, menorNumeroUnidade } from "@/lib/unidade-format"
import { formatCelular, formatCpf, normalizarBusca } from "@/lib/format"
import { EditarProprietarioDialog } from "@/components/proprietarios/editar-proprietario-dialog"
import { RegistrarVotoManualDialog } from "@/components/assembleias/registrar-voto-manual-dialog"
import { QrEntradaDialog } from "@/components/assembleias/qr-entrada-dialog"
import { useModoCompartilhar } from "@/components/assembleias/modo-compartilhar-context"
import type { Proprietario, CriterioPeso, Pauta, AssembleiaStatus } from "@/types"

interface ProprietariosListProps {
  proprietarios: Proprietario[]
  condominioId: string
  // Nome do condomínio — só pro nome do arquivo na exportação XLSX.
  condominioNome?: string
  proprietariosQueJaVotaram?: Set<string>
  // Quem já votou NA ASSEMBLEIA ABERTA agora (badge "votou/não votou" +
  // filtro). undefined = não há assembleia aberta → sem badge/filtro.
  votouNaAberta?: Set<string>
  // Quem está marcado PRESENTE na assembleia aberta (filtro "Presentes" +
  // estado inicial da caixa de presença por linha).
  presentesNaAberta?: Set<string>
  // Quantas pautas distintas cada proprietário já respondeu na assembleia
  // aberta — distingue voto TOTAL (respondeu todas) de PARCIAL (só algumas).
  pautasVotadasNaAberta?: Map<string, number>
  // Denominador do "voto total": nº de pautas em votação (todas, ou só as já
  // abertas pela mesa no modo pauta-por-pauta). undefined/0 → sem distinção.
  totalPautasVotaveis?: number
  // Quem outorgou procuração na assembleia aberta — não pode ser marcado
  // presente (a presença é representada pelo procurador): toggle desabilitado.
  outorgantesNaAberta?: Set<string>
  // Outorgantes cujo REPRESENTANTE já votou → quantas pautas ele respondeu
  // (pedido do Carlos: procuração conta como PRESENTE quando o representante
  // vota, e como AUSENTE enquanto não vota; se votou, entra no voto geral/parcial
  // conforme o representante). Ausência da chave = representante ainda não votou.
  outorgantesComRepVotouNaAberta?: Map<string, number>
  // Nome de quem participou pelo imóvel quando não é o dono do cadastro (co-dono
  // presente, ex.: esposa). Semente do servidor; a mesa edita direto na linha.
  participantesNaAberta?: Map<string, string>
  // Proprietários cujo e-mail de disparo teve problema: "bounce" (voltou) ou
  // "spam" (marcado como spam) — marca "use WhatsApp" na linha (pedido do Carlos
  // após os bounces de endereços errados em Caldas Novas). Escondido pra quem já
  // votou (o aviso vira ruído).
  emailProblemaNaAberta?: Map<string, "bounce" | "spam">
  // Id da assembleia aberta — habilita marcar presença direto na lista (sem
  // abrir a Apuração). undefined = sem assembleia aberta → sem caixa.
  assembleiaAbertaId?: string
  assembleiaAbertaTitulo?: string
  // Pautas da assembleia aberta — pro "Registrar voto manual" direto na lista
  // (pedido do Carlos: não trocar de tela). O dialog filtra as abertas sozinho.
  pautasDaAberta?: Pauta[]
  isAdmin?: boolean
  // Visualizador = só leitura: esconde editar/excluir/adicionar/remover unidade.
  podeEditar?: boolean
  criterioPeso?: CriterioPeso
  // Assembleia ATUAL da tela (fusão, mockup de 5 menus do Carlos): leva o Link
  // de entrada, o QR e o Telão pro menu "Cadastro ▾" — antes viviam na barra da
  // apuração ("Entrada ▾" + botão Telão). Difere de assembleiaAbertaId (que só
  // existe em andamento): aqui vem o status real, pra o Telão também aparecer na
  // encerrada. A tela da apuração passa a assembleia da página; a tela de GESTÃO
  // passa a assembleia EM ANDAMENTO (se houver) — assim a secretária pega o
  // link/QR/Telão sem trocar de tela. Ausente = nenhum desses itens aparece.
  assembleiaAtual?: { id: string; titulo: string; status: AssembleiaStatus }
}

type FiltroVoto =
  | "todos"
  | "presentes"
  | "ausentes"
  | "votaram"
  | "parcial"
  | "nao"
  | "procuracao"
  | "inadimplentes"
  | "tentando"

function horaBR(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function formatPeso(peso: number, criterioPeso: CriterioPeso): string {
  if (criterioPeso === "fracao_ideal") return `${(peso * 100).toFixed(4)}%`
  return `${peso} ${peso === 1 ? "voto" : "votos"}`
}

// Abre um diálogo controlado pelo seu gatilho inline a partir de um item do
// menu "⋯": dispara o clique no botão-gatilho já montado na linha (Editar / Voto
// manual). Assim o atalho inline e o item de menu apontam pro MESMO diálogo, sem
// refatorar o estado de abertura desses componentes. O setTimeout(…,0) deixa o
// menu fechar e restaurar o foco ANTES do diálogo tomar o foco — sem isso os
// dois disputam o foco e o diálogo pode abrir "sem foco" pro teclado.
function abrirPeloTrigger(ref: { current: HTMLButtonElement | null }) {
  setTimeout(() => ref.current?.click(), 0)
}

type Ordenacao = "nome" | "unidade"

// Mesma grade de colunas usada no cabeçalho e em cada linha, em telas
// grandes (lg+) — é o que garante nome/e-mail/celular/peso/ações alinhados
// verticalmente mesmo com textos de tamanhos bem diferentes entre linhas.
const GRID_COLUNAS = "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_140px_64px_72px]"
// Modo compartilhar (LGPD): some com E-mail/CPF e Celular (as 2 colunas do
// meio), sobram Nome · Votos · Ações — pra projetar/compartilhar a tela sem
// expor dados pessoais dos condôminos.
const GRID_COLUNAS_COMPARTILHAR = "lg:grid-cols-[minmax(0,1fr)_64px_72px]"

export function ProprietariosList({
  proprietarios,
  condominioId,
  condominioNome,
  proprietariosQueJaVotaram,
  votouNaAberta,
  presentesNaAberta,
  pautasVotadasNaAberta,
  totalPautasVotaveis,
  outorgantesNaAberta,
  outorgantesComRepVotouNaAberta,
  participantesNaAberta,
  emailProblemaNaAberta,
  assembleiaAbertaId,
  assembleiaAbertaTitulo,
  pautasDaAberta,
  isAdmin = false,
  podeEditar = true,
  criterioPeso = "unidade",
  assembleiaAtual,
}: ProprietariosListProps) {
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("nome")
  const [filtroVoto, setFiltroVoto] = useState<FiltroVoto>("todos")
  const [exportando, setExportando] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  // Modo compartilhar / "Dados a compartilhar" (LGPD): oculta E-mail/CPF e
  // Celular pra projetar a tela sem expor dados pessoais (pedido do Carlos — os
  // presentes online conferem se estão marcados como presentes sem ver os dados
  // dos outros). FONTE do estado: na APURAÇÃO vem do context (compartilhado com
  // o toggle do menu "Operacionais ▾" da barra da apuração — ver
  // ModoCompartilharContext); na tela de GESTÃO não há provider → cai no
  // useState local. É só visibilidade de coluna; nada toca a lógica de voto.
  const compartilharCtx = useModoCompartilhar()
  const [modoCompartilharLocal, setModoCompartilharLocal] = useState(false)
  const modoCompartilhar = compartilharCtx ? compartilharCtx.value : modoCompartilharLocal
  const toggleCompartilhar = compartilharCtx
    ? compartilharCtx.toggle
    : () => setModoCompartilharLocal((v) => !v)

  // Presença marcada direto na lista (pedido do Carlos: agilizar a chamada sem
  // abrir a Apuração). Estado local semeado do servidor, atualizado de forma
  // otimista E sincronizado pelo polling (duas secretárias em dispositivos
  // diferentes veem as marcações uma da outra — ver buscarPresencaLive).
  const [presentesLocal, setPresentesLocal] = useState<Set<string>>(
    () => new Set(presentesNaAberta)
  )
  const [marcandoId, setMarcandoId] = useState<string | null>(null)
  // Conjunto das marcações EM VOO deste dispositivo (ref, não re-renderiza): o
  // polling (closure estável) lê daqui pra não reverter com dado antigo do
  // servidor enquanto a gravação não confirmou. É um Set (não um id único) pra
  // aguentar toques rápidos em pessoas diferentes sem piscar nenhuma delas.
  const marcandoIdsRef = useRef<Set<string>>(new Set())
  // Nomes de "quem participou" sendo EDITADOS em voo pela mesa neste dispositivo
  // (mesma ideia do marcandoIdsRef): o polling preserva o valor local destes ids
  // até a gravação voltar, pra o nome recém-capturado pelo QR (que chega pelo
  // poll) não atropelar o que a secretária está digitando/acabou de salvar.
  const editandoParticipanteRef = useRef<Set<string>>(new Set())
  // Gatilho oculto do "Incluir proprietário" (menu Cadastro ▾) — reaproveita o
  // mesmo CriarProprietarioDialog do botão do cabeçalho, aberto pelo item de
  // menu via abrirPeloTrigger (o botão do cabeçalho segue à mão, como atalho).
  const criarTriggerRef = useRef<HTMLButtonElement>(null)
  // Gatilho oculto do QR de entrada (item "QR de entrada" do Cadastro ▾), aberto
  // via abrirPeloTrigger — mesmo padrão do Incluir proprietário.
  const qrEntradaRef = useRef<HTMLButtonElement>(null)
  const podeMarcarPresenca = !!assembleiaAbertaId && podeEditar

  // Link/QR/Telão no "Cadastro ▾" (fusão, mockup de 5 menus): mesmos gatings da
  // antiga barra da apuração. Link e QR são operacionais (podeEditar) e valem só
  // antes de encerrar; o Telão é leitura ao vivo (todos os perfis) e vale até na
  // encerrada — só não na rascunho. Sem `assembleiaAtual` (tela de gestão) nada
  // disso aparece.
  const entStatus = assembleiaAtual?.status
  const linkEntradaOn =
    !!assembleiaAtual && podeEditar && (entStatus === "aberta" || entStatus === "pausada")
  const qrEntradaOn = !!assembleiaAtual && podeEditar && entStatus !== "encerrada"
  const telaoOn = !!assembleiaAtual && entStatus !== "rascunho"
  const temEntradaNoCadastro = linkEntradaOn || qrEntradaOn || telaoOn

  function copiarLinkEntrada() {
    if (!assembleiaAtual) return
    const url = `${window.location.origin}/entrar/${assembleiaAtual.id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link de entrada copiado — cole no grupo do WhatsApp."),
        () => toast.message(url)
      )
    } else {
      toast.message(url)
    }
  }

  // Nome de quem participou pelo imóvel (co-dono presente que não é o dono do
  // cadastro). Semeado do servidor, atualizado otimista ao salvar na linha E
  // sincronizado pelo poll: o nome capturado na entrada pelo QR (ou anotado por
  // outra secretária) aparece aqui ao vivo, sem recarregar. As edições em voo
  // deste dispositivo são preservadas (editandoParticipanteRef).
  const [participantesLocal, setParticipantesLocal] = useState<Map<string, string>>(
    () => new Map(participantesNaAberta)
  )

  async function handleSetParticipante(proprietarioId: string, nome: string) {
    if (!assembleiaAbertaId) return
    const valor = nome.trim()
    const anterior = participantesLocal.get(proprietarioId) ?? ""
    // Em voo: o poll preserva o valor local deste id até a gravação voltar.
    editandoParticipanteRef.current.add(proprietarioId)
    // Otimista.
    setParticipantesLocal((prev) => {
      const next = new Map(prev)
      if (valor) next.set(proprietarioId, valor)
      else next.delete(proprietarioId)
      return next
    })
    const r = await setParticipanteNomeAction(assembleiaAbertaId, condominioId, proprietarioId, valor)
    if (!r.success) {
      // Reverte se o servidor recusou.
      setParticipantesLocal((prev) => {
        const next = new Map(prev)
        if (anterior) next.set(proprietarioId, anterior)
        else next.delete(proprietarioId)
        return next
      })
      toast.error(r.error ?? "Erro ao salvar o participante.")
    }
    editandoParticipanteRef.current.delete(proprietarioId)
  }
  // Há assembleia aberta? Gate do funil de votos e do polling. Antes era o
  // próprio `votouNaAberta` (undefined sem assembleia aberta); agora que o voto
  // virou estado sincronizado, o sinal é o id da assembleia aberta.
  const temAssembleiaAberta = !!assembleiaAbertaId

  // Estado de votação semeado das props e SINCRONIZADO pelo poll (ao vivo entre
  // dispositivos): quem votou, nº de pautas respondidas por pessoa, denominador
  // do voto total e procurações. Antes vinham só das props (load da página),
  // então duas secretárias viam contagens de voto diferentes (uma "Votou geral
  // 8", a outra "0"). O inicializador roda só na montagem; o poll atualiza.
  const [votaramLocal, setVotaramLocal] = useState<Set<string>>(() => new Set(votouNaAberta))
  const [pautasVotadasLocal, setPautasVotadasLocal] = useState<Map<string, number>>(
    () => new Map(pautasVotadasNaAberta)
  )
  const [totalPautasVotaveisLocal, setTotalPautasVotaveisLocal] = useState(
    totalPautasVotaveis ?? 0
  )
  const [outorgantesLocal, setOutorgantesLocal] = useState<Set<string>>(
    () => new Set(outorgantesNaAberta)
  )
  // Outorgantes cujo representante já votou → nº de pautas que o representante
  // respondeu. A presença e o voto do imóvel de procuração herdam disto (ver
  // presenteEfetivo/votouEfetivo abaixo). Semente da prop, sincronizado no poll.
  const [outorgantesComRepVotouLocal, setOutorgantesComRepVotouLocal] = useState<
    Map<string, number>
  >(() => new Map(outorgantesComRepVotouNaAberta))

  // Alerta "tentando entrar" na própria tela de cadastro (pedido do Carlos: é a
  // tela que a secretária fica o tempo todo). id → horário da tentativa. Buscado
  // por polling leve enquanto há assembleia aberta e o operador pode marcar.
  const [tentandoEntrar, setTentandoEntrar] = useState<Map<string, string>>(new Map())

  // Polling AO VIVO do estado de votação. O servidor é a verdade — sincroniza
  // entre dispositivos (bug do Carlos: uma secretária marcava/via movimento e a
  // outra não). Presença preserva as marcações EM VOO deste dispositivo
  // (marcandoIdsRef) pra não piscar; o resto (votos/pautas/procuração) é só
  // leitura, então reflete direto o servidor.
  const buscarEstadoLive = useCallback(async () => {
    if (!assembleiaAbertaId) return
    const r = await getEstadoVotacaoLiveAction(assembleiaAbertaId, condominioId)
    // Falha → preserva o estado atual (não zera presença/votos na tela).
    if (!r.success) return
    setTentandoEntrar(new Map(r.tentando.map((t) => [t.id, t.em])))
    setVotaramLocal(new Set(r.votaram))
    setPautasVotadasLocal(new Map(r.pautasVotadas))
    setTotalPautasVotaveisLocal(r.totalPautasVotaveis)
    setOutorgantesLocal(new Set(r.outorgantes))
    setOutorgantesComRepVotouLocal(new Map(r.outorgantesComRepVotou))
    setPresentesLocal((prev) => {
      const servidor = new Set(r.presentes)
      // Preserva TODAS as marcações em voo deste dispositivo (o servidor pode
      // ainda não refletir): mantém o estado otimista de cada uma até a
      // gravação voltar e o próximo ciclo trazer a verdade.
      for (const id of marcandoIdsRef.current) {
        if (prev.has(id)) servidor.add(id)
        else servidor.delete(id)
      }
      return servidor
    })
    // "Quem participou" ao vivo: o servidor é a verdade (mesmo modelo da
    // presença), preservando os nomes em edição em voo deste dispositivo pra não
    // atropelar o que a secretária está digitando/acabou de salvar.
    setParticipantesLocal((prev) => {
      const servidor = new Map(r.participantes)
      for (const id of editandoParticipanteRef.current) {
        const local = prev.get(id)
        if (local !== undefined) servidor.set(id, local)
        else servidor.delete(id)
      }
      return servidor
    })
  }, [assembleiaAbertaId, condominioId])

  // setTimeout ENCADEADO (não setInterval): só reagenda após a consulta
  // terminar — não empilha se o banco lentear. Primeira busca imediata. Roda
  // sempre que há assembleia aberta (inclusive pra visualizador ver ao vivo),
  // não só pra quem pode marcar presença.
  useEffect(() => {
    if (!temAssembleiaAberta) return
    let ativo = true
    let timer: ReturnType<typeof setTimeout>
    const ciclo = async () => {
      try {
        await buscarEstadoLive()
      } catch {
        // falha de rede não derruba a lista; tenta de novo no próximo ciclo
      }
      if (ativo) timer = setTimeout(ciclo, 7000)
    }
    ciclo()
    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [temAssembleiaAberta, buscarEstadoLive])

  async function handleTogglePresente(proprietarioId: string, presente: boolean) {
    if (!assembleiaAbertaId) return
    marcandoIdsRef.current.add(proprietarioId)
    setMarcandoId(proprietarioId)
    setPresentesLocal((prev) => {
      const next = new Set(prev)
      if (presente) next.add(proprietarioId)
      else next.delete(proprietarioId)
      return next
    })
    // Confirmou presença → some do alerta "tentando entrar" (otimista).
    if (presente) {
      setTentandoEntrar((prev) => {
        if (!prev.has(proprietarioId)) return prev
        const next = new Map(prev)
        next.delete(proprietarioId)
        return next
      })
    }
    const result = await marcarPresencaAction(
      assembleiaAbertaId,
      condominioId,
      proprietarioId,
      presente
    )
    if (!result.success) {
      // Reverte a marcação otimista se o servidor recusou.
      setPresentesLocal((prev) => {
        const next = new Set(prev)
        if (presente) next.delete(proprietarioId)
        else next.add(proprietarioId)
        return next
      })
      toast.error(result.error ?? "Erro ao marcar presença.")
    }
    marcandoIdsRef.current.delete(proprietarioId)
    setMarcandoId((atual) => (atual === proprietarioId ? null : atual))
  }

  // Presença/voto "EFETIVOS" — a procuração herda o status do REPRESENTANTE
  // (pedido do Carlos): o imóvel de quem outorgou conta como PRESENTE quando o
  // representante vota e como AUSENTE enquanto não vota; se votou, entra no voto
  // geral/parcial conforme quantas pautas o representante respondeu. Quem NÃO é
  // outorgante cai no próprio estado (presença/voto direto) — comportamento
  // idêntico ao de antes. Assim Presentes + Ausentes = total E Presentes =
  // Votou geral + Parcial + Não votaram (o funil continua fechando).
  const presenteEfetivo = useCallback(
    (id: string) =>
      outorgantesLocal.has(id) ? outorgantesComRepVotouLocal.has(id) : presentesLocal.has(id),
    [outorgantesLocal, outorgantesComRepVotouLocal, presentesLocal]
  )
  const votouEfetivo = useCallback(
    (id: string) =>
      outorgantesLocal.has(id) ? outorgantesComRepVotouLocal.has(id) : votaramLocal.has(id),
    [outorgantesLocal, outorgantesComRepVotouLocal, votaramLocal]
  )
  const pautasEfetivas = useCallback(
    (id: string) =>
      outorgantesLocal.has(id)
        ? outorgantesComRepVotouLocal.get(id) ?? 0
        : pautasVotadasLocal.get(id) ?? 0,
    [outorgantesLocal, outorgantesComRepVotouLocal, pautasVotadasLocal]
  )

  // Quem votou em ALGUMAS pautas, mas não em todas as que estavam em votação
  // (voto parcial). Só faz sentido quando há denominador (pautas em votação).
  // Usa o voto EFETIVO (procuração conta pelo representante).
  const parciaisNaAberta = useMemo(() => {
    const s = new Set<string>()
    if (!temAssembleiaAberta || !totalPautasVotaveisLocal) return s
    for (const p of proprietarios) {
      if (!votouEfetivo(p.id)) continue
      if (pautasEfetivas(p.id) < totalPautasVotaveisLocal) s.add(p.id)
    }
    return s
  }, [proprietarios, temAssembleiaAberta, totalPautasVotaveisLocal, votouEfetivo, pautasEfetivas])

  const proprietariosExibidos = useMemo(() => {
    const porVoto =
      temAssembleiaAberta && filtroVoto !== "todos"
        ? proprietarios.filter((p) => {
            // Presença/voto EFETIVOS: a procuração conta pelo representante
            // (presente/votou se o representante votou). Assim Presentes +
            // Ausentes fecham e a procuração não fica num limbo.
            if (filtroVoto === "presentes") return presenteEfetivo(p.id)
            if (filtroVoto === "ausentes") return !presenteEfetivo(p.id)
            if (filtroVoto === "procuracao") return outorgantesLocal.has(p.id)
            if (filtroVoto === "inadimplentes") return p.inadimplente
            if (filtroVoto === "tentando") return tentandoEntrar.has(p.id)
            // "votaram" = votaram TUDO (todas as pautas). Junto com "parcial" e
            // "nao" formam o funil do Carlos: dos presentes, quem votou tudo,
            // quem votou em parte e quem não votou nada — três baldes que
            // somam os presentes, sem sobreposição.
            if (filtroVoto === "votaram")
              return votouEfetivo(p.id) && !parciaisNaAberta.has(p.id)
            if (filtroVoto === "parcial") return parciaisNaAberta.has(p.id)
            // "nao" — presentes que AINDA não votaram (não soma quem nem está
            // na assembleia): pedido do Carlos, "Não votaram = presentes sem
            // voto".
            return presenteEfetivo(p.id) && !votouEfetivo(p.id)
          })
        : proprietarios

    const termo = normalizarBusca(busca.trim())
    const filtrados = !termo
      ? porVoto
      : porVoto.filter((p) => {
          const alvo = [
            p.nome,
            p.email ?? "",
            p.telefone ?? "",
            ...(p.unidades ?? []).flatMap((u) => [u.numero, u.bloco ?? ""]),
          ].join(" ")
          return normalizarBusca(alvo).includes(termo)
        })

    const ordenados = [...filtrados]
    if (ordenacao === "nome") {
      ordenados.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    } else {
      ordenados.sort((a, b) => {
        const na = menorNumeroUnidade(a.unidades ?? [])
        const nb = menorNumeroUnidade(b.unidades ?? [])
        if (na === null && nb === null) return a.nome.localeCompare(b.nome, "pt-BR")
        if (na === null) return 1
        if (nb === null) return -1
        return na.localeCompare(nb, undefined, { numeric: true })
      })
    }
    return ordenados
  }, [
    proprietarios,
    busca,
    ordenacao,
    filtroVoto,
    temAssembleiaAberta,
    presenteEfetivo,
    votouEfetivo,
    parciaisNaAberta,
    outorgantesLocal,
    tentandoEntrar,
  ])

  // Há busca ou filtro ativo? Habilita o botão "Limpar" (pedido do Carlos:
  // um botão só que zera busca + filtro e volta a mostrar todos os imóveis,
  // em vez de ter que apagar a busca na mão).
  const temFiltroAtivo = busca.trim() !== "" || filtroVoto !== "todos"

  function limparBuscaEFiltros() {
    setBusca("")
    setFiltroVoto("todos")
  }

  // Exporta em XLSX exatamente o que está sendo exibido (busca + filtro) —
  // pedido do Carlos: antes exportava os 300 mesmo filtrando. Manda os ids
  // visíveis pro endpoint, que gera o arquivo (com a coluna Imóvel).
  async function exportarXlsx() {
    if (exportando) return
    setExportando(true)
    try {
      const ids = proprietariosExibidos.map((p) => p.id)
      const res = await fetch(`/api/condominios/${condominioId}/exportar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${APP_NAME}_${(condominioNome ?? "Proprietarios").replace(/[^a-z0-9]/gi, "_")}_Proprietarios.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Não foi possível exportar a planilha. Tente novamente.")
    } finally {
      setExportando(false)
    }
  }

  // Totalizações por IMÓVEL, não por pessoa (pedido do Carlos): a assembleia
  // gira em torno do imóvel — um proprietário com 2 imóveis conta como 2
  // (presença, voto e quórum). Os botões abaixo mostram contagem de imóveis;
  // a lista continua uma linha por proprietário.
  const imoveisDe = (p: Proprietario) => p.unidades?.length ?? 0
  const totalImoveis = proprietarios.reduce((n, p) => n + imoveisDe(p), 0)
  // Contadores por IMÓVEL com presença/voto EFETIVOS (procuração conta pelo
  // representante — pedido do Carlos). Invariantes: Presentes + Ausentes =
  // Total; Presentes = Votou geral + Parcial + Não votaram.
  const nVotaram = temAssembleiaAberta
    ? proprietarios.reduce(
        (n, p) => n + (votouEfetivo(p.id) && !parciaisNaAberta.has(p.id) ? imoveisDe(p) : 0),
        0
      )
    : 0
  const nParcial = temAssembleiaAberta
    ? proprietarios.reduce((n, p) => n + (parciaisNaAberta.has(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  const nPresentes = temAssembleiaAberta
    ? proprietarios.reduce((n, p) => n + (presenteEfetivo(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  // "Não votaram" = imóveis de quem está PRESENTE (efetivo) e ainda não votou.
  const nNao = temAssembleiaAberta
    ? proprietarios.reduce(
        (n, p) => n + (presenteEfetivo(p.id) && !votouEfetivo(p.id) ? imoveisDe(p) : 0),
        0
      )
    : 0
  // Ausentes = imóveis que NÃO estão presentes (efetivo). Procuração cujo
  // representante ainda não votou cai aqui (pedido do Carlos), então Presentes
  // + Ausentes fecham no total. "Procuração" abaixo segue como destaque (cruza).
  const nAusentes = temAssembleiaAberta
    ? proprietarios.reduce((n, p) => n + (!presenteEfetivo(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  const nProcuracao = temAssembleiaAberta
    ? proprietarios.reduce((n, p) => n + (outorgantesLocal.has(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  const nInadimplentes = temAssembleiaAberta
    ? proprietarios.reduce((n, p) => n + (p.inadimplente ? imoveisDe(p) : 0), 0)
    : 0

  if (proprietarios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
        <Users className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nenhum proprietário cadastrado ainda.</p>
      </div>
    )
  }

  // Grade das colunas: completa, ou enxuta (sem E-mail/Celular) no modo
  // compartilhar. Cabeçalho e linhas usam a mesma, pra ficarem alinhados.
  const gridCols = modoCompartilhar ? GRID_COLUNAS_COMPARTILHAR : GRID_COLUNAS

  // Status curto por pessoa pro modo compartilhar (texto + cor), reaproveitando
  // os conjuntos ao vivo. Mesma lógica dos badges da linha normal, condensada.
  function statusCompartilhar(p: Proprietario): { label: string; cor: string } {
    if (outorgantesLocal.has(p.id))
      return { label: "procuração", cor: "text-amber-600 dark:text-amber-400" }
    if (votaramLocal.has(p.id))
      return parciaisNaAberta.has(p.id)
        ? { label: "votou parcial", cor: "text-amber-600 dark:text-amber-400" }
        : { label: "votou geral", cor: "text-emerald-600 dark:text-emerald-400" }
    if (presentesLocal.has(p.id))
      return { label: "não votou", cor: "text-foreground/70" }
    if (tentandoEntrar.has(p.id))
      return { label: "tentou entrar", cor: "text-amber-600 dark:text-amber-400" }
    return { label: "ausente", cor: "text-muted-foreground/70" }
  }

  // Leva 1 do redesenho (menu "Controles (filtros)", pedido do Carlos): a
  // fileira de chips de filtro vira um menu "Filtros ▾" pra reduzir a barra.
  // Mesma ordem do funil (Total → Presentes/Ausentes → Votou geral/parcial/Não
  // votaram) + Procuração e Inadimplentes. Diferente dos chips antigos, o menu
  // mostra SEMPRE os 8 (mesmo com contagem 0): mais previsível, e o filtro ativo
  // nunca fica num limbo por o chip ter sumido. O botão do menu mostra o filtro
  // ativo + contagem, pra a mesa ver de relance o que está filtrado.
  const filtrosMenu: [FiltroVoto, string, number][] = [
    ["todos", "Todos os imóveis", totalImoveis],
    ["presentes", "Presentes", nPresentes],
    ["ausentes", "Ausentes", nAusentes],
    ["votaram", "Votou geral", nVotaram],
    ["parcial", "Votou parcial", nParcial],
    ["nao", "Não votaram", nNao],
    ["procuracao", "Procuração", nProcuracao],
    ["inadimplentes", "Inadimplentes", nInadimplentes],
  ]
  const filtroMenuAtivo = filtrosMenu.find(([v]) => v === filtroVoto)
  const filtroAtivoLabel =
    filtroVoto === "todos"
      ? "Filtros"
      : filtroMenuAtivo
        ? `${filtroMenuAtivo[1]} (${filtroMenuAtivo[2]})`
        : filtroVoto === "tentando"
          ? "Tentando entrar"
          : "Filtros"

  // Rótulo do filtro ativo pro cabeçalho do PDF "Lista do cadastro" (nome limpo,
  // sem a contagem) + a busca, se houver. "Todos os imóveis" = sem recorte.
  const filtroLabelRelatorio = (() => {
    const base =
      filtroMenuAtivo?.[1] ?? (filtroVoto === "tentando" ? "Tentando entrar" : "Todos os imóveis")
    const termo = busca.trim()
    return termo ? `${base} · busca: "${termo}"` : base
  })()

  // Baixa a "Lista do cadastro" (PDF) OBEDECENDO o filtro ativo (pedido do
  // Carlos): manda os ids da lista exibida (filtro + busca) + o nome do filtro
  // pro cabeçalho. POST + blob, igual ao Exportar XLSX.
  async function baixarListaCadastro() {
    if (gerandoPdf) return
    setGerandoPdf(true)
    try {
      const res = await fetch(`/api/relatorios/cadastro/${condominioId}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: proprietariosExibidos.map((p) => p.id),
          filtroLabel: filtroLabelRelatorio,
        }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${APP_NAME}_Cadastro_${(condominioNome ?? "Cadastro").replace(/[^a-z0-9]/gi, "_")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Não foi possível gerar o PDF. Tente novamente.")
    } finally {
      setGerandoPdf(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Alerta "tentando entrar" NA PRÓPRIA tela de cadastro (pedido do Carlos):
          é onde a secretária fica o tempo todo. Quem abriu o link/QR e ainda não
          foi marcado presente aparece aqui em tempo real. Clicar filtra pra ver
          só eles e confirmar a presença na hora. */}
      {podeMarcarPresenca && tentandoEntrar.size > 0 && (
        <button
          type="button"
          onClick={() => setFiltroVoto("tentando")}
          className="flex w-full items-center gap-3 rounded-xl border border-amber-400/60 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15"
        >
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
          </span>
          <span className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-300">
            <strong>
              {tentandoEntrar.size}{" "}
              {tentandoEntrar.size === 1 ? "pessoa tentando entrar" : "pessoas tentando entrar"}
            </strong>{" "}
            — confirme a presença.
          </span>
          <span className="shrink-0 rounded-md border border-amber-400/60 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
            Ver
          </span>
        </button>
      )}

      {/* Painel de ferramentas — fundo e borda diferentes da listagem abaixo,
          para deixar claro à primeira vista que esta área serve para
          localizar/organizar registros, não faz parte da tabela em si. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/80 sm:pr-1">
          <Search className="h-3.5 w-3.5" />
          Buscar
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, celular, unidade ou bloco…"
            className="border-border/60 bg-background pl-10"
            aria-label="Buscar proprietário"
          />
        </div>
        {/* Limpar busca + filtros de uma vez (pedido do Carlos) — só aparece
            quando há algo a limpar; volta a lista a 100% dos imóveis. */}
        {temFiltroAtivo && (
          <button
            type="button"
            onClick={limparBuscaEFiltros}
            title="Limpar a busca e o filtro — volta a mostrar todos os imóveis"
            className="flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
          >
            <Eraser className="h-4 w-4" />
            <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
        {/* "Cadastro ▾" (leva 2 do redesenho, pedido do Carlos — era "Opções"):
            agrupa a gestão do cadastro — Incluir proprietário + Ordenar, e, POR
            ORA, Modo compartilhar e Exportar (migram pra Operacionais/Relatórios
            nas próximas levas). Busca, Limpar, Filtros e o "Novo proprietário" do
            cabeçalho (atalho) seguem à mão. */}
        {podeEditar && (
          <CriarProprietarioDialog
            condominioId={condominioId}
            triggerRef={criarTriggerRef}
            triggerClassName="hidden"
          />
        )}
        {/* QR de entrada montado oculto — aberto pelo item do Cadastro ▾. */}
        {qrEntradaOn && assembleiaAtual && (
          <QrEntradaDialog
            assembleiaId={assembleiaAtual.id}
            assembleiaTitulo={assembleiaAtual.titulo}
            condominioNome={condominioNome}
            triggerRef={qrEntradaRef}
            triggerClassName="hidden"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="h-12 shrink-0 gap-1.5 px-3" />}
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Cadastro</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {podeEditar && (
              <DropdownMenuItem onClick={() => abrirPeloTrigger(criarTriggerRef)}>
                <UserPlus className="h-4 w-4" />
                Incluir proprietário
              </DropdownMenuItem>
            )}
            {podeEditar && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => setOrdenacao("nome")}>
              <Check className={`h-4 w-4 ${ordenacao === "nome" ? "" : "opacity-0"}`} />
              Ordenar por nome
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrdenacao("unidade")}>
              <Check className={`h-4 w-4 ${ordenacao === "unidade" ? "" : "opacity-0"}`} />
              Ordenar por unidade
            </DropdownMenuItem>
            {/* Entrada da assembleia (fusão, mockup de 5 menus): Link + QR +
                Telão vieram pra cá da barra da apuração ("Entrada ▾" + botão
                Telão). Ficam agrupados com o cadastro, onde a secretária opera. */}
            {temEntradaNoCadastro && (
              <>
                <DropdownMenuSeparator />
                {linkEntradaOn && (
                  <DropdownMenuItem onClick={copiarLinkEntrada}>
                    <DoorOpen className="h-4 w-4" />
                    Copiar link de entrada
                  </DropdownMenuItem>
                )}
                {qrEntradaOn && (
                  <DropdownMenuItem onClick={() => abrirPeloTrigger(qrEntradaRef)}>
                    <QrCode className="h-4 w-4" />
                    QR de entrada
                  </DropdownMenuItem>
                )}
                {telaoOn && assembleiaAtual && (
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(`/telao/${assembleiaAtual.id}`, "_blank", "noopener")
                    }
                  >
                    <Tv className="h-4 w-4" />
                    Telão ao vivo
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            {/* Modo compartilhar (LGPD): oculta E-mail/CPF e Celular pra projetar
                sem expor dados. O estado também aparece no aviso abaixo da barra. */}
            <DropdownMenuItem onClick={toggleCompartilhar}>
              {modoCompartilhar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {modoCompartilhar ? "Mostrar dados" : "Dados a compartilhar"}
            </DropdownMenuItem>
            {podeEditar && (
              <DropdownMenuItem onClick={exportarXlsx} disabled={exportando}>
                {exportando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Exportar XLSX
              </DropdownMenuItem>
            )}
            {/* "Lista do cadastro" (pedido do Carlos): PDF da relação do cadastro
                em ORDEM DE IMÓVEL (a Exportar XLSX sai alfabética por nome). Baixa
                direto. Tem PII → só pra quem edita (a rota recusa visualizador). */}
            {podeEditar && (
              <DropdownMenuItem onClick={baixarListaCadastro} disabled={gerandoPdf}>
                {gerandoPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Lista do cadastro (PDF)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Aviso discreto quando o modo compartilhar está ligado — fica visível
          também pra quem está vendo a tela projetada, explicando a ocultação. */}
      {modoCompartilhar && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-amber-700 dark:text-amber-400">
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          Modo compartilhar ligado — E-mail, CPF e Celular ocultos para proteger os dados dos
          condôminos (LGPD).
        </p>
      )}

      {/* Painel de votação da assembleia aberta (pedido do Carlos): acompanhar e
          cobrar quem falta sem ir à apuração. Traz a explicação, o "Registrar
          voto manual" à mão e o menu "Filtros ▾" (leva 1 do redesenho — antes
          era uma fileira de chips de filtro). */}
      {temAssembleiaAberta && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5">
          {/* Cabeçalho do painel de votação: explicação à esquerda e, à direita,
              o "Registrar voto manual" DIRETO na lista (pedido do Carlos: lançar
              o voto sem trocar de tela — a mesa fica nesta tela o tempo todo). Só
              pra quem pode operar (podeEditar) e com as pautas em mãos. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Votação de{" "}
              <span className="font-medium text-foreground">{assembleiaAbertaTitulo}</span> — peso por{" "}
              <span className="font-medium text-foreground">imóvel</span>. Dos presentes na assembleia:
              quem votou todas as pautas (geral), quem votou parcialmente, e quem ainda não votou.
            </p>
            {podeEditar && assembleiaAbertaId && assembleiaAbertaTitulo && pautasDaAberta && (
              <div className="shrink-0">
                <RegistrarVotoManualDialog
                  assembleiaId={assembleiaAbertaId}
                  assembleiaTitulo={assembleiaAbertaTitulo}
                  condominioId={condominioId}
                  pautas={pautasDaAberta}
                />
              </div>
            )}
          </div>
          {/* Menu "Filtros ▾" (leva 1 do redesenho — "Controles (filtros)"):
              substitui a fileira de chips. O botão mostra o filtro ativo +
              contagem; cada item traz o total ao lado, com um ✓ no ativo. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 gap-1.5 ${
                      filtroVoto !== "todos" ? "border-primary/40 bg-primary/10 text-primary" : ""
                    }`}
                  />
                }
              >
                <ListFilter className="h-3.5 w-3.5" />
                {filtroAtivoLabel}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {filtrosMenu.map(([val, label, count]) => (
                  <DropdownMenuItem key={val} onClick={() => setFiltroVoto(val)}>
                    <Check className={`h-4 w-4 ${filtroVoto === val ? "" : "opacity-0"}`} />
                    <span className="flex-1">{label}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {proprietariosExibidos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
          {busca.trim() ? (
            <Search className="h-8 w-8 text-muted-foreground/40" />
          ) : (
            <ListFilter className="h-8 w-8 text-muted-foreground/40" />
          )}
          {/* Mensagem ciente do contexto: busca vazia + lista vazia = é o filtro
              (ex.: "Votou parcial (0)") que não tem ninguém — não "busca sem
              resultado" com aspas vazias. O menu Filtros mostra sempre os 8,
              então dá pra cair num filtro de contagem 0. */}
          <p className="text-sm text-muted-foreground">
            {busca.trim()
              ? `Nenhum proprietário encontrado para "${busca}".`
              : "Nenhum imóvel neste filtro."}
          </p>
        </div>
      ) : modoCompartilhar ? (
        // Modo compartilhar: lista COMPACTA pra projetar/compartilhar no celular
        // (pedido do Carlos — sem cabeçalho, sem colunas largas, linhas bem
        // juntas). Uma linha por pessoa: NOME (status) imóveis.
        <div className="divide-y divide-border/30 rounded-xl border border-border/60 bg-card">
          {proprietariosExibidos.map((p) => {
            const { label, cor } = statusCompartilhar(p)
            const imoveis = [...(p.unidades ?? [])]
              .sort((a, b) => {
                const bloco = (a.bloco ?? "").localeCompare(b.bloco ?? "", undefined, { numeric: true })
                return bloco !== 0 ? bloco : a.numero.localeCompare(b.numero, undefined, { numeric: true })
              })
              .map((u) => formatUnidade(u))
              .join(" – ")
            // Quem participou pelo imóvel (co-dono presente) aparece junto ao
            // dono no modo compartilhar (pedido do Carlos: "DONO / PARTICIPANTE"),
            // pra quem está online conferir quem está representando o imóvel.
            const participou = participantesLocal.get(p.id)
            return (
              <div key={p.id} className="flex flex-wrap items-baseline gap-x-2 px-3 py-1 text-sm">
                <span className="font-medium">{p.nome}</span>
                {participou && (
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    / {participou}
                  </span>
                )}
                <span className={`text-xs font-medium ${cor}`}>({label})</span>
                {imoveis && <span className="text-xs text-muted-foreground">{imoveis}</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card">
          {/* Cabeçalho de colunas — só faz sentido a partir de lg, onde a
              grade de colunas entra em vigor. */}
          <div
            className={`hidden border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 lg:grid lg:gap-3 ${gridCols}`}
          >
            <span>Nome</span>
            <span>E-mail</span>
            <span>Celular</span>
            <span>Votos</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="divide-y divide-border/40">
            {proprietariosExibidos.map((p) => (
              <ProprietarioRow
                key={p.id}
                proprietario={p}
                condominioId={condominioId}
                todosProprietarios={proprietarios}
                jaVotou={proprietariosQueJaVotaram?.has(p.id) ?? false}
                mostrarVoto={temAssembleiaAberta}
                votou={votaramLocal.has(p.id)}
                parcial={parciaisNaAberta.has(p.id)}
                pautasVotadas={pautasVotadasLocal.get(p.id) ?? 0}
                totalPautas={totalPautasVotaveisLocal}
                outorgante={outorgantesLocal.has(p.id)}
                tentouEntrarEm={tentandoEntrar.get(p.id) ?? null}
                mostrarPresenca={podeMarcarPresenca}
                presente={presentesLocal.has(p.id)}
                marcandoPresenca={marcandoId === p.id}
                onTogglePresente={handleTogglePresente}
                isAdmin={isAdmin}
                podeEditar={podeEditar}
                criterioPeso={criterioPeso}
                gridCols={gridCols}
                modoCompartilhar={modoCompartilhar}
                podeAnotarParticipante={podeMarcarPresenca}
                participante={participantesLocal.get(p.id) ?? ""}
                conjuge={p.conjuge}
                emailProblema={emailProblemaNaAberta?.get(p.id)}
                onSetParticipante={handleSetParticipante}
                assembleiaAbertaId={assembleiaAbertaId}
                assembleiaAbertaTitulo={assembleiaAbertaTitulo}
                pautasDaAberta={pautasDaAberta}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const ProprietarioRow = memo(function ProprietarioRow({
  proprietario,
  condominioId,
  todosProprietarios,
  jaVotou,
  mostrarVoto,
  votou,
  parcial,
  pautasVotadas,
  totalPautas,
  outorgante,
  tentouEntrarEm,
  mostrarPresenca,
  presente,
  marcandoPresenca,
  onTogglePresente,
  isAdmin,
  podeEditar,
  criterioPeso,
  gridCols,
  modoCompartilhar,
  podeAnotarParticipante,
  participante,
  conjuge,
  emailProblema,
  onSetParticipante,
  assembleiaAbertaId,
  assembleiaAbertaTitulo,
  pautasDaAberta,
}: {
  proprietario: Proprietario
  condominioId: string
  todosProprietarios: Proprietario[]
  jaVotou: boolean
  mostrarVoto: boolean
  votou: boolean
  parcial: boolean
  pautasVotadas: number
  totalPautas: number
  outorgante: boolean
  // Horário (ISO) em que tentou entrar pelo link/QR sem estar presente, ou null.
  tentouEntrarEm: string | null
  mostrarPresenca: boolean
  presente: boolean
  marcandoPresenca: boolean
  onTogglePresente: (proprietarioId: string, presente: boolean) => void
  isAdmin: boolean
  podeEditar: boolean
  criterioPeso: CriterioPeso
  // Grade de colunas (completa ou enxuta) e se o modo compartilhar está ligado
  // — quando ligado, E-mail/CPF e Celular não são renderizados (LGPD).
  gridCols: string
  modoCompartilhar: boolean
  // Anotar quem participou pelo imóvel (co-dono presente que não é o dono do
  // cadastro). Só com assembleia aberta e operador (podeAnotarParticipante).
  podeAnotarParticipante: boolean
  participante: string
  // Cônjuge cadastrado (co-dono que costuma comparecer) — vira o atalho de 1
  // toque pra anotar "quem participou" sem digitar. null = não cadastrado.
  conjuge: string | null
  // Problema no e-mail do último disparo: "bounce" (voltou) ou "spam" (marcado
  // como spam). undefined = sem problema. Mostra o aviso "use WhatsApp" na
  // coluna do e-mail (só pra quem ainda não votou — ver o render).
  emailProblema?: "bounce" | "spam"
  onSetParticipante: (proprietarioId: string, nome: string) => void
  // Dados da assembleia aberta pro voto manual DIRETO na coluna Ações (pedido
  // do Carlos). undefined = sem assembleia aberta → sem o botão.
  assembleiaAbertaId?: string
  assembleiaAbertaTitulo?: string
  pautasDaAberta?: Pauta[]
}) {
  const [novaUnidade, setNovaUnidade] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [showExcluir, setShowExcluir] = useState(false)
  const [showAnular, setShowAnular] = useState(false)
  const [unidadeExcluir, setUnidadeExcluir] = useState<string | null>(null)
  // Imóvel digitado no +Add já existe em outro cadastro → confirma mover.
  const [moverImovelDe, setMoverImovelDe] = useState<string | null>(null)
  const [isPendingAdd, startAddTransition] = useTransition()
  // Disparar e-mail pra UM proprietário (pedido do Carlos: "fulano não recebeu,
  // reenvia só pra ele" na hora da assembleia). Confirma antes (envio externo
  // que custa e conta no limite diário de e-mail) e reaproveita
  // enviarAssembleiaAction — mesmo link e mesmo log de disparos do envio em massa.
  const [showDisparar, setShowDisparar] = useState(false)
  const [isDisparando, startDisparo] = useTransition()
  // Gatilhos inline (Editar / Voto manual) que os itens do menu "⋯" acionam via
  // abrirPeloTrigger — o atalho e o item de menu abrem o MESMO diálogo.
  const editarTriggerRef = useRef<HTMLButtonElement>(null)
  const votoTriggerRef = useRef<HTMLButtonElement>(null)
  // Edição inline de "quem participou" (a gravação é otimista no pai).
  const [editandoPart, setEditandoPart] = useState(false)
  const [partInput, setPartInput] = useState(participante)

  function salvarParticipante() {
    onSetParticipante(proprietario.id, partInput)
    setEditandoPart(false)
  }

  const peso = getPesoParticipante(proprietario, criterioPeso)
  // Padroniza a exibição dos imóveis de quem tem mais de um em ordem CRESCENTE
  // (pedido do Carlos): 40 antes de 41, independente da ordem de cadastro.
  const unidades = [...(proprietario.unidades ?? [])].sort((a, b) => {
    const bloco = (a.bloco ?? "").localeCompare(b.bloco ?? "", undefined, { numeric: true })
    return bloco !== 0 ? bloco : a.numero.localeCompare(b.numero, undefined, { numeric: true })
  })
  const celular = proprietario.telefone ? formatCelular(proprietario.telefone) : null
  const cpfFmt = formatCpf(proprietario.cpf)
  const unidadeAlvo = unidades.find((u) => u.id === unidadeExcluir)

  // confirmarMover vira true no "Mover", depois do aviso de que o imóvel já está
  // em outro cadastro (pedido do Carlos: avisar e mover, não ficar em 2).
  function handleAddUnidade(confirmarMover = false) {
    if (!novaUnidade.trim()) return
    startAddTransition(async () => {
      const result = await addUnidadeAction(
        proprietario.id,
        condominioId,
        novaUnidade,
        confirmarMover
      )
      if (result.success) {
        if (result.movidoDe) toast.success(`Imóvel movido de ${result.movidoDe}.`)
        setNovaUnidade("")
        setShowAdd(false)
        setMoverImovelDe(null)
      } else if (result.imovelExistente && result.donoAtual) {
        // Já está em outro cadastro — pergunta se move.
        setMoverImovelDe(result.donoAtual)
      } else {
        // Erro real (ex.: dono atual já votou) — fecha o aviso e mostra o motivo.
        setMoverImovelDe(null)
        toast.error(result.error)
      }
    })
  }

  // Voto manual DIRETO na linha (pedido do Carlos: "já estando com o ponteiro na
  // pessoa, só clicar na Ação"). Só aparece pra quem está PRESENTE e ainda NÃO
  // votou geral (pedido do Carlos) — além de não ser inadimplente nem outorgante
  // (quem vota é o procurador) e de ter os dados da assembleia em mãos.
  const podeVotoManual =
    !!assembleiaAbertaId &&
    !!assembleiaAbertaTitulo &&
    !!pautasDaAberta &&
    mostrarPresenca &&
    presente &&
    !proprietario.inadimplente &&
    !outorgante &&
    !(votou && !parcial)

  // Disparar e-mail pra esta pessoa. Só faz sentido com assembleia aberta (há o
  // que disparar) e e-mail cadastrado — o item de menu só aparece nesse caso.
  const podeDisparar = !!assembleiaAbertaId && !!proprietario.email

  function handleDisparar() {
    if (!assembleiaAbertaId) return
    startDisparo(async () => {
      const res = await enviarAssembleiaAction(assembleiaAbertaId, [proprietario.id])
      // Fecha o diálogo assim que o envio resolve (o botão fica desabilitado
      // enquanto dispara), pra não deixar dúvida se saiu — igual ao "Mover para
      // cá". O resultado (sucesso/erro) vem pelo toast. Fecha em qualquer caso.
      setShowDisparar(false)
      if (res.error) toast.error(res.error)
      else if (res.sent > 0) toast.success(`E-mail enviado para ${proprietario.nome}.`)
      else toast.error(`Não foi possível enviar o e-mail para ${proprietario.nome}.`)
    })
  }

  const acoes = (
    <>
      {podeVotoManual && (
        <RegistrarVotoManualDialog
          assembleiaId={assembleiaAbertaId!}
          assembleiaTitulo={assembleiaAbertaTitulo!}
          condominioId={condominioId}
          pautas={pautasDaAberta!}
          proprietarioDireto={{ id: proprietario.id, nome: proprietario.nome }}
          triggerRef={votoTriggerRef}
        />
      )}
      <EditarProprietarioDialog
        proprietario={proprietario}
        condominioId={condominioId}
        todosProprietarios={todosProprietarios}
        jaVotou={jaVotou}
        isAdmin={isAdmin}
        criterioPeso={criterioPeso}
        triggerRef={editarTriggerRef}
      />
      {/* Menu "⋯" COMPLETO (pedido do Carlos: ter todas as ações num lugar só).
          Os itens Editar e Voto manual acionam os MESMOS diálogos dos atalhos
          inline (via abrirPeloTrigger/triggerRef), que continuam à mão ao lado.
          Os controles inline nunca passam de 3 (voto manual, editar, ⋯), então a
          coluna AÇÕES não encavala — o que motivou o redesenho em menus. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              title="Mais ações"
            />
          }
        >
          <MoreVertical className="h-3.5 w-3.5" />
          <span className="sr-only">Mais ações</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Registrar voto manual — mesmas condições do atalho inline
              (presente, ainda não votou geral, não inadimplente/outorgante). */}
          {podeVotoManual && (
            <DropdownMenuItem onClick={() => abrirPeloTrigger(votoTriggerRef)}>
              <UserPlus className="h-4 w-4" />
              Registrar voto manual
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => abrirPeloTrigger(editarTriggerRef)}>
            <Pencil className="h-4 w-4" />
            Editar proprietário
          </DropdownMenuItem>
          {/* Disparar e-mail só pra esta pessoa — confirma antes (ver o diálogo
              lá embaixo). Aparece com assembleia aberta e e-mail cadastrado. */}
          {podeDisparar && (
            <DropdownMenuItem onClick={() => setShowDisparar(true)}>
              <Send className="h-4 w-4" />
              Disparar e-mail
            </DropdownMenuItem>
          )}
          {/* Anular voto (pedido do Carlos): zera o voto desta pessoa na
              assembleia aberta (some da apuração) — corrige voto errado, limpa
              "fantasma" e destrava a exclusão de quem votou. Pede senha. Fica
              SEMPRE visível quando há assembleia aberta (o Carlos estranhou ela
              "sumir"), mas DESABILITADA enquanto a pessoa não votou — não há voto
              pra anular. Só ativa pra quem já votou. */}
          {mostrarVoto && (
            <DropdownMenuItem onClick={() => setShowAnular(true)} disabled={!votou}>
              <Undo2 className="h-4 w-4" />
              Anular voto
              {/* Dica VISÍVEL (não no hover — item desabilitado tem
                  pointer-events-none, então o title não apareceria): explica por
                  que está cinza e quando acende. Só enquanto a pessoa não votou. */}
              {!votou && (
                <span className="ml-auto pl-3 text-[11px] text-muted-foreground">após votar</span>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setShowExcluir(true)}>
            <Trash2 className="h-4 w-4" />
            Excluir proprietário
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  return (
    <div className="px-3 py-1.5">
      {/* Linha 1 — abaixo de lg: empilhado em duas sub-linhas (nome+ações,
          depois e-mail/celular/peso). A partir de lg: uma única linha em
          grade de colunas alinhadas com o cabeçalho. */}
      <div className={`grid grid-cols-1 gap-1 lg:items-center lg:gap-3 ${gridCols}`}>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold lg:font-medium">
          {mostrarPresenca && (
            <button
              type="button"
              onClick={() => onTogglePresente(proprietario.id, !presente)}
              disabled={marcandoPresenca || outorgante}
              aria-pressed={presente}
              title={
                outorgante
                  ? "Outorgou procuração — a presença é representada pelo procurador"
                  : presente
                    ? "Presente — toque para desmarcar"
                    : "Marcar presente"
              }
              className={`flex min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                outorgante
                  ? "cursor-not-allowed text-muted-foreground/30"
                  : presente
                    ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground/40 hover:text-emerald-600 dark:hover:text-emerald-400"
              }`}
            >
              {marcandoPresenca ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : presente ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              <span className="sr-only">{presente ? "Presente" : "Marcar presente"}</span>
            </button>
          )}
          <span className="truncate">{proprietario.nome}</span>
          {proprietario.inadimplente && (
            <span
              className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive"
              title="Inadimplente — não pode votar"
            >
              Inadimplente
            </span>
          )}
          {/* Outorgante: delegou presença e voto ao procurador — mostra
              "Procuração" em vez de "Não votou" (que seria enganoso, já que ele
              não pode votar por si). */}
          {outorgante ? (
            <span
              className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
              title="Outorgou procuração — quem participa e vota é o procurador"
            >
              Procuração
            </span>
          ) : (
            /* Três estados (termo do Carlos): "Não votou" (cinza), "Votou
               parcial X/Y" (âmbar — votou em algumas pautas, falta terminar) e
               "Votou geral" (verde — votou em todas as pautas em votação). */
            mostrarVoto &&
            (!votou ? (
              // Pedido do Carlos: quem AINDA não confirmou presença é "Ausente";
              // só depois de marcado presente passa a "Não votou". E quem tentou
              // entrar pelo link/QR e ainda não foi confirmado ganha destaque
              // "Tentou entrar HH:MM" (âmbar) — a mesa confirma na hora.
              presente ? (
                <span
                  className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  title="Presente — ainda não votou"
                >
                  Não votou
                </span>
              ) : tentouEntrarEm ? (
                <span
                  className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                  title="Abriu o link/QR e ainda não foi marcado presente — confirme a presença"
                >
                  Tentou entrar {horaBR(tentouEntrarEm)}
                </span>
              ) : (
                <span
                  className="shrink-0 rounded-full bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/70"
                  title="Ainda não confirmou presença na assembleia"
                >
                  Ausente
                </span>
              )
            ) : parcial ? (
              <span
                className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                title={`Votou em ${pautasVotadas} de ${totalPautas} ${totalPautas === 1 ? "pauta" : "pautas"} em votação — ainda falta votar`}
              >
                Votou parcial{totalPautas > 0 ? ` ${pautasVotadas}/${totalPautas}` : ""}
              </span>
            ) : (
              <span
                className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                title="Votou em todas as pautas em votação"
              >
                Votou geral
              </span>
            )))}
        </p>

        {/* No modo NORMAL: 3 filhos diretos (e-mail/CPF, celular, peso) — com
            `lg:contents` viram itens da grade do pai, um por coluna. No modo
            COMPARTILHAR: só o peso (E-mail/CPF e Celular ocultos por LGPD), e a
            grade enxuta (gridCols) tem exatamente as colunas Nome · Votos ·
            Ações, então o peso cai na coluna certa. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground lg:contents">
          {/* E-mail com o CPF logo abaixo: o operador confere rápido o CPF
              quando alguém diz que o link de entrada acusou "CPF ou unidade
              inválida" (pedido do Carlos). */}
          {!modoCompartilhar && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate">{proprietario.email || "—"}</span>
              {emailProblema && !votou && (
                <span
                  className="truncate text-xs font-medium text-destructive"
                  title={
                    emailProblema === "spam"
                      ? "Esta pessoa marcou o e-mail como spam — fale pelo WhatsApp e evite reenviar e-mail"
                      : "O e-mail do último disparo voltou (não existe / caixa indisponível) — fale pelo WhatsApp"
                  }
                >
                  {emailProblema === "spam"
                    ? "✉ marcou como spam — use WhatsApp"
                    : "✉ não chegou — use WhatsApp"}
                </span>
              )}
              {cpfFmt && (
                <span className="truncate text-xs text-muted-foreground/70">CPF {cpfFmt}</span>
              )}
            </div>
          )}
          {!modoCompartilhar && (
            <span className="min-w-0 shrink-0 truncate">{celular ?? "—"}</span>
          )}
          <span
            className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary lg:ml-0 lg:w-fit"
            title={
              criterioPeso === "fracao_ideal"
                ? "Percentual de peso de voto deste proprietário, somado a partir da fração ideal de cada unidade vinculada."
                : "Quantidade de votos deste proprietário, calculada automaticamente pelo número de unidades vinculadas."
            }
          >
            {formatPeso(peso, criterioPeso)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 lg:justify-end">{podeEditar && acoes}</div>
      </div>

      {/* Linha 2: unidades — sempre em linha própria, nunca disputando
          espaço com nome, e-mail, celular ou peso. */}
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-0.5">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          Imóvel
        </span>
        {unidades.map((u) => (
          <span
            key={u.id}
            className="group flex items-center gap-1 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-xs"
          >
            {formatUnidade(u)}
            {podeEditar && !votou && (
              <button
                type="button"
                onClick={() => setUnidadeExcluir(u.id)}
                className="text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}

        {/* Quem já votou na assembleia aberta não pode ganhar novo imóvel
            (pedido do Carlos): o peso do voto é congelado no momento do voto,
            mexer nas unidades depois bagunça o encerramento. A trava real está
            no servidor (addUnidadeAction). */}
        {podeEditar && !votou && (showAdd ? (
          <div className="flex items-center gap-1">
            <Input
              placeholder="Nº"
              value={novaUnidade}
              onChange={(e) => setNovaUnidade(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddUnidade()}
              className="h-8 w-20 px-2 text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={() => handleAddUnidade()}
              disabled={isPendingAdd || !novaUnidade.trim()}
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded px-2 text-xs text-primary hover:underline disabled:opacity-40"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setNovaUnidade("") }}
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded px-2 text-xs text-muted-foreground hover:underline"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex min-h-[28px] items-center gap-0.5 rounded border border-dashed border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        ))}

        {/* Quem participou pelo imóvel quando não é o dono do cadastro (co-dono
            presente, ex.: esposa — diferente de procuração). A mesa anota aqui e
            sai no boletim. Só com assembleia aberta + operador E só para quem
            está PRESENTE (pedido do Carlos: ausente não tem participante — quem
            não está na assembleia não tem como alguém participar por ele). */}
        {podeAnotarParticipante &&
          presente &&
          (editandoPart ? (
            <span className="ml-2 flex items-center gap-1">
              <Input
                placeholder="Nome de quem participou"
                value={partInput}
                onChange={(e) => setPartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvarParticipante()
                  if (e.key === "Escape") {
                    setEditandoPart(false)
                    setPartInput(participante)
                  }
                }}
                className="h-8 w-52 px-2 text-xs"
                autoFocus
              />
              <button
                type="button"
                onClick={salvarParticipante}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded px-2 text-xs text-primary hover:underline"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditandoPart(false)
                  setPartInput(participante)
                }}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded px-2 text-xs text-muted-foreground hover:underline"
              >
                ✕
              </button>
            </span>
          ) : participante ? (
            <button
              type="button"
              onClick={() => {
                setPartInput(participante)
                setEditandoPart(true)
              }}
              title="Quem participou pelo imóvel (clique para editar)"
              className="ml-2 flex min-h-[28px] items-center rounded border border-indigo-400/40 bg-indigo-500/10 px-1.5 py-0.5 text-xs text-indigo-700 transition-colors hover:bg-indigo-500/15 dark:text-indigo-300"
            >
              participou: {participante}
            </button>
          ) : (
            // Sem participante ainda: se há cônjuge cadastrado, um atalho de 1
            // toque que anota o cônjuge direto (pedido do Carlos: ganhar tempo —
            // marido/esposa já vêm da planilha). Ao lado, "outro" abre o campo
            // livre pra digitar um nome diferente.
            <span className="ml-2 flex items-center gap-1">
              {conjuge && (
                <button
                  type="button"
                  onClick={() => onSetParticipante(proprietario.id, conjuge)}
                  title={`Anotar ${conjuge} (cônjuge cadastrado) como quem participou`}
                  className="flex min-h-[28px] items-center gap-0.5 rounded border border-indigo-400/40 bg-indigo-500/10 px-1.5 py-0.5 text-xs text-indigo-700 transition-colors hover:bg-indigo-500/15 dark:text-indigo-300"
                >
                  <Plus className="h-3 w-3" />
                  {conjuge}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPartInput("")
                  setEditandoPart(true)
                }}
                title="Anotar quem participou pelo imóvel (co-dono presente que não é o titular)"
                className="flex min-h-[28px] items-center gap-0.5 rounded border border-dashed border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Plus className="h-3 w-3" />
                {conjuge ? "outro" : "quem participou"}
              </button>
            </span>
          ))}
      </div>

      <ConfirmarSenhaDialog
        open={showExcluir}
        onOpenChange={setShowExcluir}
        titulo="Excluir proprietário"
        descricao={
          <>
            <strong className="text-foreground">{proprietario.nome}</strong> e as unidades
            vinculadas serão removidos. Esta ação não pode ser desfeita.
          </>
        }
        onConfirmar={(senha) => deleteProprietarioAction(proprietario.id, condominioId, senha)}
      />

      <ConfirmarSenhaDialog
        open={showAnular}
        onOpenChange={setShowAnular}
        titulo="Anular voto"
        confirmLabel="Anular voto"
        descricao={
          <>
            O voto de <strong className="text-foreground">{proprietario.nome}</strong> nesta
            assembleia será anulado (some da apuração). A presença e o cadastro continuam. Use para
            corrigir um voto lançado errado ou para depois poder excluir o cadastro.
          </>
        }
        onConfirmar={(senha) => anularVotoAction(proprietario.id, condominioId, senha)}
        onSuccess={() => {
          setShowAnular(false)
          toast.success("Voto anulado.")
        }}
      />

      <ConfirmarSenhaDialog
        open={unidadeExcluir !== null}
        onOpenChange={(o) => !o && setUnidadeExcluir(null)}
        titulo="Remover unidade"
        confirmLabel="Remover"
        descricao={
          <>
            {unidadeAlvo
              ? `A unidade ${formatUnidade(unidadeAlvo)} será desvinculada de `
              : "Esta unidade será desvinculada de "}
            <strong className="text-foreground">{proprietario.nome}</strong>. Esta ação não pode
            ser desfeita.
          </>
        }
        onConfirmar={(senha) =>
          removeUnidadeAction(unidadeExcluir ?? "", condominioId, senha)
        }
        onSuccess={() => setUnidadeExcluir(null)}
      />

      {/* Imóvel já está em OUTRO cadastro (pedido do Carlos): avisa e, se
          confirmar, MOVE (remove do outro) — pra o imóvel não ficar em 2. */}
      <AlertDialog open={moverImovelDe !== null} onOpenChange={(o) => !o && setMoverImovelDe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Imóvel já cadastrado em outro</AlertDialogTitle>
            <AlertDialogDescription>
              O imóvel <strong className="text-foreground">{novaUnidade}</strong> já está no cadastro
              de <strong className="text-foreground">{moverImovelDe}</strong>. Mover para{" "}
              <strong className="text-foreground">{proprietario.nome}</strong>? Ele será removido do
              outro cadastro para não ficar em dois ao mesmo tempo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleAddUnidade(true)} disabled={isPendingAdd}>
              Mover para cá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disparar e-mail só pra esta pessoa (item do menu "⋯"). Confirma porque
          é envio externo que custa e conta no limite diário. O envio roda numa
          transição e o resultado vem por toast; o handleDisparar fecha o diálogo
          quando o envio resolve, igual ao "Mover para cá" acima (o AlertDialogAction
          sozinho NÃO fecha — só o Cancel é um Close). */}
      <AlertDialog open={showDisparar} onOpenChange={setShowDisparar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disparar e-mail</AlertDialogTitle>
            <AlertDialogDescription>
              Enviar o e-mail da assembleia
              {assembleiaAbertaTitulo ? (
                <>
                  {" "}
                  <strong className="text-foreground">{assembleiaAbertaTitulo}</strong>
                </>
              ) : null}{" "}
              para <strong className="text-foreground">{proprietario.nome}</strong>
              {proprietario.email ? ` (${proprietario.email})` : ""}? Ele recebe o link de votação
              de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisparando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDisparar()} disabled={isDisparando}>
              Disparar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
