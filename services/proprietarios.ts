import { createServerClient } from "@/lib/supabase/server"
import { normalizarBusca } from "@/lib/format"
import type { Json } from "@/lib/supabase/types"
import type { HistoricoAlteracao, Proprietario, Unidade } from "@/types"

type JoinedProprietario = {
  id: string
  condominio_id: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  observacoes: string | null
  inadimplente: boolean
  conjuge: string | null
  historico_alteracoes: HistoricoAlteracao[] | null
  created_at: string
  unidades: Unidade[] | null
}

// Bloqueio de inadimplente (Código Civil, art. 1.335, §único — ver
// validarVotoOuFalhar em services/assembleia-votos.ts) precisa da mesma
// checagem em mais de um lugar (criar procuração, somar peso delegado na
// hora do voto) — centralizado aqui pra as duas cópias nunca divergirem.
// Recebe `db` (não cria o seu) pra rodar na mesma sessão/transação de quem
// chama.
export async function getIdsInadimplentes(
  db: ReturnType<typeof createServerClient>,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await db.from("proprietarios").select("id, inadimplente").in("id", ids)
  if (error) throw new Error(error.message)
  return new Set(
    ((data ?? []) as { id: string; inadimplente: boolean }[])
      .filter((p) => p.inadimplente)
      .map((p) => p.id)
  )
}

// Checa se UM proprietário está inadimplente (só este flag, consulta leve).
// Usado pra bloquear o inadimplente JÁ NO ACESSO ao link de voto — não só na
// confirmação (regra do Carlos: inadimplente não vota de forma alguma; pra
// liberar, a mesa remove o status). O voto em si também bloqueia no núcleo
// (validarVotoOuFalhar) — isto é defesa em camadas + clareza na tela.
export async function isProprietarioInadimplente(proprietarioId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("proprietarios")
    .select("inadimplente")
    .eq("id", proprietarioId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { inadimplente: boolean } | null)?.inadimplente ?? false
}

function rowToProprietario(row: JoinedProprietario): Proprietario {
  return {
    id: row.id,
    condominio_id: row.condominio_id,
    nome: row.nome,
    email: row.email,
    cpf: row.cpf,
    telefone: row.telefone,
    observacoes: row.observacoes,
    inadimplente: row.inadimplente,
    conjuge: row.conjuge ?? null,
    historico_alteracoes: row.historico_alteracoes ?? [],
    created_at: row.created_at,
    unidades: row.unidades ?? [],
  }
}

// Sempre traz as unidades junto — é a partir delas que o peso de voto
// (getPesoParticipante) é calculado em qualquer lugar que use este service.
const SELECT_WITH_UNIDADES = "*, unidades(*)"

export async function getAllProprietarios(condominioId: string): Promise<Proprietario[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("proprietarios")
    .select(SELECT_WITH_UNIDADES)
    .eq("condominio_id", condominioId)
    .order("nome", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as JoinedProprietario[]).map(rowToProprietario)
}

export async function getProprietarioById(id: string): Promise<Proprietario | null> {
  const db = createServerClient()
  const { data, error } = await db
    .from("proprietarios")
    .select(SELECT_WITH_UNIDADES)
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(error.message)
  }
  return rowToProprietario(data as unknown as JoinedProprietario)
}

// CPF já cadastrado em OUTRO proprietário do mesmo condomínio? (pedido do
// Carlos: o cadastro estava deixando repetir CPF). Compara pelo CPF normalizado
// (só dígitos). `exceptId` ignora o próprio registro na edição. Resiliente: se a
// coluna não tiver valor, não acusa.
export async function cpfJaCadastrado(
  condominioId: string,
  cpfNormalizado: string,
  exceptId?: string
): Promise<boolean> {
  if (!cpfNormalizado) return false
  const db = createServerClient()
  let query = db
    .from("proprietarios")
    .select("id")
    .eq("condominio_id", condominioId)
    .eq("cpf", cpfNormalizado)
  if (exceptId) query = query.neq("id", exceptId)
  const { data, error } = await query.limit(1)
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

// Nome já cadastrado em OUTRO proprietário do mesmo condomínio? (pedido do
// Carlos: o cadastro deixou criar 2 proprietários IGUAIS — ex.: a "DANI"
// duplicada.) O CPF/e-mail são opcionais e nem sempre pegam a duplicata — quem
// é só nome passa batido. Compara pelo nome NORMALIZADO (sem acento/espaço,
// minúsculo — normalizarBusca), então "Dani Silva" colide com "DANI  SILVA".
// Retorna o nome existente (pra avisar "já existe 'DANI SILVA'"), ou null se
// não há colisão. É AVISO, não bloqueio: homônimos legítimos existem (duas
// pessoas diferentes com o mesmo nome) — a tela deixa confirmar. Carrega só
// id+nome do condomínio (lista de duas pessoas administra poucos cadastros).
export async function nomeJaCadastrado(
  condominioId: string,
  nome: string,
  exceptId?: string
): Promise<string | null> {
  const alvo = normalizarBusca(nome)
  if (!alvo) return null
  const db = createServerClient()
  const { data, error } = await db
    .from("proprietarios")
    .select("id, nome")
    .eq("condominio_id", condominioId)
  if (error) throw new Error(error.message)
  const existente = ((data ?? []) as { id: string; nome: string }[]).find(
    (p) => p.id !== exceptId && normalizarBusca(p.nome) === alvo
  )
  return existente?.nome ?? null
}

export async function createProprietario(
  input: Pick<Proprietario, "condominio_id" | "nome"> & {
    email?: string | null
    cpf?: string | null
    telefone?: string | null
    inadimplente?: boolean
    conjuge?: string | null
  }
): Promise<Proprietario> {
  const db = createServerClient()
  const { data, error } = await db
    .from("proprietarios")
    .insert({
      condominio_id: input.condominio_id,
      nome: input.nome,
      ...(input.email ? { email: input.email } : {}),
      ...(input.cpf ? { cpf: input.cpf } : {}),
      ...(input.telefone ? { telefone: input.telefone } : {}),
      ...(input.inadimplente ? { inadimplente: input.inadimplente } : {}),
      ...(input.conjuge ? { conjuge: input.conjuge } : {}),
    })
    .select(SELECT_WITH_UNIDADES)
    .single()

  if (error) throw new Error(error.message)
  return rowToProprietario(data as unknown as JoinedProprietario)
}

export async function updateProprietario(
  id: string,
  input: Partial<
    Pick<
      Proprietario,
      "nome" | "email" | "cpf" | "telefone" | "observacoes" | "inadimplente" | "conjuge"
    >
  >
): Promise<Proprietario> {
  const db = createServerClient()
  const { data, error } = await db
    .from("proprietarios")
    .update({
      ...(input.nome !== undefined && { nome: input.nome }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.cpf !== undefined && { cpf: input.cpf }),
      ...(input.telefone !== undefined && { telefone: input.telefone }),
      ...(input.observacoes !== undefined && { observacoes: input.observacoes }),
      ...(input.inadimplente !== undefined && { inadimplente: input.inadimplente }),
      ...(input.conjuge !== undefined && { conjuge: input.conjuge }),
    })
    .eq("id", id)
    .select(SELECT_WITH_UNIDADES)
    .single()

  if (error) throw new Error(error.message)
  return rowToProprietario(data as unknown as JoinedProprietario)
}

// Auditoria funcional: exclusão de proprietário apaga em cascata (FK do banco)
// os registros de assembleia_sends/assembleia_respostas ligados a ele — o que
// destruiria o histórico de voto (Etapa 3) mesmo de assembleias já encerradas.
// Por isso, um proprietário que já votou em qualquer assembleia não pode ser
// excluído; o admin precisa manter o cadastro (pode remover as unidades dele).
export async function deleteProprietario(id: string): Promise<void> {
  const db = createServerClient()

  const { data: sendsVotados, error: votosError } = await db
    .from("assembleia_sends")
    .select("id")
    .eq("proprietario_id", id)
    .not("votado_em", "is", null)
    .limit(1)

  if (votosError) throw new Error(votosError.message)
  if ((sendsVotados ?? []).length > 0) {
    throw new Error(
      "Este proprietário já votou em alguma assembleia e não pode ser excluído, para preservar o histórico de votação."
    )
  }

  const { error } = await db.from("proprietarios").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Histórico simples de alterações de cadastro (Etapa 4) — guardado direto no
// proprietário, sem tabela/módulo de auditoria separado. Leitura-e-gravação
// simples (sem função de banco dedicada): aceitável para o volume de uso de
// duas pessoas administrando o sistema.
export async function registrarHistoricoAlteracao(
  proprietarioId: string,
  entradas: Omit<HistoricoAlteracao, "data">[]
): Promise<void> {
  if (entradas.length === 0) return

  const db = createServerClient()
  const { data, error: fetchError } = await db
    .from("proprietarios")
    .select("historico_alteracoes")
    .eq("id", proprietarioId)
    .single()

  if (fetchError) throw new Error(fetchError.message)

  const atual = ((data?.historico_alteracoes as HistoricoAlteracao[] | null) ?? [])
  const agora = new Date().toISOString()
  const novo = [...atual, ...entradas.map((e) => ({ ...e, data: agora }))]

  const { error } = await db
    .from("proprietarios")
    .update({ historico_alteracoes: novo as unknown as Json })
    .eq("id", proprietarioId)

  if (error) throw new Error(error.message)
}
