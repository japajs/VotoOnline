import type { Metadata } from "next"
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { Clock, CheckCircle2 } from "lucide-react"
import { getAssembleiaById } from "@/services/assembleias"
import { isEmAndamento } from "@/lib/assembleia-status"
import { EntrarForm } from "@/components/assembleias/entrar-form"
import { APP_NAME } from "@/lib/constants"

interface Props {
  params: Promise<{ assembleiaId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assembleiaId } = await params
  try {
    const a = await getAssembleiaById(assembleiaId)
    return { title: a ? `Entrar — ${a.titulo}` : APP_NAME }
  } catch {
    return { title: APP_NAME }
  }
}

// Link público de entrada (Opção A). Um único link por assembleia, divulgado
// de graça (grupo de WhatsApp / aviso no prédio). O proprietário se identifica
// por unidade + CPF, entra (marca presença) e é levado pro voto. Sem token por
// pessoa aqui — é o mesmo link pra todo mundo.
export default async function EntrarPage({ params }: Props) {
  const { assembleiaId } = await params

  let assembleia
  try {
    assembleia = await getAssembleiaById(assembleiaId)
  } catch {
    notFound()
  }
  if (!assembleia) notFound()

  const header = (
    <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto max-w-md px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{APP_NAME}</p>
      </div>
    </div>
  )

  const heading = (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">
        Assembleia de condomínio
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{assembleia.titulo}</h1>
      {assembleia.descricao && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{assembleia.descricao}</p>
      )}
    </div>
  )

  const wrap = (children: ReactNode) => (
    <div className="min-h-screen bg-background">
      {header}
      <div className="mx-auto max-w-md px-4 py-10">
        {heading}
        {children}
      </div>
    </div>
  )

  // Só dá pra entrar enquanto a assembleia está em andamento (aberta/pausada).
  if (!isEmAndamento(assembleia.status)) {
    const encerrada = assembleia.status === "encerrada"
    return wrap(
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border">
          {encerrada ? (
            <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
          ) : (
            <Clock className="h-7 w-7 text-muted-foreground" />
          )}
        </div>
        <p className="font-medium">
          {encerrada
            ? "Esta assembleia já foi encerrada."
            : "A votação ainda não foi iniciada. Volte a este link quando o síndico abrir."}
        </p>
      </div>
    )
  }

  return wrap(
    <div className="rounded-xl border border-border/60 bg-card px-6 py-8">
      <p className="mb-5 text-sm text-muted-foreground">
        Confirme sua identidade para entrar na assembleia e votar. Informe a sua unidade e o seu
        CPF cadastrado.
      </p>
      <EntrarForm assembleiaId={assembleia.id} />
    </div>
  )
}
