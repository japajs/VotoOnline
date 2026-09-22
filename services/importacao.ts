import { createServerClient } from "@/lib/supabase/server"
import { createProprietario } from "@/services/proprietarios"
import { createUnidade } from "@/services/unidades"
import { normalizarChaveUnidade } from "@/lib/unidade-format"
import type { ProprietarioImport } from "@/types"

export interface ResultadoLoteImportacao {
  proprietariosCriados: number
  proprietariosAtualizados: number
  unidadesCriadas: number
  unidadesIgnoradas: number
  erros: string[]
}

// Auditoria de segurança: escapa os curingas do PostgREST (`%`, `_`, `,`)
// antes de usar o valor num `ilike` — sem isso, um e-mail/nome vindo da
// planilha com esses caracteres poderia casar com um registro diferente do
// pretendido (ex.: "%" sozinho bateria com qualquer proprietário).
function escaparCuringasIlike(valor: string): string {
  return valor.replace(/[%_,]/g, (c) => `\\${c}`)
}

// Busca proprietário existente no condomínio por e-mail > nome
async function findProprietarioExistente(
  condominioId: string,
  prop: ProprietarioImport
): Promise<string | null> {
  const db = createServerClient()

  if (prop.email) {
    const { data } = await db
      .from("proprietarios")
      .select("id")
      .eq("condominio_id", condominioId)
      .ilike("email", escaparCuringasIlike(prop.email))
      .maybeSingle()
    if (data) return (data as { id: string }).id
  }

  const { data } = await db
    .from("proprietarios")
    .select("id")
    .eq("condominio_id", condominioId)
    .ilike("nome", escaparCuringasIlike(prop.nome))
    .maybeSingle()

  return data ? (data as { id: string }).id : null
}

async function processarProprietario(
  condominioId: string,
  prop: ProprietarioImport
): Promise<{ criado: boolean; unidadesCriadas: number; unidadesIgnoradas: number; erros: string[] }> {
  const erros: string[] = []
  let criado = false
  let unidadesCriadas = 0
  let unidadesIgnoradas = 0

  try {
    let proprietarioId = await findProprietarioExistente(condominioId, prop)

    if (!proprietarioId) {
      const novo = await createProprietario({
        condominio_id: condominioId,
        nome: prop.nome,
        email: prop.email,
        telefone: prop.telefone,
        cpf: prop.cpf,
        inadimplente: prop.inadimplente,
      })
      proprietarioId = novo.id
      criado = true
    }
    // Auditoria funcional: CPF/inadimplente só são aplicados na CRIAÇÃO do
    // proprietário, nunca sobrescrevendo um já existente — mesmo
    // comportamento que email/telefone já tinham aqui. Uma reimportação não
    // deve apagar uma correção manual feita depois pela tela de edição.

    const db = createServerClient()
    const { data: existentes } = await db
      .from("unidades")
      .select("numero, bloco")
      .eq("proprietario_id", proprietarioId)

    // Padronização de unidades: compara pela chave normalizada (sem
    // hífen/espaço/caractere especial, maiúsculas) — "C0502" importado
    // quando o proprietário já tem "C-0502" é a MESMA unidade, não uma
    // nova. A tentativa de criar uma equivalente em outro proprietário do
    // mesmo condomínio continua sendo pega por createUnidade (mensagem em
    // `erros`, sem gerar duplicidade).
    const chavesExistentes = new Set(
      (existentes ?? []).map((u: { numero: string; bloco: string | null }) => normalizarChaveUnidade(u))
    )

    for (const { numero, fracaoIdeal } of prop.unidades) {
      const chave = normalizarChaveUnidade({ numero, bloco: null })
      if (chavesExistentes.has(chave)) {
        unidadesIgnoradas++
        continue
      }
      try {
        await createUnidade({ proprietario_id: proprietarioId, numero, bloco: null, fracao_ideal: fracaoIdeal })
        unidadesCriadas++
        chavesExistentes.add(chave)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido"
        erros.push(`Unidade "${numero}" (${prop.nome}): ${msg}`)
        unidadesIgnoradas++
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    erros.push(`Proprietário "${prop.nome}": ${msg}`)
  }

  return { criado, unidadesCriadas, unidadesIgnoradas, erros }
}

// Auditoria de desempenho: uma importação real de ~100 unidades processada
// uma linha por vez levava ~70s — acima do tempo de execução padrão da
// Vercel, com risco real de timeout. Processa em pequenos lotes paralelos:
// dentro de cada proprietário as unidades continuam sequenciais (preserva a
// lógica de "unidade já existente" por Set), e entre lotes o processamento é
// sequencial — só há paralelismo DENTRO de um lote de CHUNK_SIZE
// proprietários, o que mantém baixo o risco de condição de corrida na busca
// por nome (caso raro: dois proprietários sem e-mail e com nomes iguais no
// mesmo lote) e ainda reduz o tempo total várias vezes.
const CHUNK_SIZE = 10

export async function executarLoteImportacao(
  condominioId: string,
  proprietarios: ProprietarioImport[]
): Promise<ResultadoLoteImportacao> {
  let proprietariosCriados = 0
  let proprietariosAtualizados = 0
  let unidadesCriadas = 0
  let unidadesIgnoradas = 0
  const erros: string[] = []

  for (let i = 0; i < proprietarios.length; i += CHUNK_SIZE) {
    const lote = proprietarios.slice(i, i + CHUNK_SIZE)
    const resultados = await Promise.all(lote.map((prop) => processarProprietario(condominioId, prop)))
    for (const r of resultados) {
      if (r.criado) proprietariosCriados++
      else proprietariosAtualizados++
      unidadesCriadas += r.unidadesCriadas
      unidadesIgnoradas += r.unidadesIgnoradas
      erros.push(...r.erros)
    }
  }

  return { proprietariosCriados, proprietariosAtualizados, unidadesCriadas, unidadesIgnoradas, erros }
}
