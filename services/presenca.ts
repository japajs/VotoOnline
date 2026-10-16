import { createServerClient } from "@/lib/supabase/server"
import { normalizarChaveUnidade } from "@/lib/unidade-format"
import { generateSurveyToken } from "@/lib/tokens"
import { isEmAndamento } from "@/lib/assembleia-status"
import { getAllProprietarios } from "@/services/proprietarios"
import { outorgouProcuracao, getProcuracoesByAssembleia } from "@/services/procuracoes"
import { normalizarCpf, cpfCompleto } from "@/lib/format"
import type { AssembleiaStatus } from "@/types"

export type RegistrarPresencaResult =
  | { ok: true; token: string }
  | { ok: false; error: string }

// Presença online (Opção A — auto check-in). A partir do link público de
// entrada (/entrar/[assembleiaId]), o próprio proprietário se identifica por
// UNIDADE + CPF e "entra" na assembleia: marcamos `presente_em` (que vira a
// lista de presença online e o filtro de quem recebe e-mail) e devolvemos o
// token de voto, reaproveitando o mesmo mecanismo do /v/[token].
//
// A integridade do voto continua no fluxo de voto (constraint única, bloqueio
// de inadimplente/procuração) — aqui só confirmamos identidade o suficiente
// pra liberar o acesso. Mensagem de erro UNIFORME de propósito: não revela se
// a unidade existe nem se o CPF existe (mesma postura anti-enumeração do
// resto do sistema; quem chama ainda aplica rate limit por IP).
export async function registrarPresenca(
  assembleiaId: string,
  input: { numero: string; bloco: string | null; cpf: string }
): Promise<RegistrarPresencaResult> {
  const db = createServerClient()
  const erroGenerico = "Unidade ou CPF não confere. Confira os dados e tente de novo."

  const { data: assembleia, error: aErr } = await db
    .from("assembleias")
    .select("id, condominio_id, status, exige_presenca")
    .eq("id", assembleiaId)
    .maybeSingle()
  if (aErr) return { ok: false, error: aErr.message }
  if (!assembleia) return { ok: false, error: "Assembleia não encontrada." }
  if (!isEmAndamento(assembleia.status as AssembleiaStatus)) {
    return { ok: false, error: "Esta assembleia não está aberta para entrada no momento." }
  }

  const chave = normalizarChaveUnidade({ numero: input.numero, bloco: input.bloco })
  if (!chave) return { ok: false, error: "Informe a sua unidade." }

  // Unidade deste condomínio, pela chave normalizada (mesma regra de
  // duplicidade do cadastro — ver lib/unidade-format.ts).
  const { data: unidade, error: uErr } = await db
    .from("unidades")
    .select("proprietario_id")
    .eq("condominio_id", assembleia.condominio_id)
    .eq("numero_normalizado", chave)
    .limit(1)
    .maybeSingle()
  if (uErr) return { ok: false, error: uErr.message }
  if (!unidade) return { ok: false, error: erroGenerico }

  const { data: prop, error: pErr } = await db
    .from("proprietarios")
    .select("id, cpf")
    .eq("id", unidade.proprietario_id)
    .maybeSingle()
  if (pErr) return { ok: false, error: pErr.message }
  if (!prop) return { ok: false, error: erroGenerico }

  const cpfInformado = normalizarCpf(input.cpf)
  const cpfCadastro = normalizarCpf(prop.cpf ?? "")
  if (cpfCadastro.length !== 11) {
    // Sem CPF (ou CPF incompleto) no cadastro — autoatendimento não consegue
    // confirmar identidade. Cai pro caminho assistido (síndico lança o voto).
    return {
      ok: false,
      error:
        "Não foi possível confirmar sua identidade por aqui. Procure a administração/síndico para registrar seu voto.",
    }
  }
  if (cpfInformado !== cpfCadastro) return { ok: false, error: erroGenerico }

  // Outorgante não entra/vota por si: ao dar procuração, passou a representação
  // (presença e voto) ao procurador. Deixar entrar marcaria presença dele e o
  // imóvel seria contado 2x (aqui e no voto do procurador). Mensagem clara — a
  // pessoa já provou a identidade (unidade+CPF), então não há enumeração.
  if (await outorgouProcuracao(assembleiaId, prop.id)) {
    return {
      ok: false,
      error:
        "Você outorgou procuração nesta assembleia — quem participa e vota é o seu representante.",
    }
  }

  const { data: existente, error: exErr } = await db
    .from("assembleia_sends")
    .select("id, token, presente_em")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", prop.id)
    .maybeSingle()
  if (exErr) return { ok: false, error: exErr.message }

  // Presença controlada pela mesa: quando a assembleia exige presença, o link
  // NÃO libera o voto sozinho pelo CPF — a pessoa só vota se a MESA já a marcou
  // como presente (presente_em preenchido via a tela de Chamada). Aqui só
  // confirmamos a identidade (unidade+CPF, acima) e devolvemos o token de quem
  // está na lista de presença; quem não está, recebe o aviso pra assinar.
  if (assembleia.exige_presenca) {
    if (existente && existente.presente_em) {
      return { ok: true, token: existente.token }
    }
    return {
      ok: false,
      error:
        "Você ainda não foi marcado como presente pela mesa. Assine a lista na mesa de entrada para poder votar.",
    }
  }

  // Autoatendimento (exige_presenca = false): a própria entrada marca presença.
  // Reaproveita um send já existente SEM rotacionar o token; `presente_em`
  // grava só a 1ª entrada e nunca é sobrescrito.
  const agora = new Date().toISOString()

  if (existente) {
    if (!existente.presente_em) {
      const { error } = await db
        .from("assembleia_sends")
        .update({ presente_em: agora })
        .eq("id", existente.id)
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true, token: existente.token }
  }

  const token = generateSurveyToken()
  const { error } = await db.from("assembleia_sends").insert({
    assembleia_id: assembleiaId,
    proprietario_id: prop.id,
    token,
    status: "pending",
    presente_em: agora,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, token }
}

export interface PresenteItem {
  sendId: string
  nome: string
  email: string | null
  unidades: { numero: string; bloco: string | null }[]
  presenteEm: string
  votou: boolean
}

// Lista de presença online: quem ENTROU nesta assembleia pelo link de entrada
// (presente_em preenchido). Usa snapshot (nome/unidades congelados no voto)
// quando já votou; senão o cadastro atual. Ordenado por ordem de chegada.
export async function getPresencaAssembleia(assembleiaId: string): Promise<PresenteItem[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleia_sends")
    .select(
      "id, presente_em, votado_em, nome_snapshot, unidades_snapshot, email_snapshot, proprietarios(nome, email, unidades(numero, bloco))"
    )
    .eq("assembleia_id", assembleiaId)
    .not("presente_em", "is", null)

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    presente_em: string | null
    votado_em: string | null
    nome_snapshot: string | null
    email_snapshot: string | null
    unidades_snapshot: { numero: string; bloco: string | null }[] | null
    proprietarios: {
      nome: string
      email: string | null
      unidades: { numero: string; bloco: string | null }[] | null
    } | null
  }

  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      sendId: r.id,
      nome: r.nome_snapshot ?? r.proprietarios?.nome ?? "—",
      email: r.email_snapshot ?? r.proprietarios?.email ?? null,
      unidades: r.unidades_snapshot ?? r.proprietarios?.unidades ?? [],
      presenteEm: r.presente_em as string,
      votou: r.votado_em !== null,
    }))
    .sort((a, b) => a.presenteEm.localeCompare(b.presenteEm))
}

export interface ChamadaItem {
  proprietarioId: string
  nome: string
  email: string | null
  temCpf: boolean
  unidades: { numero: string; bloco: string | null }[]
  presente: boolean
  votou: boolean
  // Outorgou procuração nesta assembleia — não pode ser marcado presente (a
  // presença é representada pelo procurador): o toggle fica desabilitado.
  outorgante: boolean
  // Token de voto — existe só pra quem tem send (presente/convidado). Permite
  // a mesa copiar o link direto de voto da pessoa (útil pra quem não tem CPF).
  token: string | null
}

export interface ChamadaData {
  exigePresenca: boolean
  itens: ChamadaItem[]
}

// Chamada: lista TODOS os condôminos pra a mesa marcar presença. Junta o
// cadastro completo do condomínio com os sends desta assembleia (presente_em /
// votado_em) e devolve também se a assembleia exige presença.
export async function getChamada(assembleiaId: string): Promise<ChamadaData> {
  const db = createServerClient()

  const { data: assembleia, error: aErr } = await db
    .from("assembleias")
    .select("condominio_id, exige_presenca")
    .eq("id", assembleiaId)
    .single()
  if (aErr) throw new Error(aErr.message)

  const [proprietarios, procuracoes] = await Promise.all([
    getAllProprietarios(assembleia.condominio_id),
    getProcuracoesByAssembleia(assembleiaId),
  ])
  const outorgantes = new Set(procuracoes.map((p) => p.outorgante_id))

  const { data: sends, error: sErr } = await db
    .from("assembleia_sends")
    .select("proprietario_id, token, presente_em, votado_em")
    .eq("assembleia_id", assembleiaId)
  if (sErr) throw new Error(sErr.message)

  const porProp = new Map<string, { presente: boolean; votou: boolean; token: string }>()
  for (const s of (sends ?? []) as {
    proprietario_id: string
    token: string
    presente_em: string | null
    votado_em: string | null
  }[]) {
    porProp.set(s.proprietario_id, {
      presente: s.presente_em !== null,
      votou: s.votado_em !== null,
      token: s.token,
    })
  }

  const itens: ChamadaItem[] = proprietarios.map((p) => {
    const st = porProp.get(p.id)
    return {
      proprietarioId: p.id,
      nome: p.nome,
      email: p.email,
      temCpf: cpfCompleto(p.cpf),
      unidades: (p.unidades ?? []).map((u) => ({ numero: u.numero, bloco: u.bloco })),
      presente: st?.presente ?? false,
      votou: st?.votou ?? false,
      outorgante: outorgantes.has(p.id),
      token: st?.token ?? null,
    }
  })

  return { exigePresenca: assembleia.exige_presenca, itens }
}

// Marca/desmarca um proprietário como presente (a "chamada" da mesa). Marcar
// cria o send se preciso (com token, pra pessoa conseguir votar pelo link) e
// grava presente_em; desmarcar limpa presente_em — nunca de quem já votou.
export async function marcarPresenca(
  assembleiaId: string,
  proprietarioId: string,
  presente: boolean
): Promise<void> {
  const db = createServerClient()

  const { data: existente, error } = await db
    .from("assembleia_sends")
    .select("id, presente_em, votado_em")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", proprietarioId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (presente) {
    // Não marca presente quem outorgou procuração: a presença dele é
    // representada pelo procurador (regra validada com o Carlos). Marcar
    // contaria o imóvel 2x (aqui e no voto do procurador). Desmarcar (abaixo)
    // continua livre — inclusive pra tirar da lista quem delegou depois.
    if (await outorgouProcuracao(assembleiaId, proprietarioId)) {
      throw new Error(
        "Este proprietário outorgou procuração nesta assembleia — a presença é representada pelo procurador."
      )
    }
    const agora = new Date().toISOString()
    if (existente) {
      if (!existente.presente_em) {
        const { error: upErr } = await db
          .from("assembleia_sends")
          .update({ presente_em: agora })
          .eq("id", existente.id)
        if (upErr) throw new Error(upErr.message)
      }
    } else {
      const { error: insErr } = await db.from("assembleia_sends").insert({
        assembleia_id: assembleiaId,
        proprietario_id: proprietarioId,
        token: generateSurveyToken(),
        status: "pending",
        presente_em: agora,
      })
      if (insErr) throw new Error(insErr.message)
    }
    return
  }

  // Desmarcar presença — não dá pra "despresentar" quem já votou.
  if (existente) {
    if (existente.votado_em) {
      throw new Error("Este proprietário já votou e não pode sair da lista de presença.")
    }
    const { error: upErr } = await db
      .from("assembleia_sends")
      .update({ presente_em: null })
      .eq("id", existente.id)
    if (upErr) throw new Error(upErr.message)
  }
}

// Liga/desliga "exigir presença confirmada pela mesa" numa assembleia.
export async function setExigePresenca(assembleiaId: string, value: boolean): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from("assembleias")
    .update({ exige_presenca: value })
    .eq("id", assembleiaId)
  if (error) throw new Error(error.message)
}

// Lê só a flag exige_presenca de uma assembleia — pra a página de entrada
// avisar o morador, de antemão, que precisa estar na lista de presença da mesa.
export async function getExigePresenca(assembleiaId: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from("assembleias")
    .select("exige_presenca")
    .eq("id", assembleiaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.exige_presenca ?? false
}
