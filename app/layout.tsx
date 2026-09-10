import type { Metadata } from "next"
import { Fraunces, Source_Sans_3, IBM_Plex_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { APP_NAME } from "@/lib/constants"
import "./globals.css"

const fraunces = Fraunces({
  variable: "--font-heading-serif",
  subsets: ["latin"],
  display: "swap",
  // Só usada em título de card/dialog/sidebar (área logada) — nas páginas
  // públicas (ex.: /v/[token], /login) nunca chega a ser pintada, e o
  // preload automático (por estar no root layout, toda rota herda) gera o
  // aviso "preloaded but not used" no console. Mesmo raciocínio já aplicado
  // ao plexMono abaixo.
  preload: false,
})

const sourceSans = Source_Sans_3({
  variable: "--font-sans-body",
  subsets: ["latin"],
  display: "swap",
})

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
})

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "Sistema de Assembleias Eletrônicas para Condomínios.",
  openGraph: {
    title: APP_NAME,
    description: "Sistema de Assembleias Eletrônicas para Condomínios.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${sourceSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider>
          {children}
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  )
}
