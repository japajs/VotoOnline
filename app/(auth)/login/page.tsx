import type { Metadata } from "next"
import Image from "next/image"
import { Suspense } from "react"
import { Gavel, Lock, ShieldCheck, Users, BarChart3 } from "lucide-react"
import { LoginForm } from "./login-form"
import { Skeleton } from "@/components/ui/skeleton"
import { APP_NAME, APP_AUTORIA } from "@/lib/constants"

export const metadata: Metadata = { title: "Entrar" }

const DESTAQUES = [
  { icon: ShieldCheck, titulo: "Segurança", descricao: "Ambiente seguro e criptografado." },
  { icon: Users, titulo: "Participação", descricao: "Moradores conectados às decisões." },
  { icon: BarChart3, titulo: "Transparência", descricao: "Resultados em tempo real e auditáveis." },
]

export default function LoginPage() {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.3fr_1fr]">
      {/* Hero — identidade visual fixa (navy), não segue o tema claro/escuro do app */}
      <div className="relative hidden overflow-hidden bg-[#0b1524] lg:block">
        <Image
          src="/login-hero.png"
          alt="Assembleia de condomínio acompanhada por tablet"
          fill
          priority
          className="object-cover"
          sizes="(min-width: 1024px) 60vw, 0px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1524] via-[#0b1524]/60 to-[#0b1524]/20" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div>
            <h2 className="max-w-lg text-4xl font-bold leading-tight tracking-tight">
              Decisões mais simples.
              <br />
              Participação mais segura.
            </h2>
            <p className="mt-4 max-w-sm text-white/75">Assembleias eletrônicas para condomínios.</p>
            <div className="mt-4 h-1 w-14 rounded-full bg-[#d4af37]" />
          </div>

          <div className="grid grid-cols-3 gap-6">
            {DESTAQUES.map((d) => (
              <div key={d.titulo}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <d.icon className="h-5 w-5 text-white" />
                </div>
                <p className="mt-3 text-sm font-semibold">{d.titulo}</p>
                <p className="mt-0.5 text-xs text-white/60">{d.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card de login — compacto e centralizado verticalmente */}
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-[67px] w-[67px] items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
              <Gavel className="h-[29px] w-[29px] text-primary" />
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Assembleias eletrônicas para condomínios</p>
          </div>

          <Suspense fallback={<Skeleton className="h-[120px] w-full rounded-xl" />}>
            <LoginForm />
          </Suspense>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Ambiente seguro • Acesso restrito
          </p>
          {/* Autoria/licenciamento (pedido do Carlos): primeira tela que um
              síndico vê numa demonstração. */}
          <p className="mt-3 text-center text-[11px] text-muted-foreground/70">{APP_AUTORIA}</p>
        </div>
      </div>
    </div>
  )
}
