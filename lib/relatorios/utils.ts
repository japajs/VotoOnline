import { ASSEMBLEIA_STATUS_LABEL } from "@/lib/assembleia-status"

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
