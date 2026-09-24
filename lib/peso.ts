import type { CriterioPeso } from "@/types"

// Peso de um proprietário, calculado a partir das unidades vinculadas a ele.
// Nunca armazenado no cadastro — sempre recalculado a partir das unidades
// atuais, para que vendas/compras de apartamento reflitam automaticamente em
// qualquer pesquisa futura sem exigir nenhuma atualização manual.
//
// Depende de condominios.criterio_peso (ver auditoria de assembleias — Fase 1):
// "unidade" (padrão/histórico) = 1 unidade = peso 1, sempre. "fracao_ideal" =
// soma de unidades.fracao_ideal, a regra padrão de condomínio no Brasil salvo
// disposição diversa na convenção. Unidade sem fracao_ideal preenchida conta
// como 0 nesse modo — cabe à tela de cadastro avisar que falta preencher.
//
// Exceção: uma vez que um voto é registrado, o peso usado NAQUELE voto é
// congelado em `assembleia_respostas.peso` (ver services/assembleia-votos.ts)
// — transferências de unidade depois do voto nunca alteram um resultado já
// apurado. Esta função só serve para peso "ao vivo" (antes de votar, ou para
// exibição fora do contexto de uma votação específica).
export function getPesoParticipante(
  proprietario: { unidades?: { fracao_ideal?: number | null }[] },
  criterioPeso: CriterioPeso = "unidade"
): number {
  const unidades = proprietario.unidades ?? []
  if (criterioPeso === "fracao_ideal") {
    return unidades.reduce((soma, u) => soma + (u.fracao_ideal ?? 0), 0)
  }
  return unidades.length
}

// Peso total do condomínio inteiro (todas as unidades de todos os
// proprietários, independente de quem foi convidado pra uma assembleia) —
// é o denominador do quórum mínimo (assembleias.quorum_minimo). Precisa ser
// TODAS as unidades do condomínio, não só as de quem recebeu convite —
// senão um proprietário sem e-mail cadastrado infla artificialmente o
// percentual de quórum atingido.
export function getPesoTotalCondominio(
  unidades: { fracao_ideal?: number | null }[],
  criterioPeso: CriterioPeso = "unidade"
): number {
  if (criterioPeso === "fracao_ideal") {
    return unidades.reduce((soma, u) => soma + (u.fracao_ideal ?? 0), 0)
  }
  return unidades.length
}

// Auditoria de assembleias — Fase 2: 1ª/2ª convocação, adaptado pra votação
// assíncrona (por e-mail, ao longo de dias — não uma reunião num instante
// só). "Convocação" aqui não é hora marcada + tolerância; é uma
// DATA-LIMITE (data_1a_convocacao) que decide qual quórum vale.
//
// dataReferencia é o momento que decide 1ª vs 2ª: data_encerramento se a
// assembleia já encerrou (decisão definitiva, congelada), ou "agora" se
// ainda está aberta (visão "ao vivo" de qual convocação está em vigor
// neste instante). Nunca recalculado pra trás depois de encerrada.
//
// data_1a_convocacao null = sem 1ª/2ª convocação configurada — só o
// quorum_minimo único de sempre (Fase 1); convocacaoAplicada fica null
// (não é "1ª convocação", é "essa distinção não existe aqui").
export interface QuorumEfetivoInput {
  quorum_minimo: number | null
  quorum_minimo_2a: number | null
  data_1a_convocacao: string | null
  dataReferencia: Date
}

export interface QuorumEfetivo {
  quorumAplicavel: number | null
  convocacaoAplicada: 1 | 2 | null
}

export function getQuorumEfetivo(input: QuorumEfetivoInput): QuorumEfetivo {
  const { quorum_minimo, quorum_minimo_2a, data_1a_convocacao, dataReferencia } = input

  if (data_1a_convocacao === null) {
    return { quorumAplicavel: quorum_minimo, convocacaoAplicada: null }
  }

  const dentroDa1aConvocacao = dataReferencia.getTime() <= new Date(data_1a_convocacao).getTime()
  return dentroDa1aConvocacao
    ? { quorumAplicavel: quorum_minimo, convocacaoAplicada: 1 }
    : { quorumAplicavel: quorum_minimo_2a, convocacaoAplicada: 2 }
}

// ─── Escala da fração ideal ───────────────────────────────────────────────────
// O sistema inteiro (e-mail de convite, lista de proprietários, resultado,
// PDF) trata fracao_ideal como FRAÇÃO DE 1 — a soma das unidades do
// condomínio dá ≈ 1 — e mostra × 100 como percentual (ex.: 0.00364 → 0,3640%).
// Só que planilha de cadastro real costuma trazer a fração em PORCENTAGEM
// (0.364 = 0,364%, somando ≈ 100) ou até por milésimo (364, somando ≈ 1000).
// Sem converter, o e-mail de convite diria "Seu peso de voto: 36,4%" pra quem
// tem 0,364% — e ninguém perceberia até 200 proprietários receberem.
//
// Retorna o divisor que leva a soma pra escala de fração de 1, ou null se a
// soma não se parece com nenhuma escala conhecida (aí não adivinha — quem
// chama avisa o usuário em vez de converter no chute). Faixas largas de
// propósito: planilha de condomínio real muitas vezes não cobre 100% (áreas
// comuns/lojas fora da lista) ou vem parcial.
export function detectarDivisorEscalaFracaoIdeal(soma: number): number | null {
  if (!Number.isFinite(soma) || soma <= 0) return 1
  if (soma <= 1.5) return 1
  if (soma >= 20 && soma <= 150) return 100
  if (soma >= 200 && soma <= 1500) return 1000
  if (soma >= 2000 && soma <= 15000) return 10000
  return null
}

// Casas decimais: a coluna unidades.fracao_ideal é numeric(14,6).
export function converterEscalaFracaoIdeal(valor: number, divisor: number): number {
  return Math.round((valor / divisor) * 1e6) / 1e6
}
