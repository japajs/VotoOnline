"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronLeft, ChevronRight, Flag } from "lucide-react"
import { cn } from "@/lib/utils"
import { ASSEMBLEIA_STATUS_CLASS, ASSEMBLEIA_STATUS_LABEL } from "@/lib/assembleia-status"
import type { AssembleiaCalendario, AssembleiaStatus } from "@/types"

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

// Chave "YYYY-MM-DD" no fuso America/Sao_Paulo — mesmo fuso usado em todo
// formatDate do sistema, pra um evento não cair no dia errado pra quem
// acessa o calendário de outro fuso horário.
function chaveDiaBR(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

function chaveDiaGrade(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Grade de 6 semanas (42 dias) começando no domingo anterior (ou igual) ao
// dia 1 do mês, preenchendo com dias do mês anterior/seguinte pra fechar as
// linhas — eles ficam esmaecidos (noMes: false) mas continuam clicáveis.
function construirGrade(ano: number, mes: number) {
  const primeiroDia = new Date(ano, mes, 1)
  const offsetInicio = primeiroDia.getDay()
  const inicioGrade = new Date(ano, mes, 1 - offsetInicio)

  const dias: { date: Date; chave: string; noMes: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioGrade)
    d.setDate(inicioGrade.getDate() + i)
    dias.push({ date: d, chave: chaveDiaGrade(d), noMes: d.getMonth() === mes })
  }
  return dias
}

type Evento = {
  assembleiaId: string
  condominioId: string
  titulo: string
  condominioNome: string
  status: AssembleiaStatus
  tipo: "convocacao" | "encerramento"
}

interface Props {
  assembleias: AssembleiaCalendario[]
}

export function CalendarioAssembleias({ assembleias }: Props) {
  // "Hoje" é sempre o dia no fuso America/Sao_Paulo, não o do navegador de
  // quem acessa — mesma base dos eventos (chaveDiaBR), pra "hoje" e os
  // eventos do dia nunca discordarem sobre qual dia é hoje.
  const chaveHoje = useMemo(() => chaveDiaBR(new Date().toISOString()), [])
  const [anoHoje, mesHoje] = useMemo(() => {
    const [y, m] = chaveHoje.split("-").map(Number)
    return [y, m - 1] as const
  }, [chaveHoje])

  const [ano, setAno] = useState(anoHoje)
  const [mes, setMes] = useState(mesHoje)

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>()
    function add(iso: string | null, tipo: Evento["tipo"], a: AssembleiaCalendario) {
      if (!iso) return
      const chave = chaveDiaBR(iso)
      const lista = mapa.get(chave) ?? []
      lista.push({
        assembleiaId: a.id,
        condominioId: a.condominio_id,
        titulo: a.titulo,
        condominioNome: a.condominio_nome,
        status: a.status,
        tipo,
      })
      mapa.set(chave, lista)
    }
    for (const a of assembleias) {
      add(a.data_1a_convocacao, "convocacao", a)
      add(a.data_encerramento, "encerramento", a)
    }
    return mapa
  }, [assembleias])

  const dias = useMemo(() => construirGrade(ano, mes), [ano, mes])
  const semEventos = assembleias.every((a) => !a.data_1a_convocacao && !a.data_encerramento)

  function irParaMesAnterior() {
    if (mes === 0) {
      setAno((a) => a - 1)
      setMes(11)
    } else {
      setMes((m) => m - 1)
    }
  }
  function irParaProximoMes() {
    if (mes === 11) {
      setAno((a) => a + 1)
      setMes(0)
    } else {
      setMes((m) => m + 1)
    }
  }
  function irParaHoje() {
    setAno(anoHoje)
    setMes(mesHoje)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={irParaMesAnterior}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="w-40 text-center text-sm font-semibold sm:w-48">
            {MESES[mes]} de {ano}
          </h2>
          <button
            type="button"
            onClick={irParaProximoMes}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={irParaHoje}
            className="ml-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            Hoje
          </button>
        </div>

        {/* Legenda: o que cada ícone representa nas células abaixo. */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> 1ª convocação
          </span>
          <span className="flex items-center gap-1">
            <Flag className="h-3 w-3" /> Encerramento da votação
          </span>
        </div>
      </div>

      {/* Rolagem horizontal em telas estreitas — mesma solução já usada nas
          tabelas largas do sistema (ex.: detalhamento de votos em
          resultado-assembleia.tsx) — em vez de espremer 7 colunas até
          ficarem ilegíveis num celular. */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-border/60 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {dias.map(({ date, chave, noMes }) => {
              const eventos = eventosPorDia.get(chave) ?? []
              const isHoje = chave === chaveHoje
              return (
                <div
                  key={chave}
                  className={cn(
                    "min-h-24 border-b border-r border-border/40 p-1.5 sm:min-h-28",
                    !noMes && "bg-muted/20"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      isHoje ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
                      !noMes && "opacity-40"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {eventos.map((ev, i) => (
                      <Link
                        key={`${ev.assembleiaId}-${ev.tipo}-${i}`}
                        href={`/condominios/${ev.condominioId}/assembleias/${ev.assembleiaId}`}
                        title={`${ev.tipo === "convocacao" ? "1ª convocação" : "Encerramento da votação"} · ${ev.titulo} (${ev.condominioNome}) · ${ASSEMBLEIA_STATUS_LABEL[ev.status]}`}
                        className={cn(
                          "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight hover:opacity-80",
                          ASSEMBLEIA_STATUS_CLASS[ev.status]
                        )}
                      >
                        {ev.tipo === "convocacao" ? (
                          <CalendarClock className="h-2.5 w-2.5 shrink-0" />
                        ) : (
                          <Flag className="h-2.5 w-2.5 shrink-0" />
                        )}
                        <span className="truncate">{ev.titulo}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {semEventos && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma assembleia com data de 1ª convocação ou encerramento cadastrada ainda.
        </p>
      )}
    </div>
  )
}
