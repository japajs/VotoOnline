"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Building2,
  Calendar,
  FileSpreadsheet,
  FileText,
  Gavel,
  LogOut,
  Settings,
  Users,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logoutAction } from "@/app/actions/auth"
import { APP_NAME } from "@/lib/constants"
import type { SessionUser, UserPerfil } from "@/types"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

// A navegação é agrupada porque as seis entradas não são do mesmo tipo:
// quatro são o trabalho do dia a dia, duas são manutenção do sistema.
// Numa lista corrida essa diferença some.
const NAV_OPERACAO: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: BarChart3       },
  { href: "/condominios", label: "Condomínios", icon: Building2       },
  { href: "/calendario",  label: "Calendário",  icon: Calendar        },
  { href: "/importacao",  label: "Importação",  icon: FileSpreadsheet },
  { href: "/relatorios",  label: "Relatórios",  icon: FileText        },
]

// "Usuários" só aparece para administrador — mesma tela que gerencia perfil
// e escopo por condomínio (MASTER/PESSOAL) dos demais usuários.
const NAV_SISTEMA: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings },
]
const NAV_ITEM_USUARIOS: NavItem = { href: "/usuarios", label: "Usuários", icon: Users }

const PERFIL_LABELS: Record<UserPerfil, string> = {
  administrador: "Administrador",
  operador: "Operador",
  visualizador: "Visualizador",
}

// Tons claros porque o rail é escuro — os do conteúdo (600/700) ficariam
// ilegíveis sobre a tinta naval.
const PERFIL_COLORS: Record<UserPerfil, string> = {
  administrador: "text-sidebar-primary",
  operador: "text-amber-300/80",
  visualizador: "text-emerald-300/80",
}

/** Iniciais do nome, no máximo duas — "Ana Maria Costa" vira "AC". */
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  const primeira = partes[0][0]
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ""
  return (primeira + ultima).toUpperCase()
}

interface Props {
  user: SessionUser
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ user, open, onClose }: Props) {
  const pathname = usePathname()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Auditoria de responsividade: ao abrir o menu mobile, move o foco pro
  // botão de fechar — sem isso, o foco do teclado ficava para trás, na
  // página (agora coberta pelo overlay), em vez de entrar no menu aberto.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  const sistema =
    user.perfil === "administrador" ? [...NAV_SISTEMA, NAV_ITEM_USUARIOS] : NAV_SISTEMA

  function renderItem({ href, label, icon: Icon }: NavItem) {
    const isActive = pathname === href || pathname.startsWith(href + "/")
    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium",
          "outline-none transition-colors duration-150",
          "focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
          "lg:min-h-0 lg:py-2 lg:text-sm",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        {/* Marcador na borda do rail — âncora fixa que diz onde você está
            mesmo com o fundo do item sendo discreto. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary",
            "transition-opacity duration-150",
            isActive ? "opacity-100" : "opacity-0"
          )}
        />
        <Icon
          className={cn(
            "h-[1.125rem] w-[1.125rem] shrink-0 transition-colors",
            isActive
              ? "text-sidebar-primary"
              : "text-sidebar-muted-foreground/70 group-hover:text-current"
          )}
          strokeWidth={isActive ? 2 : 1.75}
        />
        {label}
      </Link>
    )
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/15 ring-1 ring-sidebar-primary/25">
          <Gavel className="h-4 w-4 text-sidebar-primary" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[0.9375rem] leading-tight font-medium tracking-tight">
            {APP_NAME}
          </p>
          <p className="text-[0.5625rem] leading-tight font-medium tracking-[0.14em] text-sidebar-muted-foreground uppercase">
            Assembleias digitais
          </p>
        </div>
        {onClose && (
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="-mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-md text-sidebar-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        <ul className="space-y-0.5">
          {NAV_OPERACAO.map((item) => (
            <li key={item.href}>{renderItem(item)}</li>
          ))}
        </ul>

        <p className="mt-6 mb-1.5 px-3 text-[0.5625rem] font-semibold tracking-[0.14em] text-sidebar-muted-foreground uppercase">
          Sistema
        </p>
        <ul className="space-y-0.5">
          {sistema.map((item) => (
            <li key={item.href}>{renderItem(item)}</li>
          ))}
        </ul>
      </nav>

      {/* User + Logout */}
      <div className="border-t border-sidebar-border p-2.5">
        {/* Info do usuário */}
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-[0.6875rem] font-semibold tracking-wide text-sidebar-primary ring-1 ring-sidebar-primary/25"
          >
            {iniciais(user.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] leading-tight font-medium text-sidebar-foreground">
              {user.nome}
            </p>
            <p
              className={cn(
                "truncate text-[0.5625rem] leading-tight font-semibold tracking-[0.12em] uppercase",
                PERFIL_COLORS[user.perfil]
              )}
            >
              {PERFIL_LABELS[user.perfil]}
            </p>
          </div>
        </div>

        {/* Logout */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-sidebar-muted-foreground outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 lg:min-h-0 lg:py-2 lg:text-sm"
          >
            <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={1.75} />
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
