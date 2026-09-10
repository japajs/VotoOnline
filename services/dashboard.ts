import { createServerClient } from "@/lib/supabase/server"
import type { AssembleiaStatus, CondoDashboardStats, AssembleiaRecente, CondominioResumo } from "@/types"

// Prioridade de exibição no painel operacional (dashboard): abertas antes de
// encerradas, para o operador ver primeiro o que ainda exige ação.
const STATUS_PRIORIDADE: Record<AssembleiaStatus, number> = {
  aberta: 0,
  pausada: 1,
  rascunho: 2,
  encerrada: 3,
}

// `condominioIds` filtra o resultado quando informado — usado para usuários
// PESSOAL (acesso_total = false), que só devem ver os totais dos condomínios
// vinculados em usuario_condominios. `undefined` (padrão) mantém o
// comportamento de sempre: MASTER/usuário antigo continua vendo o total do
// sistema inteiro. Mesma convenção de getAllCondominios (services/condominios.ts).
export async function getCondoDashboardStats(condominioIds?: string[]): Promise<CondoDashboardStats> {
  const db = createServerClient()

  if (condominioIds && condominioIds.length === 0) {
    return { total_condominios: 0, total_proprietarios: 0, total_unidades: 0, total_assembleias: 0 }
  }

  let condosQuery = db.from("condominios").select("*", { count: "exact", head: true })
  let propsQuery = db.from("proprietarios").select("*", { count: "exact", head: true })
  let unidsQuery = db.from("unidades").select("*", { count: "exact", head: true })
  let assembleiaQuery = db.from("assembleias").select("*", { count: "exact", head: true })

  if (condominioIds) {
    condosQuery = condosQuery.in("id", condominioIds)
    propsQuery = propsQuery.in("condominio_id", condominioIds)
    unidsQuery = unidsQuery.in("condominio_id", condominioIds)
    assembleiaQuery = assembleiaQuery.in("condominio_id", condominioIds)
  }

  const [condosRes, propsRes, unidsRes, assembleiaRes] = await Promise.all([
    condosQuery,
    propsQuery,
    unidsQuery,
    assembleiaQuery,
  ])

  return {
    total_condominios: condosRes.count ?? 0,
    total_proprietarios: propsRes.count ?? 0,
    total_unidades: unidsRes.count ?? 0,
    total_assembleias: assembleiaRes.count ?? 0,
  }
}

// Resumo por condomínio: quantos proprietários, unidades e assembleias
// abertas cada um tem — pra dar visão individual, não só o total agregado do
// sistema inteiro (que não ajuda a achar qual condomínio precisa de atenção).
export async function getResumoPorCondominio(condominioIds?: string[]): Promise<CondominioResumo[]> {
  const db = createServerClient()

  if (condominioIds && condominioIds.length === 0) return []

  let condQuery = db.from("condominios").select("id, nome").order("nome", { ascending: true })
  let propQuery = db.from("proprietarios").select("condominio_id")
  let unidQuery = db.from("unidades").select("condominio_id")
  let assembQuery = db.from("assembleias").select("condominio_id, status")

  if (condominioIds) {
    condQuery = condQuery.in("id", condominioIds)
    propQuery = propQuery.in("condominio_id", condominioIds)
    unidQuery = unidQuery.in("condominio_id", condominioIds)
    assembQuery = assembQuery.in("condominio_id", condominioIds)
  }

  const [condRes, propRes, unidRes, assembRes] = await Promise.all([
    condQuery,
    propQuery,
    unidQuery,
    assembQuery,
  ])

  if (condRes.error) throw new Error(condRes.error.message)
  if (propRes.error) throw new Error(propRes.error.message)
  if (unidRes.error) throw new Error(unidRes.error.message)
  if (assembRes.error) throw new Error(assembRes.error.message)

  const propCount = new Map<string, number>()
  for (const r of (propRes.data ?? []) as { condominio_id: string }[]) {
    propCount.set(r.condominio_id, (propCount.get(r.condominio_id) ?? 0) + 1)
  }
  const unidCount = new Map<string, number>()
  for (const r of (unidRes.data ?? []) as { condominio_id: string }[]) {
    unidCount.set(r.condominio_id, (unidCount.get(r.condominio_id) ?? 0) + 1)
  }
  // Contadas separadamente (não como um único "em andamento") pra tela
  // poder colorir o badge de "aberta" (verde, votação rolando de verdade)
  // diferente do de "pausada" (âmbar, mesma cor usada em todo o resto do
  // app) — um selo verde só de "aberta" enganaria o operador achando que
  // está recebendo voto quando na verdade está pausada.
  const abertasCount = new Map<string, number>()
  const pausadasCount = new Map<string, number>()
  for (const r of (assembRes.data ?? []) as { condominio_id: string; status: AssembleiaStatus }[]) {
    if (r.status === "aberta") {
      abertasCount.set(r.condominio_id, (abertasCount.get(r.condominio_id) ?? 0) + 1)
    } else if (r.status === "pausada") {
      pausadasCount.set(r.condominio_id, (pausadasCount.get(r.condominio_id) ?? 0) + 1)
    }
  }

  return ((condRes.data ?? []) as { id: string; nome: string }[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    total_proprietarios: propCount.get(c.id) ?? 0,
    total_unidades: unidCount.get(c.id) ?? 0,
    assembleias_abertas: abertasCount.get(c.id) ?? 0,
    assembleias_pausadas: pausadasCount.get(c.id) ?? 0,
  }))
}

// `condominioIds` filtra o resultado quando informado — mesma convenção
// acima (escopo MASTER/PESSOAL).
export async function getRecentAssembleias(
  limit = 6,
  condominioIds?: string[]
): Promise<AssembleiaRecente[]> {
  const db = createServerClient()

  if (condominioIds && condominioIds.length === 0) return []

  let query = db
    .from("assembleias")
    .select("id, titulo, status, created_at, data_encerramento, condominio_id, condominios(nome)")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (condominioIds) query = query.in("condominio_id", condominioIds)

  const { data, error } = await query

  if (error) throw new Error(error.message)

  const assembleiaIds = (data ?? []).map((r) => r.id)

  const sendsByAssembleia = new Map<string, number>()
  const respondidosByAssembleia = new Map<string, number>()

  if (assembleiaIds.length > 0) {
    const { data: sendsData } = await db
      .from("assembleia_sends")
      .select("id, assembleia_id")
      .in("assembleia_id", assembleiaIds)

    const sends = (sendsData ?? []) as { id: string; assembleia_id: string }[]
    for (const s of sends) {
      sendsByAssembleia.set(s.assembleia_id, (sendsByAssembleia.get(s.assembleia_id) ?? 0) + 1)
    }

    const sendIds = sends.map((s) => s.id)
    if (sendIds.length > 0) {
      const { data: responsesData } = await db
        .from("assembleia_respostas")
        .select("send_id")
        .in("send_id", sendIds)

      const sendToAssembleia = new Map(sends.map((s) => [s.id, s.assembleia_id]))
      const counted = new Set<string>()
      for (const r of (responsesData ?? []) as { send_id: string }[]) {
        if (!counted.has(r.send_id)) {
          counted.add(r.send_id)
          const aid = sendToAssembleia.get(r.send_id)
          if (aid) respondidosByAssembleia.set(aid, (respondidosByAssembleia.get(aid) ?? 0) + 1)
        }
      }
    }
  }

  const resultado = (data ?? []).map((row) => ({
    id: row.id,
    titulo: row.titulo,
    status: row.status as AssembleiaStatus,
    created_at: row.created_at,
    data_encerramento: row.data_encerramento,
    condominio_id: row.condominio_id,
    condominio_nome: (row.condominios as unknown as { nome: string } | null)?.nome ?? "—",
    total_enviados: sendsByAssembleia.get(row.id) ?? 0,
    total_respondidos: respondidosByAssembleia.get(row.id) ?? 0,
  }))

  // Ordena por prioridade operacional, não por data: abertas primeiro, depois
  // menor participação (quem mais precisa de acompanhamento), e por último a
  // data de encerramento mais próxima como desempate.
  resultado.sort((a, b) => {
    const statusDiff = STATUS_PRIORIDADE[a.status] - STATUS_PRIORIDADE[b.status]
    if (statusDiff !== 0) return statusDiff

    const pctA = a.total_enviados > 0 ? a.total_respondidos / a.total_enviados : 0
    const pctB = b.total_enviados > 0 ? b.total_respondidos / b.total_enviados : 0
    if (pctA !== pctB) return pctA - pctB

    const dateA = a.data_encerramento ? new Date(a.data_encerramento).getTime() : Infinity
    const dateB = b.data_encerramento ? new Date(b.data_encerramento).getTime() : Infinity
    return dateA - dateB
  })

  return resultado
}
