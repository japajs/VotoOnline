import { ASSEMBLEIA_STATUS_LABEL } from "@/lib/assembleia-status"
import type { CriterioPeso } from "@/types"

export function safeFilename(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60)
}

export function formatDateBR(date: string | null | undefined): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date))
}

export function formatDateTimeBR(date: string | null | undefined): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date))
}

export function pctStr(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "0%"
}

export function statusLabelPT(status: string): string {
  return (ASSEMBLEIA_STATUS_LABEL as Record<string, string>)[status] ?? status
}

export function sendStatusLabelPT(status: string): string {
  return (
    {
      pending: "Pendente",
      sent: "Enviado",
      delivered: "Entregue",
      failed: "Falhou",
    }[status] ?? status
  )
}

// Valor ponderado como aparece nos relatórios: no critério por unidade é a
// contagem de imóveis; por fração ideal é a soma das frações (fração de 1) e
// vira percentual do condomínio ("4,37%"). Antes os relatórios não sabiam o
// critério e imprimiam a fração crua (0.04368) sob um cabeçalho "IMÓVEIS".
export function fmtPonderado(valor: number, criterio: CriterioPeso): string {
  if (criterio === "fracao_ideal") {
    return `${(valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  }
  return String(valor)
}
