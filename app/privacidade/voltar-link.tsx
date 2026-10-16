"use client"

import { useRouter } from "next/navigation"

// "Voltar" da política de privacidade. A página é pública e chegada de vários
// lugares (link de voto /v/[token], entrada /entrar, rodapé do painel), então
// não pode apontar pra um destino fixo — antes ia sempre pra /login, o que
// jogava o votante no login e o operador no painel. history.back() devolve a
// pessoa exatamente de onde ela veio. Sem histórico (abriu o link direto),
// cai na home como fallback.
export function VoltarLink({ className }: { className?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back()
        else router.push("/")
      }}
      className={className}
    >
      Voltar
    </button>
  )
}
