import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAssembleiaById } from "@/services/assembleias"
import { getTelaoData } from "@/services/telao"
import { requireAcessoCondominio } from "@/lib/auth"
import { APP_NAME } from "@/lib/constants"
import { TelaoLive } from "./telao-live"

interface Props {
  params: Promise<{ assembleiaId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assembleiaId } = await params
  try {
    const a = await getAssembleiaById(assembleiaId)
    return { title: a ? `Telão — ${a.titulo}` : APP_NAME }
  } catch {
    return { title: APP_NAME }
  }
}

// Telão ao vivo — tela cheia (fora do layout do dashboard, sem menu lateral),
// projetada no PC que apresenta a assembleia. Protegida por login (ver
// /telao em proxy.ts) + acesso ao condomínio aqui. O conteúdo se atualiza
// sozinho pelo polling em TelaoLive.
export default async function TelaoPage({ params }: Props) {
  const { assembleiaId } = await params

  const assembleia = await getAssembleiaById(assembleiaId).catch(() => null)
  if (!assembleia) notFound()

  const acesso = await requireAcessoCondominio(assembleia.condominio_id)
  if (!acesso.ok) notFound()

  const inicial = await getTelaoData(assembleiaId)
  if (!inicial) notFound()

  return (
    <TelaoLive
      assembleiaId={assembleiaId}
      condominioId={assembleia.condominio_id}
      inicial={inicial}
    />
  )
}
