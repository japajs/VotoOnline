"use client"

import { useEffect, useRef, useState } from "react"
import { WifiOff } from "lucide-react"
import { pingLinkAtivoAction } from "@/app/actions/assembleia-votos"

const PING_MS = 12_000
const STORAGE_KEY = "votoonline:dispositivo"

// id estável do aparelho (por navegador): deixa o MESMO aparelho reabrir o link
// sem se autobloquear, e distingue um 2º aparelho de verdade. localStorage (não
// session) pra sobreviver a fechar/reabrir a aba. Em aba privada/bloqueada, cai
// num id efêmero por carga de página — ainda funciona, só não "lembra" entre
// reaberturas.
function getDispositivoId(): string {
  try {
    const existente = localStorage.getItem(STORAGE_KEY)
    if (existente) return existente
    const novo = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, novo)
    return novo
  } catch {
    return crypto.randomUUID()
  }
}

// Mantém vivo o "link ativo" (heartbeat) da tela de voto aberta e, se OUTRO
// aparelho já estiver conectado com as mesmas credenciais, cobre a tela com um
// aviso até o 1º cair (pedido do Carlos: 1 imóvel = 1 aparelho por vez; a mesa
// enxerga link on/off na lista). Enquanto não há conflito, não desenha nada — só
// bate o ping a cada ~12s. Monte nas telas onde o eleitor fica com o link aberto.
//
// `bloquear` (padrão true) separa o aviso do heartbeat: nas telas de VOTAÇÃO
// ativa, cobre a tela do 2º aparelho; nas de espera/consulta (aguardando,
// pausada, já votou) passamos false — o heartbeat continua (a mesa vê link on),
// mas não impede ver a tela num 2º aparelho (ex.: quem já votou conferir o
// resultado). O bloqueio real vale quando a pessoa cai na tela de votar.
export function LinkAtivoGuard({ token, bloquear = true }: { token: string; bloquear?: boolean }) {
  const [bloqueado, setBloqueado] = useState(false)
  const dispositivoRef = useRef<string>("")

  useEffect(() => {
    if (!dispositivoRef.current) dispositivoRef.current = getDispositivoId()
    let ativo = true
    let timer: ReturnType<typeof setTimeout>

    const bater = async () => {
      try {
        const r = await pingLinkAtivoAction(token, dispositivoRef.current)
        if (ativo && r.ok) setBloqueado(r.estado === "ocupado")
      } catch {
        // Rede ruim: não bloqueia por falha de ping — o próximo ciclo reavalia.
      }
      if (ativo) timer = setTimeout(bater, PING_MS)
    }
    bater()
    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [token])

  if (!bloquear || !bloqueado) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-amber-400/40 bg-card px-6 py-10 text-center shadow-lg">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/20">
          <WifiOff className="h-7 w-7 text-amber-500" />
        </div>
        <div>
          <p className="font-medium">Este link já está aberto em outro aparelho</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Para votar por este aparelho, feche o link no outro dispositivo. Assim que ele for
            fechado, esta tela libera sozinha em alguns segundos.
          </p>
        </div>
      </div>
    </div>
  )
}
