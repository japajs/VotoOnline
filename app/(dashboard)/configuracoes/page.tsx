import type { Metadata } from "next"
import { getSession } from "@/lib/auth"
import { getAllConfiguracoes } from "@/services/configuracoes"
import { ContaSection } from "@/components/configuracoes/conta-section"
import { EmailSection } from "@/components/configuracoes/email-section"
import { VotacaoDefaultsSection } from "@/components/configuracoes/votacao-defaults-section"
import { SobreSection } from "@/components/configuracoes/sobre-section"

export const metadata: Metadata = { title: "Configurações" }

export default async function ConfiguracoesPage() {
  const [session, config] = await Promise.all([getSession(), getAllConfiguracoes()])
  // Config GLOBAL do sistema (conta do administrador, remetente de e-mail,
  // defaults de votação) é cross-tenant — só MASTER (administrador com acesso
  // total) vê e salva; as actions também exigem requireMaster. Um administrador
  // PESSOAL (restrito a condomínios) não deve mexer em config que afeta TODOS
  // os condomínios (ex.: encerramento automático). A troca da PRÓPRIA senha e o
  // "Sobre" seguem disponíveis pra todos os perfis.
  const isMaster = session?.perfil === "administrador" && session?.acessoTotal === true

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? ""
  const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY)
  const ambiente = process.env.NODE_ENV ?? "development"

  return (
    <div className="flex flex-col gap-6 p-6 pt-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Administração do sistema</p>
      </div>

      {/* Não-MASTER não recebe nem os valores globais nos props (evita vazar
          nome/e-mail do admin no payload da página) — só a troca de senha. */}
      <ContaSection
        adminNome={isMaster ? config.admin_nome : ""}
        adminEmail={isMaster ? config.admin_email : ""}
        isMaster={isMaster}
      />

      {isMaster && (
        <EmailSection
          fromEmail={fromEmail}
          nomeRemetente={config.email_nome_remetente}
          apiKeyConfigured={apiKeyConfigured}
        />
      )}

      {isMaster && (
        <VotacaoDefaultsSection
          defaults={{ votacao_encerramento_automatico: config.votacao_encerramento_automatico }}
        />
      )}

      <SobreSection ambiente={ambiente} />
    </div>
  )
}
