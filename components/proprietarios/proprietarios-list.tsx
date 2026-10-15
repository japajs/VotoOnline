"use client"

import { memo, useMemo, useState, useTransition } from "react"
import {
  Users,
  Trash2,
  Plus,
  X,
  Search,
  SlidersHorizontal,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  deleteProprietarioAction,
  addUnidadeAction,
  removeUnidadeAction,
} from "@/app/actions/proprietarios"
import { marcarPresencaAction } from "@/app/actions/presenca"
import { ConfirmarSenhaDialog } from "@/components/ui/confirmar-senha-dialog"
import { getPesoParticipante } from "@/lib/peso"
import { formatUnidade, menorNumeroUnidade } from "@/lib/unidade-format"
import { formatCelular, formatCpf, normalizarBusca } from "@/lib/format"
import { EditarProprietarioDialog } from "@/components/proprietarios/editar-proprietario-dialog"
import type { Proprietario, CriterioPeso } from "@/types"

interface ProprietariosListProps {
  proprietarios: Proprietario[]
  condominioId: string
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
  // Id da assembleia aberta — habilita marcar presença direto na lista (sem
  // abrir a Apuração). undefined = sem assembleia aberta → sem caixa.
  assembleiaAbertaId?: string
  assembleiaAbertaTitulo?: string
  isAdmin?: boolean
  // Visualizador = só leitura: esconde editar/excluir/adicionar/remover unidade.
  podeEditar?: boolean
  criterioPeso?: CriterioPeso
}

type FiltroVoto = "todos" | "presentes" | "votaram" | "parcial" | "nao"

function formatPeso(peso: number, criterioPeso: CriterioPeso): string {
  if (criterioPeso === "fracao_ideal") return `${(peso * 100).toFixed(4)}%`
  return `${peso} ${peso === 1 ? "voto" : "votos"}`
}

type Ordenacao = "nome" | "unidade"

// Mesma grade de colunas usada no cabeçalho e em cada linha, em telas
// grandes (lg+) — é o que garante nome/e-mail/celular/peso/ações alinhados
// verticalmente mesmo com textos de tamanhos bem diferentes entre linhas.
const GRID_COLUNAS = "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_140px_64px_72px]"

export function ProprietariosList({
  proprietarios,
  condominioId,
  proprietariosQueJaVotaram,
  votouNaAberta,
  presentesNaAberta,
  pautasVotadasNaAberta,
  totalPautasVotaveis,
  assembleiaAbertaId,
  assembleiaAbertaTitulo,
  isAdmin = false,
  podeEditar = true,
  criterioPeso = "unidade",
}: ProprietariosListProps) {
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("nome")
  const [filtroVoto, setFiltroVoto] = useState<FiltroVoto>("todos")

  // Presença marcada direto na lista (pedido do Carlos: agilizar a chamada sem
  // abrir a Apuração). Mantemos um estado local semeado do servidor e atualizado
  // de forma otimista — o inicializador só roda na montagem, então as
  // revalidações disparadas pela action não zeram as marcações já feitas.
  const [presentesLocal, setPresentesLocal] = useState<Set<string>>(
    () => new Set(presentesNaAberta)
  )
  const [marcandoId, setMarcandoId] = useState<string | null>(null)
  const podeMarcarPresenca = !!assembleiaAbertaId && podeEditar

  async function handleTogglePresente(proprietarioId: string, presente: boolean) {
    if (!assembleiaAbertaId) return
    setMarcandoId(proprietarioId)
    setPresentesLocal((prev) => {
      const next = new Set(prev)
      if (presente) next.add(proprietarioId)
      else next.delete(proprietarioId)
      return next
    })
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
    setMarcandoId(null)
  }

  // Quem votou em ALGUMAS pautas, mas não em todas as que estavam em votação
  // (voto parcial). Só faz sentido quando há denominador (pautas em votação).
  const parciaisNaAberta = useMemo(() => {
    const s = new Set<string>()
    if (!votouNaAberta || !totalPautasVotaveis) return s
    for (const p of proprietarios) {
      if (!votouNaAberta.has(p.id)) continue
      const votadas = pautasVotadasNaAberta?.get(p.id) ?? 0
      if (votadas < totalPautasVotaveis) s.add(p.id)
    }
    return s
  }, [proprietarios, votouNaAberta, pautasVotadasNaAberta, totalPautasVotaveis])

  const proprietariosExibidos = useMemo(() => {
    const porVoto =
      votouNaAberta && filtroVoto !== "todos"
        ? proprietarios.filter((p) => {
            if (filtroVoto === "presentes") return presentesLocal.has(p.id)
            if (filtroVoto === "votaram") return votouNaAberta.has(p.id)
            if (filtroVoto === "parcial") return parciaisNaAberta.has(p.id)
            // "nao" — presentes que AINDA não votaram (não soma quem nem está
            // na assembleia): pedido do Carlos, "Não votaram = presentes sem
            // voto", não "todos menos os que votaram".
            return presentesLocal.has(p.id) && !votouNaAberta.has(p.id)
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
  }, [proprietarios, busca, ordenacao, filtroVoto, votouNaAberta, presentesLocal, parciaisNaAberta])

  // Totalizações por IMÓVEL, não por pessoa (pedido do Carlos): a assembleia
  // gira em torno do imóvel — um proprietário com 2 imóveis conta como 2
  // (presença, voto e quórum). Os botões abaixo mostram contagem de imóveis;
  // a lista continua uma linha por proprietário.
  const imoveisDe = (p: Proprietario) => p.unidades?.length ?? 0
  const totalImoveis = proprietarios.reduce((n, p) => n + imoveisDe(p), 0)
  const nVotaram = votouNaAberta
    ? proprietarios.reduce((n, p) => n + (votouNaAberta.has(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  const nParcial = votouNaAberta
    ? proprietarios.reduce((n, p) => n + (parciaisNaAberta.has(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  const nPresentes = votouNaAberta
    ? proprietarios.reduce((n, p) => n + (presentesLocal.has(p.id) ? imoveisDe(p) : 0), 0)
    : 0
  // "Não votaram" = imóveis de quem está PRESENTE e ainda não votou (pedido do
  // Carlos). Antes era total − votaram, que somava também quem nem participou
  // da assembleia — número sem sentido para a gestão cobrar quem falta votar.
  const nNao = votouNaAberta
    ? proprietarios.reduce(
        (n, p) => n + (presentesLocal.has(p.id) && !votouNaAberta.has(p.id) ? imoveisDe(p) : 0),
        0
      )
    : 0

  if (proprietarios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
        <Users className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nenhum proprietário cadastrado ainda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Painel de ferramentas — fundo e borda diferentes da listagem abaixo,
          para deixar claro à primeira vista que esta área serve para
          localizar/organizar registros, não faz parte da tabela em si. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/80 sm:pr-1">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Buscar e ordenar
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
        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
          aria-label="Ordenar por"
          className="h-12 shrink-0 rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground sm:w-44"
        >
          <option value="nome">Ordenar por Nome</option>
          <option value="unidade">Ordenar por Unidade</option>
        </select>
      </div>

      {/* Filtro por voto na assembleia aberta (pedido do Carlos): ver quem já
          votou direto aqui, sem ir à apuração, pra cobrar quem falta. */}
      {votouNaAberta && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Votação de{" "}
            <span className="font-medium text-foreground">{assembleiaAbertaTitulo}</span> — totais por{" "}
            <span className="font-medium text-foreground">imóvel</span>.
          </p>
          <div className="flex flex-wrap gap-1">
            {(() => {
              const chips: [FiltroVoto, string, number][] = [
                ["todos", "Total", totalImoveis],
                ["presentes", "Presentes", nPresentes],
                ["votaram", "Votaram", nVotaram],
              ]
              // "Parcial" só aparece quando há alguém nessa situação — evita
              // poluir a barra quando todo mundo votou em tudo (ou ninguém).
              if (nParcial > 0) chips.push(["parcial", "Parcial", nParcial])
              chips.push(["nao", "Não votaram", nNao])
              return chips
            })().map(([val, label, count]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFiltroVoto(val)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filtroVoto === val
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:bg-accent/40"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {proprietariosExibidos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum proprietário encontrado para &quot;{busca}&quot;.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card">
          {/* Cabeçalho de colunas — só faz sentido a partir de lg, onde a
              grade de colunas entra em vigor. */}
          <div
            className={`hidden border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 lg:grid lg:gap-3 ${GRID_COLUNAS}`}
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
                mostrarVoto={!!votouNaAberta}
                votou={votouNaAberta?.has(p.id) ?? false}
                parcial={parciaisNaAberta.has(p.id)}
                pautasVotadas={pautasVotadasNaAberta?.get(p.id) ?? 0}
                totalPautas={totalPautasVotaveis ?? 0}
                mostrarPresenca={podeMarcarPresenca}
                presente={presentesLocal.has(p.id)}
                marcandoPresenca={marcandoId === p.id}
                onTogglePresente={handleTogglePresente}
                isAdmin={isAdmin}
                podeEditar={podeEditar}
                criterioPeso={criterioPeso}
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
  mostrarPresenca,
  presente,
  marcandoPresenca,
  onTogglePresente,
  isAdmin,
  podeEditar,
  criterioPeso,
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
  mostrarPresenca: boolean
  presente: boolean
  marcandoPresenca: boolean
  onTogglePresente: (proprietarioId: string, presente: boolean) => void
  isAdmin: boolean
  podeEditar: boolean
  criterioPeso: CriterioPeso
}) {
  const [novaUnidade, setNovaUnidade] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [showExcluir, setShowExcluir] = useState(false)
  const [unidadeExcluir, setUnidadeExcluir] = useState<string | null>(null)
  const [isPendingAdd, startAddTransition] = useTransition()

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

  function handleAddUnidade() {
    if (!novaUnidade.trim()) return
    startAddTransition(async () => {
      const result = await addUnidadeAction(proprietario.id, condominioId, novaUnidade)
      if (result.success) {
        setNovaUnidade("")
        setShowAdd(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  const acoes = (
    <>
      <EditarProprietarioDialog
        proprietario={proprietario}
        condominioId={condominioId}
        todosProprietarios={todosProprietarios}
        jaVotou={jaVotou}
        isAdmin={isAdmin}
        criterioPeso={criterioPeso}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowExcluir(true)}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="sr-only">Excluir proprietário</span>
      </Button>
    </>
  )

  return (
    <div className="px-3 py-1.5">
      {/* Linha 1 — abaixo de lg: empilhado em duas sub-linhas (nome+ações,
          depois e-mail/celular/peso). A partir de lg: uma única linha em
          grade de colunas alinhadas com o cabeçalho. */}
      <div className={`grid grid-cols-1 gap-1 lg:items-center lg:gap-3 ${GRID_COLUNAS}`}>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold lg:font-medium">
          {mostrarPresenca && (
            <button
              type="button"
              onClick={() => onTogglePresente(proprietario.id, !presente)}
              disabled={marcandoPresenca}
              aria-pressed={presente}
              title={presente ? "Presente — toque para desmarcar" : "Marcar presente"}
              className={`flex min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                presente
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
              className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
              title="Inadimplente — não pode votar"
            >
              Inadimplente
            </span>
          )}
          {/* Três estados (pedido do Carlos): "Não votou" (cinza), "Parcial
              X/Y" (âmbar — votou em algumas pautas, falta terminar) e "Votou"
              (verde — votou em todas as pautas em votação). */}
          {mostrarVoto &&
            (!votou ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Não votou
              </span>
            ) : parcial ? (
              <span
                className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                title={`Votou em ${pautasVotadas} de ${totalPautas} ${totalPautas === 1 ? "pauta" : "pautas"} em votação — ainda falta votar`}
              >
                Parcial{totalPautas > 0 ? ` ${pautasVotadas}/${totalPautas}` : ""}
              </span>
            ) : (
              <span
                className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                title="Votou em todas as pautas em votação"
              >
                Votou
              </span>
            ))}
        </p>

        {/* Sempre 3 filhos diretos (mesmo quando falta e-mail/celular) — com
            `lg:contents` eles viram itens da grade do pai, um por coluna;
            se um filho sumisse condicionalmente, os seguintes deslizariam
            para a coluna errada. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground lg:contents">
          {/* E-mail com o CPF logo abaixo: o operador confere rápido o CPF
              quando alguém diz que o link de entrada acusou "CPF ou unidade
              inválida" (pedido do Carlos). Mantém-se 3 filhos diretos pro
              lg:contents distribuir nas colunas certas. */}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">{proprietario.email || "—"}</span>
            {cpfFmt && (
              <span className="truncate text-xs text-muted-foreground/70">CPF {cpfFmt}</span>
            )}
          </div>
          <span className="min-w-0 shrink-0 truncate">{celular ?? "—"}</span>
          <span
            className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary lg:ml-0 lg:w-fit"
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
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          Imóvel
        </span>
        {unidades.map((u) => (
          <span
            key={u.id}
            className="group flex items-center gap-1 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[11px]"
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
              onClick={handleAddUnidade}
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
            className="flex min-h-[28px] items-center gap-0.5 rounded border border-dashed border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
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
    </div>
  )
})
