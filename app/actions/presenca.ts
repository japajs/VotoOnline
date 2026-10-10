"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { registrarPresenca, getPresencaAssembleia, type PresenteItem } from "@/services/presenca"
import { requirePerfil, requireAcessoCondominio } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { ROUTES } from "@/lib/constants"

export type EntrarState = { error?: string } | null

// Ação do link público de entrada (Opção A). Recebe o assembleiaId via bind
// (não por campo do formulário). Em caso de sucesso, redireciona pro /v/[token]
// de sempre — reaproveitando todo o fluxo/telas de voto já existentes.
export async function entrarAssembleiaAction(
  assembleiaId: string,
  _prev: EntrarState,
  formData: FormData
): Promise<EntrarState> {
  // Rota pública: limita tentativas por IP pra não virar oráculo de
  // força-bruta de CPF (a mensagem de erro já é uniforme no serviço).
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  if (!(await checkRateLimit(`entrar:${ip}`))) {
    return { error: "Muitas tentativas. Aguarde um momento e tente novamente." }
  }

  const numero = String(formData.get("numero") ?? "").trim()
  const bloco = String(formData.get("bloco") ?? "").trim() || null
  const cpf = String(formData.get("cpf") ?? "").trim()

  if (!numero || !cpf) return { error: "Preencha a sua unidade e o CPF." }

  const result = await registrarPresenca(assembleiaId, { numero, bloco, cpf })
  if (!result.ok) return { error: result.error }

  // redirect() lança NEXT_REDIRECT — fica fora de qualquer try/catch de propósito.
  redirect(ROUTES.publicCondoVoto(result.token))
}

// Lista de presença pro admin (read-only). Visualizador também pode ver (é só
// leitura, como a apuração); o envio de lembrete é que exige admin/operador
// (ver notificarNaoVotaramAction).
export async function getPresencaAction(
  assembleiaId: string,
  condominioId: string
): Promise<{ success: boolean; presentes: PresenteItem[]; error?: string }> {
  const auth = await requirePerfil(["administrador", "operador", "visualizador"])
  if (!auth.ok) return { success: false, presentes: [], error: auth.error }
  const acesso = await requireAcessoCondominio(condominioId)
  if (!acesso.ok) return { success: false, presentes: [], error: acesso.error }

  try {
    const presentes = await getPresencaAssembleia(assembleiaId)
    return { success: true, presentes }
  } catch (err) {
    return {
      success: false,
      presentes: [],
      error: err instanceof Error ? err.message : "Erro ao carregar a lista de presença.",
    }
  }
}
