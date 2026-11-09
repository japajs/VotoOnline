"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gavel, Menu, ChevronRight } from "lucide-react"
import { Sidebar } from "./sidebar"
import { cn } from "@/lib/utils"
import { APP_NAME, APP_VERSION, APP_AUTORIA } from "@/lib/constants"
import type { SessionUser } from "@/types"

interface Props {
  user: SessionUser
  children: React.ReactNode
  // Preferência de menu recolhido, lida de um cookie pelo layout no servidor —
  // assim o primeiro render já vem no estado certo (sem flash de hidratação).
  initialCollapsed?: boolean
}

const COLLAPSE_COOKIE = "votoonline_sidebar_collapsed"

export function DashboardShell({ user, children, initialCollapsed = false }: Props) {
  const [open, setOpen] = useState(false)
  // Menu retrátil no DESKTOP (pedido do Carlos: o menu fixo tomava muito
  // espaço na tela principal). `collapsed` (preferência salva num COOKIE, lido
  // no servidor pra o primeiro render já vir certo): recolhido, o menu sai do
  // fluxo (conteúdo ocupa a largura toda) e vira um overlay que "espia" ao
  // encostar o mouse na borda esquerda (`peek`). No mobile nada muda — continua
  // o drawer com o hambúrguer.
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [peek, setPeek] = useState(false)
  const pathname = usePathname()

  // Recolhe/fixa e grava a preferência num cookie (o layout lê no servidor na
  // próxima navegação/refresh — sem flash, e sem setState dentro de effect).
  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    try {
      document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* cookie bloqueado não quebra o toggle na sessão atual */
    }
  }

  // Close sidebar (mobile) e fecha o "espiar" ao navegar
  useEffect(() => {
    setOpen(false)
    setPeek(false)
  }, [pathname])

  // Auditoria de responsividade: o menu mobile é um overlay (drawer) — sem
  // isso, um usuário de teclado não tinha como fechá-lo além de encontrar o
  // botão "Fechar", sem o atalho Esc já esperado nesse padrão.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  return (
    // `relative`: sem isso, elementos com position:absolute dentro do painel
    // (ex.: os <span className="sr-only"> de cada linha da lista de
    // proprietários) tinham como bloco de contenção a página inteira — não
    // eram cortados pela rolagem interna do <main> nem por este
    // overflow-hidden, e esticavam a rolagem do documento até o fim da
    // lista (vão em branco ao rolar a página com ~175 proprietários).
    // Altura dinâmica (dvh, com 100vh de reserva): em celular 100vh é MAIOR que a área
    // visível (a barra do navegador cobre a parte de baixo), então o rodapé
    // do painel ficava escondido e fora do alcance da rolagem interna.
    <div className="relative flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-background">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar wrapper — overlay no mobile; no desktop fica estático (fixo) OU,
          quando recolhido, vira overlay que "espia" ao encostar na borda. */}
      <div
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label="Menu de navegação"
        onMouseLeave={collapsed ? () => setPeek(false) : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed
            ? cn(
                "lg:fixed lg:inset-y-0 lg:left-0 lg:z-40",
                peek ? "lg:translate-x-0 lg:shadow-2xl" : "lg:-translate-x-full"
              )
            : "lg:static lg:inset-auto lg:z-auto lg:translate-x-0"
        )}
      >
        <Sidebar
          user={user}
          open={open}
          onClose={() => setOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Handle na borda esquerda — só no desktop, quando recolhido e sem
          espiar. Abre o menu ao passar o mouse, focar (teclado) ou tocar
          (celular/touch no desktop). O overlay cobre o handle quando aberto. */}
      {collapsed && !peek && (
        <button
          type="button"
          onMouseEnter={() => setPeek(true)}
          onFocus={() => setPeek(true)}
          onClick={() => setPeek(true)}
          aria-label="Abrir menu"
          title="Abrir menu"
          className="fixed left-0 top-1/2 z-30 hidden h-16 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg bg-sidebar text-sidebar-muted-foreground shadow-md ring-1 ring-sidebar-border/60 outline-none transition-all hover:w-6 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 lg:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top header */}
        <header className="flex h-14 shrink-0 items-center gap-2 bg-sidebar px-3 text-sidebar-foreground lg:hidden print:hidden">
          <button
            onClick={() => setOpen(true)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-sidebar-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sidebar-primary/15 ring-1 ring-sidebar-primary/25">
              <Gavel className="h-3.5 w-3.5 text-sidebar-primary" strokeWidth={1.75} />
            </div>
            <span className="font-heading text-sm font-medium tracking-tight">{APP_NAME}</span>
          </div>
        </header>

        {/* overflow-x-hidden: trava de segurança contra estouro horizontal —
            se algum elemento ficar mais largo que a tela num celular, ele não
            empurra a página toda (que cortava o conteúdo da esquerda). O
            conteúdo legitimamente largo (tabelas, calendário) tem rolagem
            própria interna (overflow-x-auto), então nada fica inacessível. */}
        <main className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {/* Selo de autoria/licenciamento no canto superior direito (pedido
              do Carlos): deixa claro pro síndico que a ferramenta é
              proprietária e locada por sessão. Curto no celular, completo a
              partir de sm. */}
          <div className="flex shrink-0 justify-end px-6 pt-3 print:hidden">
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              <span className="hidden sm:inline">{APP_AUTORIA}</span>
              <span className="sm:hidden">© Cleiton Salazar</span>
            </p>
          </div>
          <div className="flex-1">{children}</div>
          <footer className="shrink-0 border-t border-border/40 px-6 py-3 print:hidden">
            <p className="text-center text-xs text-muted-foreground/50">
              {APP_NAME} · Versão {APP_VERSION} · © Todos os direitos reservados ·{" "}
              <Link
                href="/privacidade"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Privacidade
              </Link>
            </p>
          </footer>
        </main>
      </div>
    </div>
  )
}
