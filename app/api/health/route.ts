import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

// Keep-alive do banco. No plano Free da Supabase, um projeto é pausado após
// ~7 dias sem nenhuma atividade no banco — e um projeto pausado derruba o site
// inteiro até alguém restaurar no painel. Entre uma assembleia e outra o app
// pode ficar parado tempo suficiente pra isso acontecer. Esta rota faz uma
// consulta mínima (um count, sem trazer linhas) só pra registrar atividade; o
// Vercel Cron (ver vercel.json) a chama 1x por dia, mantendo o relógio dos 7
// dias sempre zerado.
//
// Sempre dinâmica: se fosse cacheada, o cron "passaria" sem tocar no banco e o
// keep-alive não aconteceria.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  // Hardening opcional: quando CRON_SECRET existe no ambiente, o Vercel manda
  // `Authorization: Bearer <CRON_SECRET>` automaticamente nas chamadas de cron
  // — então exigimos esse header e só o cron chama a rota. Sem a env, a rota
  // fica aberta (é inofensiva: só um count), pra funcionar sem config extra.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const db = createServerClient()
    // head: true não traz nenhuma linha — só executa a consulta, que já conta
    // como atividade. `configuracoes` é uma tabela minúscula (chave-valor).
    const { error } = await db.from("configuracoes").select("chave", { head: true, count: "exact" })
    if (error) {
      console.error("[health] consulta falhou:", error.message)
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (err) {
    console.error("[health] erro inesperado:", err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
