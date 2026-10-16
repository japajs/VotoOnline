"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

// URL pública de entrada da assembleia (Opção A: um link por assembleia, o
// condômino se identifica por unidade + CPF). Montada no cliente a partir do
// domínio em que a página está aberta — assim sempre bate com o ambiente
// (produção, preview), sem depender de env. Fica null no 1º render (SSR /
// hidratação) e é preenchida logo após montar.
export function useEntradaUrl(assembleiaId: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(`${window.location.origin}/entrar/${assembleiaId}`)
  }, [assembleiaId])
  return url
}

// QR Code do link de entrada. Gerado 100% no navegador (offline) — importante
// porque o wi-fi do salão costuma oscilar. Fundo branco e cor escura fixos pra
// garantir leitura em qualquer tema (claro/escuro) e no telão. Enquanto a URL
// não está pronta, reserva o espaço pra não "pular" o layout.
export function QrEntrada({
  url,
  size = 180,
}: {
  url: string | null
  size?: number
}) {
  if (!url) return <div style={{ width: size, height: size }} aria-hidden />
  return (
    <QRCodeSVG
      value={url}
      size={size}
      level="M"
      marginSize={2}
      bgColor="#FFFFFF"
      fgColor="#16233F"
    />
  )
}
