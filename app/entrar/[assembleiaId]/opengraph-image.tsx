import { ImageResponse } from "next/og"
import { carregarEntrada } from "./_entrada-data"
import { APP_NAME } from "@/lib/constants"

// Cartão de compartilhamento (preview no WhatsApp/Telegram/iMessage) gerado por
// assembleia, com o NOME DO CONDOMÍNIO em destaque. Antes o link colado não
// tinha imagem, então o WhatsApp mostrava só a URL repetida (pedido do Carlos:
// "tem muita informação"). Agora mostra um cartão da marca, dinâmico por
// condomínio. Roda sob demanda (rota dinâmica + dado do banco), nunca no build.

export const runtime = "nodejs"
export const alt = "Entrada da assembleia — VotoOnline"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Paleta da marca (mesma do cartaz impresso de QR): navy + creme.
const NAVY = "#16233F"
const CREME = "#F4F1E8"
const BORDA = "#D8D2C2"
const MUTED = "#5B6678"

function cortar(texto: string, max: number): string {
  const t = texto.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export default async function Image({
  params,
}: {
  params: Promise<{ assembleiaId: string }>
}) {
  // Nunca deixa a geração estourar: se o dado não vier, cai num cartão genérico
  // da marca (um og:image quebrado seria pior que um cartão simples).
  let condominio = "Assembleia de condomínio"
  let tituloAssembleia = ""
  try {
    const { assembleiaId } = await params
    const { assembleia, condominioNome } = await carregarEntrada(assembleiaId)
    if (condominioNome) condominio = cortar(condominioNome, 60)
    if (assembleia) tituloAssembleia = cortar(assembleia.titulo, 90)
  } catch {
    // mantém os valores genéricos
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: NAVY,
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: CREME,
            border: `2px solid ${BORDA}`,
            borderRadius: 28,
            padding: "56px 64px",
            justifyContent: "space-between",
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 4,
              color: MUTED,
              textTransform: "uppercase",
            }}
          >
            Assembleia de condomínio
          </div>

          {/* Nome do condomínio + título da assembleia */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 800,
                lineHeight: 1.05,
                color: NAVY,
              }}
            >
              {condominio}
            </div>
            {tituloAssembleia ? (
              <div style={{ display: "flex", fontSize: 34, color: MUTED, lineHeight: 1.2 }}>
                {tituloAssembleia}
              </div>
            ) : null}
          </div>

          {/* Chamada pra ação */}
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              background: NAVY,
              color: CREME,
              fontSize: 30,
              fontWeight: 700,
              padding: "16px 32px",
              borderRadius: 999,
            }}
          >
            Toque para entrar e votar · unidade + CPF
          </div>

          {/* Rodapé: marca + autoria */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `2px solid ${BORDA}`,
              paddingTop: 28,
            }}
          >
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: NAVY }}>
              {APP_NAME}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: MUTED }}>
              © Cleiton Salazar
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
