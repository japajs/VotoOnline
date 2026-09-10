"use client"

import { memo, useMemo, useState, useTransition } from "react"
import { Users, Trash2, Plus, X, Search, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  deleteProprietarioAction,
  addUnidadeAction,
  removeUnidadeAction,
} from "@/app/actions/proprietarios"
import { getPesoParticipante } from "@/lib/peso"
import { formatUnidade, menorNumeroUnidade } from "@/lib/unidade-format"
import { formatCelular } from "@/lib/format"
import { EditarProprietarioDialog } from "@/components/proprietarios/editar-proprietario-dialog"
import type { Proprietario, CriterioPeso } from "@/types"

interface ProprietariosListProps {
  proprietarios: Proprietario[]
  condominioId: string
  proprietariosQueJaVotaram?: Set<string>
  isAdmin?: boolean
  criterioPeso?: CriterioPeso
}

function formatPeso(peso: number, criterioPeso: CriterioPeso): string {
  if (criterioPeso === "fracao_ideal") return `${(peso * 100).toFixed(4)}%`
  return `${peso} ${peso === 1 ? "voto" : "votos"}`
}

type Ordenacao = "nome" | "unidade"

// Mesma grade de colunas usada no cabeçalho e em cada linha, em telas
// grandes (lg+) — é o que garante nome/e-mail/celular/peso/ações alinhados
// verticalmente mesmo com textos de tamanhos bem diferentes entre linhas.
const GRID_COLUNAS = "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_140px_64px_72px]"

// Remove acentos e caixa para a busca não exigir digitação exata
// (ex.: "joao" encontra "João").
// Remove acentos, hífens e espaços — assim buscar "C0502", "C-0502" ou
// "c 0502" encontra a mesma unidade independente de como foi digitado
// (padronização de unidades, item 7), sem restringir buscas por nome (só
// deixa a comparação mais permissiva a espaços/hífens em qualquer campo).
function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]/g, "")
    .toLowerCase()
}

export function ProprietariosList({
  proprietarios,
  condominioId,
  proprietariosQueJaVotaram,
  isAdmin = false,
  criterioPeso = "unidade",
}: ProprietariosListProps) {
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("nome")

  const proprietariosExibidos = useMemo(() => {
    const termo = normalizarBusca(busca.trim())
    const filtrados = !termo
      ? proprietarios
      : proprietarios.filter((p) => {
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
  }, [proprietarios, busca, ordenacao])

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
                isAdmin={isAdmin}
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
  isAdmin,
  criterioPeso,
}: {
  proprietario: Proprietario
  condominioId: string
  todosProprietarios: Proprietario[]
  jaVotou: boolean
  isAdmin: boolean
  criterioPeso: CriterioPeso
}) {
  const [novaUnidade, setNovaUnidade] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [isPendingDelete, startDeleteTransition] = useTransition()
  const [isPendingAdd, startAddTransition] = useTransition()
  const [isPendingRemove, startRemoveTransition] = useTransition()

  const peso = getPesoParticipante(proprietario, criterioPeso)
  const unidades = proprietario.unidades ?? []
  const celular = proprietario.telefone ? formatCelular(proprietario.telefone) : null

  function handleDeleteProprietario() {
    if (!confirm(`Excluir "${proprietario.nome}"? As unidades vinculadas também serão removidas.`)) return
    startDeleteTransition(async () => {
      const result = await deleteProprietarioAction(proprietario.id, condominioId)
      if (!result.success) toast.error(result.error)
    })
  }

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

  function handleRemoveUnidade(unidadeId: string) {
    startRemoveTransition(async () => {
      const result = await removeUnidadeAction(unidadeId, condominioId)
      if (!result.success) toast.error(result.error)
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
        onClick={handleDeleteProprietario}
        disabled={isPendingDelete}
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
          <span className="truncate">{proprietario.nome}</span>
          {proprietario.inadimplente && (
            <span
              className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
              title="Inadimplente — não pode votar"
            >
              Inadimplente
            </span>
          )}
        </p>

        {/* Sempre 3 filhos diretos (mesmo quando falta e-mail/celular) — com
            `lg:contents` eles viram itens da grade do pai, um por coluna;
            se um filho sumisse condicionalmente, os seguintes deslizariam
            para a coluna errada. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground lg:contents">
          <span className="min-w-0 truncate lg:text-sm">{proprietario.email || "—"}</span>
          <span className="min-w-0 shrink-0 truncate lg:text-sm">{celular ?? "—"}</span>
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

        <div className="flex shrink-0 items-center gap-1 lg:justify-end">{acoes}</div>
      </div>

      {/* Linha 2: unidades — sempre em linha própria, nunca disputando
          espaço com nome, e-mail, celular ou peso. */}
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-0.5">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          Apto
        </span>
        {unidades.map((u) => (
          <span
            key={u.id}
            className="group flex items-center gap-1 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[11px]"
          >
            {formatUnidade(u)}
            <button
              type="button"
              onClick={() => handleRemoveUnidade(u.id)}
              disabled={isPendingRemove}
              className="text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        {showAdd ? (
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
        )}
      </div>
    </div>
  )
})
