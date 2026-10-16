import type { Metadata } from "next"
import { Gavel } from "lucide-react"
import { APP_NAME } from "@/lib/constants"
import { VoltarLink } from "./voltar-link"

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: `Política de Privacidade do ${APP_NAME} — como os dados pessoais são tratados nas assembleias eletrônicas.`,
}

// E-mail de contato para assuntos de privacidade/LGPD. Trocar aqui se mudar.
const CONTATO_PRIVACIDADE = "cleitonsalazargomes@gmail.com"
const ATUALIZADO_EM = "12 de outubro de 2026"

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/40">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <span className="font-heading text-sm font-medium tracking-tight">{APP_NAME}</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Política de Privacidade
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>

        <div className="mt-8 space-y-7">
          <Secao titulo="1. Quem somos e do que trata esta política">
            <p>
              O <strong className="text-foreground">{APP_NAME}</strong> é uma plataforma de
              assembleias eletrônicas para condomínios, de titularidade de{" "}
              <strong className="text-foreground">Cleiton Salazar</strong>, licenciada por sessão de
              assembleia. Esta política explica, de forma transparente, como os dados pessoais são
              tratados quando um condomínio realiza uma assembleia usando a plataforma, em
              conformidade com a <strong className="text-foreground">LGPD (Lei nº 13.709/2018)</strong>.
            </p>
          </Secao>

          <Secao titulo="2. Papéis: quem decide e quem processa">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
              <li>
                O <strong className="text-foreground">condomínio</strong> (por meio do síndico/da
                administração) é o <strong className="text-foreground">controlador</strong> dos
                dados: é ele quem decide realizar a assembleia e tratar os dados dos moradores.
              </li>
              <li>
                O <strong className="text-foreground">{APP_NAME}</strong> atua como{" "}
                <strong className="text-foreground">operador</strong>: trata os dados em nome do
                condomínio, apenas para viabilizar a assembleia, seguindo suas instruções.
              </li>
            </ul>
          </Secao>

          <Secao titulo="3. Quais dados tratamos">
            <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
              <li>
                <strong className="text-foreground">Identificação do proprietário:</strong> nome,
                CPF/CNPJ, e-mail, telefone e a(s) unidade(s)/fração ideal vinculada(s).
              </li>
              <li>
                <strong className="text-foreground">Participação e voto:</strong> presença,
                procurações e os votos registrados em cada pauta (com o peso do voto).
              </li>
              <li>
                <strong className="text-foreground">Dados técnicos de auditoria:</strong> data/hora
                do voto, endereço IP e navegador utilizados — guardados apenas para integridade e
                auditoria da votação, nunca exibidos nos relatórios públicos.
              </li>
              <li>
                <strong className="text-foreground">Acesso administrativo:</strong> para quem opera o
                sistema (síndico/administração), nome, e-mail e credenciais de acesso.
              </li>
            </ul>
          </Secao>

          <Secao titulo="4. Para que usamos e com qual base legal">
            <p>Os dados são usados exclusivamente para:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
              <li>convocar e realizar a assembleia e coletar os votos de forma segura;</li>
              <li>apurar o resultado e gerar a ata e os relatórios oficiais;</li>
              <li>garantir a integridade e a auditabilidade da votação;</li>
              <li>comunicar os participantes sobre a assembleia (e-mails de convite/lembrete).</li>
            </ul>
            <p>
              As bases legais aplicáveis, definidas pelo condomínio (controlador), tendem a ser o{" "}
              <strong className="text-foreground">cumprimento de obrigação legal</strong> e o{" "}
              <strong className="text-foreground">legítimo interesse</strong> na realização de
              assembleias (Código Civil e convenção condominial), além do{" "}
              <strong className="text-foreground">consentimento</strong> quando aplicável.
            </p>
          </Secao>

          <Secao titulo="5. Com quem os dados são compartilhados">
            <p>
              Não vendemos dados pessoais. Para operar a plataforma, utilizamos prestadores de
              serviço (suboperadores) que tratam dados estritamente para esta finalidade:
            </p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
              <li>
                <strong className="text-foreground">Supabase</strong> — banco de dados (armazenamento
                dos registros da assembleia);
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> — envio dos e-mails de convite e
                lembrete;
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> — hospedagem da aplicação.
              </li>
            </ul>
            <p>
              Esses serviços podem processar dados em servidores fora do Brasil; nesses casos, a
              transferência observa as salvaguardas previstas na LGPD. Dados também podem ser
              compartilhados com autoridades quando houver obrigação legal.
            </p>
          </Secao>

          <Secao titulo="6. Por quanto tempo guardamos">
            <p>
              Os dados são mantidos pelo tempo necessário à realização da assembleia e à guarda da
              ata/relatórios, bem como para cumprir obrigações legais do condomínio e permitir a
              auditoria do resultado. Encerrada essa necessidade, os dados são eliminados ou
              anonimizados, salvo quando a lei exigir prazo maior.
            </p>
          </Secao>

          <Secao titulo="7. Segurança">
            <p>
              Adotamos medidas técnicas e organizacionais para proteger os dados, como criptografia
              em trânsito, controle de acesso por perfil, confirmação por senha em ações sensíveis,
              limites contra tentativas abusivas e trilha de auditoria. O detalhamento individual de
              votos nunca é exposto em pautas marcadas como sigilosas.
            </p>
          </Secao>

          <Secao titulo="8. Cookies">
            <p>
              Usamos apenas o essencial: um cookie de sessão para manter o login de quem opera o
              sistema. O link de voto do participante funciona por um endereço único e não depende de
              cookies de rastreamento.
            </p>
          </Secao>

          <Secao titulo="9. Seus direitos (titular dos dados)">
            <p>Conforme a LGPD, você pode solicitar, a qualquer momento:</p>
            <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
              <li>confirmação de que tratamos seus dados e acesso a eles;</li>
              <li>correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>informação sobre com quem os dados foram compartilhados;</li>
              <li>revogação do consentimento, quando essa for a base utilizada.</li>
            </ul>
            <p>
              Como o condomínio é o controlador, os pedidos relativos a uma assembleia devem ser
              direcionados a ele; o {APP_NAME}, como operador, apoia o atendimento desses pedidos.
            </p>
          </Secao>

          <Secao titulo="10. Alterações desta política">
            <p>
              Esta política pode ser atualizada para refletir melhorias ou mudanças legais. A data da
              última atualização fica sempre indicada no topo desta página.
            </p>
          </Secao>

          <Secao titulo="11. Contato">
            <p>
              Dúvidas ou pedidos sobre privacidade e proteção de dados:{" "}
              <a
                href={`mailto:${CONTATO_PRIVACIDADE}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {CONTATO_PRIVACIDADE}
              </a>
              .
            </p>
          </Secao>
        </div>

        <div className="mt-10 border-t border-border/40 pt-5">
          <VoltarLink className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" />
          <p className="mt-3 text-[11px] text-muted-foreground/60">
            © Cleiton Salazar · {APP_NAME} · uso licenciado por sessão de assembleia.
          </p>
        </div>
      </div>
    </div>
  )
}
