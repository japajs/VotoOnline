import type { AssembleiaStatus } from "@/types"

// Fonte única de rótulo/cor por status de assembleia — antes duplicado em
// components/assembleias/assembleias-list.tsx,
// components/dashboard/recent-surveys-table.tsx,
// components/assembleias/apuracao-assembleia.tsx e lib/relatorios/utils.ts.
// Adicionar um status novo (ex.: a "pausada" desta mesma leva de mudanças)
// agora é uma edição neste arquivo, não uma caça a 4 lugares.
export const ASSEMBLEIA_STATUS_LABEL: Record<AssembleiaStatus, string> = {
  rascunho: "Rascunho",
  aberta: "Aberta",
  pausada: "Pausada",
  encerrada: "Encerrada",
}

export const ASSEMBLEIA_STATUS_CLASS: Record<AssembleiaStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aberta: "bg-emerald-500/15 text-emerald-500",
  pausada: "bg-amber-500/15 text-amber-500",
  encerrada: "bg-rose-500/15 text-rose-500",
}

// "Em votação" não é um status novo no banco — é só "aberta" + já tem pelo
// menos um voto, derivado na exibição (ver components/assembleias/
// apuracao-assembleia.tsx). Vive aqui pra reusar os mapas acima sem
// duplicá-los.
export type StatusExibido = AssembleiaStatus | "em_votacao"

export const STATUS_EXIBIDO_LABEL: Record<StatusExibido, string> = {
  ...ASSEMBLEIA_STATUS_LABEL,
  em_votacao: "Em votação",
}

export const STATUS_EXIBIDO_CLASS: Record<StatusExibido, string> = {
  ...ASSEMBLEIA_STATUS_CLASS,
  em_votacao: "bg-indigo-500/15 text-indigo-500",
}

// Grupo "em andamento": ainda uma votação ativa pra fins operacionais
// (travar transferência de unidade/troca de critério de peso, contar como
// "precisa de atenção" no dashboard) — inclui "pausada", que é só uma
// interrupção temporária, não o fim da votação. Ver hasAssembleiaAberta em
// services/assembleias.ts e getResumoPorCondominio em services/dashboard.ts.
// Array exportado separadamente pra quem precisa passar pro `.in()` de uma
// query (ex.: hasAssembleiaAberta) sem duplicar a lista de status.
export const STATUS_EM_ANDAMENTO: AssembleiaStatus[] = ["aberta", "pausada"]

export function isEmAndamento(status: AssembleiaStatus): boolean {
  return (STATUS_EM_ANDAMENTO as string[]).includes(status)
}

// Grupo "votável": só "aberta" aceita voto novo — "pausada" e "rascunho"
// não, cada uma por um motivo diferente (pausa deliberada vs. votação que
// ainda não começou). Ver validarVotoOuFalhar em services/assembleia-votos.ts.
export function isVotacaoAberta(status: AssembleiaStatus): boolean {
  return status === "aberta"
}
