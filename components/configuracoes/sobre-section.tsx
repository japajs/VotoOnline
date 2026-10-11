import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { APP_NAME, APP_VERSION, ROUTES } from "@/lib/constants"

interface SobreSectionProps {
  ambiente: string
}

// `href` opcional: quando presente, o valor vira um link interno (ex.: a linha
// "Documentação" aponta pro manual de uso em /ajuda).
function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {value}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className="text-sm font-medium tabular-nums">{value}</span>
      )}
    </div>
  )
}

export function SobreSection({ ambiente }: SobreSectionProps) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Sobre o Sistema</CardTitle>
      </CardHeader>
      <CardContent>
        <Row label="Aplicação" value={APP_NAME} />
        <Row label="Versão" value={APP_VERSION} />
        <Row label="Ambiente" value={ambiente === "production" ? "Produção" : "Desenvolvimento"} />
        <Row label="Banco de dados" value="Supabase (PostgreSQL)" />
        <Row label="E-mail" value="Resend" />
        <Row label="Hospedagem" value="Vercel" />
        <Row label="Documentação" value="Abrir manual de uso" href={ROUTES.ajuda} />
      </CardContent>
    </Card>
  )
}
