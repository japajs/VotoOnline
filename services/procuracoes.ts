import { createServerClient } from "@/lib/supabase/server"
import type { Procuracao, ProcuracaoComNomes } from "@/types"

function rowToProcuracao(row: {
  id: string
  assembleia_id: string
  outorgante_id: string
  outorgado_id: string
  created_at: string
}): Procuracao {
  return {
    id: row.id,
    assembleia_id: row.assembleia_id,
    outorgante_id: row.outorgante_id,
    outorgado_id: row.outorgado_id,
    created_at: row.created_at,
  }
}

// Auditoria de assembleias — Fase 8: alguém já votou nesta assembleia se
// tem um assembleia_sends com votado_em preenchido — mesmo sinal usado em
// toda parte do sistema (ver getSendsNaoVotaram, hasVotosRegistrados).
async function proprietarioJaVotou(
  db: ReturnType<typeof createServerClient>,
  assembleiaId: string,
  proprietarioId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("assembleia_sends")
    .select("id")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", proprietarioId)
    .not("votado_em", "is", null)
    .limit(1)

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export async function getProcuracoesByAssembleia(assembleiaId: string): Promise<ProcuracaoComNomes[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("procuracoes")
    .select("id, assembleia_id, outorgante_id, outorgado_id, created_at, outorgante:outorgante_id(nome), outorgado:outorgado_id(nome)")
    .eq("assembleia_id", assembleiaId)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    assembleia_id: string
    outorgante_id: string
    outorgado_id: string
    created_at: string
    outorgante: { nome: string } | null
    outorgado: { nome: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...rowToProcuracao(r),
    outorgante_nome: r.outorgante?.nome ?? "—",
    outorgado_nome: r.outorgado?.nome ?? "—",
  }))
}

// Usado na hora do voto (createAssembleiaRespostas) pra somar o peso de
// quem delegou pra este proprietário nesta assembleia — retorna os ids
// dos outorgantes, não os nomes (o peso é calculado a partir das unidades
// deles, buscadas separadamente).
export async function getOutorgantesIds(assembleiaId: string, outorgadoId: string): Promise<string[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("procuracoes")
    .select("outorgante_id")
    .eq("assembleia_id", assembleiaId)
    .eq("outorgado_id", outorgadoId)

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.outorgante_id as string)
}

// Usado em validarVotoOuFalhar (services/assembleia-votos.ts) pra impedir
// que quem já delegou o voto vote também por conta própria — o peso dele
// já vai ser contado no voto do outorgado.
export async function outorgouProcuracao(assembleiaId: string, outorganteId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("procuracoes")
    .select("id")
    .eq("assembleia_id", assembleiaId)
    .eq("outorgante_id", outorganteId)
    .limit(1)

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export async function createProcuracao(
  assembleiaId: string,
  outorganteId: string,
  outorgadoId: string
): Promise<Procuracao> {
  if (outorganteId === outorgadoId) {
    throw new Error("Um proprietário não pode outorgar procuração pra si mesmo.")
  }

  const db = createServerClient()

  // Sem isso, um inadimplente (bloqueado de votar por conta própria — ver
  // validarVotoOuFalhar em services/assembleia-votos.ts) outorgaria
  // procuração pra outro proprietário ANTES de ser barrado, e o peso da
  // unidade dele seria somado no voto do outorgado mesmo assim — furo que
  // contornaria por completo a regra "sem exceção" do Código Civil.
  const { data: proprietariosRows, error: proprietariosError } = await db
    .from("proprietarios")
    .select("id, inadimplente")
    .in("id", [outorganteId, outorgadoId])
  if (proprietariosError) throw new Error(proprietariosError.message)

  const inadimplentes = new Set(
    ((proprietariosRows ?? []) as { id: string; inadimplente: boolean }[])
      .filter((p) => p.inadimplente)
      .map((p) => p.id)
  )
  if (inadimplentes.has(outorganteId)) {
    throw new Error("Proprietário inadimplente não pode outorgar procuração.")
  }
  if (inadimplentes.has(outorgadoId)) {
    throw new Error("Proprietário inadimplente não pode receber procuração (ele mesmo não pode votar).")
  }

  const [outorganteVotou, outorgadoVotou] = await Promise.all([
    proprietarioJaVotou(db, assembleiaId, outorganteId),
    proprietarioJaVotou(db, assembleiaId, outorgadoId),
  ])

  // Mesma filosofia de sempre no sistema: peso é congelado no momento do
  // voto, nunca recalculado depois (ver lib/peso.ts). Se qualquer um dos
  // dois já votou, criar a procuração agora deixaria o peso de alguém
  // inconsistente com o que já foi (ou vai ser) congelado.
  if (outorganteVotou) {
    throw new Error("Este proprietário já votou nesta assembleia e não pode mais outorgar procuração.")
  }
  if (outorgadoVotou) {
    throw new Error("Este representante já votou nesta assembleia — a procuração não teria efeito no peso já registrado.")
  }

  const { data, error } = await db
    .from("procuracoes")
    .insert({ assembleia_id: assembleiaId, outorgante_id: outorganteId, outorgado_id: outorgadoId })
    .select()
    .single()

  if (error) {
    if (error.message.toLowerCase().includes("unique") || error.code === "23505") {
      throw new Error("Este proprietário já outorgou procuração pra outra pessoa nesta assembleia.")
    }
    throw new Error(error.message)
  }
  return rowToProcuracao(data)
}

export async function deleteProcuracao(id: string): Promise<void> {
  const db = createServerClient()

  const { data: procuracao, error: fetchError } = await db
    .from("procuracoes")
    .select("assembleia_id, outorgante_id, outorgado_id")
    .eq("id", id)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  const row = procuracao as { assembleia_id: string; outorgante_id: string; outorgado_id: string }
  const [outorganteVotou, outorgadoVotou] = await Promise.all([
    proprietarioJaVotou(db, row.assembleia_id, row.outorgante_id),
    proprietarioJaVotou(db, row.assembleia_id, row.outorgado_id),
  ])
  if (outorganteVotou || outorgadoVotou) {
    throw new Error("Não é possível remover: um dos dois lados já votou nesta assembleia.")
  }

  const { error } = await db.from("procuracoes").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
