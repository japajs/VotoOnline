import { createServerClient } from "@/lib/supabase/server"
import type { Condominio } from "@/types"

type DbRow = {
  id: string
  nome: string
  cnpj: string | null
  endereco: string | null
  sindico_nome: string | null
  sindico_contato: string | null
  criterio_peso: Condominio["criterio_peso"]
  created_at: string
}

function rowToCondominio(row: DbRow): Condominio {
  return {
    id: row.id,
    nome: row.nome,
    cnpj: row.cnpj ?? null,
    endereco: row.endereco,
    sindico_nome: row.sindico_nome,
    sindico_contato: row.sindico_contato,
    criterio_peso: row.criterio_peso,
    created_at: row.created_at,
  }
}

// `condominioIds` filtra o resultado quando informado — usado para usuários
// PESSOAL (acesso_total = false), que só devem ver os condomínios vinculados
// em usuario_condominios. `undefined` (padrão) mantém o comportamento de
// sempre: MASTER/usuário antigo continua vendo todos.
export async function getAllCondominios(condominioIds?: string[]): Promise<Condominio[]> {
  const db = createServerClient()
  let query = db.from("condominios").select("*").order("nome", { ascending: true })

  if (condominioIds) {
    if (condominioIds.length === 0) return []
    query = query.in("id", condominioIds)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => rowToCondominio(r as DbRow))
}

export async function getCondominioById(id: string): Promise<Condominio | null> {
  const db = createServerClient()
  const { data, error } = await db.from("condominios").select("*").eq("id", id).single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(error.message)
  }
  return rowToCondominio(data as DbRow)
}

export async function createCondominio(input: Pick<Condominio, "nome">): Promise<Condominio> {
  const db = createServerClient()
  const { data, error } = await db
    .from("condominios")
    .insert({ nome: input.nome })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToCondominio(data as DbRow)
}

export async function updateCondominio(
  id: string,
  input: Pick<Condominio, "nome">
): Promise<Condominio> {
  const db = createServerClient()
  const { data, error } = await db
    .from("condominios")
    .update({ nome: input.nome })
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToCondominio(data as DbRow)
}

export async function updateCondominioInfo(
  id: string,
  input: {
    cnpj?: string | null
    endereco?: string | null
    sindico_nome?: string | null
    sindico_contato?: string | null
    criterio_peso?: Condominio["criterio_peso"]
  }
): Promise<Condominio> {
  const db = createServerClient()
  const { data, error } = await db
    .from("condominios")
    .update(input)
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToCondominio(data as DbRow)
}

// Auditoria funcional: exclusão de condomínio apaga em cascata (FK do banco)
// todas as assembleias, pautas e votos daquele condomínio — inclusive de
// assembleias já encerradas. Por isso, um condomínio com qualquer voto
// registrado não pode ser excluído, para preservar o histórico de votação.
export async function deleteCondominio(id: string): Promise<void> {
  const db = createServerClient()

  const { data: assembleiasDoCondominio, error: assembleiasError } = await db
    .from("assembleias")
    .select("id")
    .eq("condominio_id", id)

  if (assembleiasError) throw new Error(assembleiasError.message)
  const assembleiaIds = (assembleiasDoCondominio ?? []).map((a) => a.id)

  if (assembleiaIds.length > 0) {
    const { data: sendsVotados, error: votosError } = await db
      .from("assembleia_sends")
      .select("id")
      .in("assembleia_id", assembleiaIds)
      .not("votado_em", "is", null)
      .limit(1)

    if (votosError) throw new Error(votosError.message)
    if ((sendsVotados ?? []).length > 0) {
      throw new Error(
        "Este condomínio possui assembleias com votos registrados e não pode ser excluído, para preservar o histórico de votação."
      )
    }
  }

  const { error } = await db.from("condominios").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
