import { createServerClient } from "@/lib/supabase/server"
import { normalizarChaveUnidade } from "@/lib/unidade-format"
import { generateSurveyToken } from "@/lib/tokens"
import { isEmAndamento } from "@/lib/assembleia-status"
import type { AssembleiaStatus } from "@/types"

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, "")
}

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
    .select("id, condominio_id, status")
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

  // Reaproveita um send já existente (ex.: a pessoa também foi convidada por
  // e-mail antes) SEM rotacionar o token — senão invalidaria um link que ela
  // já possa ter. `presente_em` grava só a 1ª entrada (quando ela chegou),
  // nunca é sobrescrito.
  const { data: existente, error: exErr } = await db
    .from("assembleia_sends")
    .select("id, token, presente_em")
    .eq("assembleia_id", assembleiaId)
    .eq("proprietario_id", prop.id)
    .maybeSingle()
  if (exErr) return { ok: false, error: exErr.message }

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
