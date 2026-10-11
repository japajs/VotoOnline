import type { Metadata } from "next"
import {
  BookOpen,
  Building2,
  ClipboardList,
  Unlock,
  Send,
  UserCheck,
  Gavel,
  Tv,
  BellRing,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { APP_NAME, APP_VERSION } from "@/lib/constants"

export const metadata: Metadata = { title: "Ajuda — Manual de uso" }

// Manual de uso do VotoOnline — para o síndico/operador que conduz as
// assembleias (NÃO é a documentação técnica; essa fica no README do projeto).
// Conteúdo estático, descrevendo só o que o sistema realmente faz.

function Secao({
  icon: Icon,
  titulo,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  titulo: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
}

// Item em destaque (nome do botão/conceito) — ajuda a bater o olho e achar
// no app o que o texto está citando.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.8125rem] font-medium text-foreground">
      {children}
    </span>
  )
}

export default function AjudaPage() {
  return (
    <div className="flex flex-col gap-6 p-6 pt-8">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground">
          <BookOpen className="h-6 w-6 text-primary" />
          Manual de uso
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Como conduzir uma assembleia no {APP_NAME}, do cadastro à apuração. Versão {APP_VERSION}.
        </p>
      </div>

      <Secao icon={BookOpen} titulo="O que é o VotoOnline">
        <p>
          É a plataforma para fazer <strong className="text-foreground">assembleias eletrônicas</strong>{" "}
          de condomínios. Você cadastra o condomínio, os proprietários e as unidades; cria a
          assembleia com as pautas; coleta os votos pela internet (com o peso certo de cada
          proprietário); e apura o resultado com ata e relatórios prontos para baixar.
        </p>
        <p>
          A votação funciona à distância, presencial ou das duas formas ao mesmo tempo (híbrida).
        </p>
      </Secao>

      <Secao icon={ShieldCheck} titulo="Perfis de acesso">
        <p>Cada pessoa que entra no sistema tem um perfil, que define o que ela pode fazer:</p>
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <Chip>Administrador</Chip> — faz tudo, inclusive cadastrar e gerenciar os outros
            usuários.
          </li>
          <li>
            <Chip>Operador</Chip> — conduz as assembleias (abre, pausa, encerra, dispara, marca
            presença, registra voto, exporta) e cuida dos condomínios e proprietários. Não gerencia
            usuários.
          </li>
          <li>
            <Chip>Visualizador</Chip> — só acompanha: vê a apuração, a lista de presença e o telão,
            mas não altera nada. É o perfil ideal para o advogado/assessoria acompanhar a
            assembleia.
          </li>
        </ul>
      </Secao>

      <Secao icon={Building2} titulo="1. Cadastro: condomínio, proprietários e unidades">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            Em <Chip>Condomínios</Chip>, crie o condomínio. Escolha o{" "}
            <strong className="text-foreground">critério de peso do voto</strong>: por{" "}
            <em>unidade</em> (cada imóvel vale um voto) ou por <em>fração ideal</em> (o voto vale o
            percentual da unidade). O peso de cada proprietário é calculado sozinho pelas unidades
            vinculadas.
          </li>
          <li>
            Cadastre os proprietários e vincule as unidades de cada um. Preencher o{" "}
            <strong className="text-foreground">CPF</strong> é importante: é ele que permite a pessoa
            entrar e votar pelo link do WhatsApp.
          </li>
          <li>
            Proprietário marcado como <Chip>Inadimplente</Chip> fica bloqueado de votar.
          </li>
          <li>
            Tem muita gente? Use o menu <Chip>Importação</Chip> para cadastrar tudo de uma vez por
            planilha.
          </li>
        </ul>
      </Secao>

      <Secao icon={ClipboardList} titulo="2. Criar a assembleia e as pautas">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            Dentro do condomínio, em <Chip>Assembleias</Chip>, crie a assembleia.
          </li>
          <li>
            Adicione as <strong className="text-foreground">pautas</strong>. Cada uma pode ser{" "}
            <em>Sim / Não</em> ou de <em>múltipla escolha</em>, com a opção de permitir{" "}
            <em>Abstenção</em>.
          </li>
          <li>Enquanto não houver votos, você ainda pode editar a assembleia e as pautas.</li>
        </ul>
      </Secao>

      <Secao icon={Unlock} titulo="3. Abrir a votação">
        <p>
          Na lista de assembleias, clique em <Chip>Abrir</Chip>. O estado da assembleia segue este
          caminho: <em>Rascunho → Aberta → (Pausada, se precisar) → Encerrada</em>. O botão{" "}
          <Chip>Gerenciar</Chip> abre a tela completa da assembleia (para o Visualizador aparece
          como <Chip>Acompanhar</Chip>).
        </p>
      </Secao>

      <Secao icon={Send} titulo="4. Como as pessoas votam">
        <p>Há dois caminhos — você pode usar só um ou os dois juntos:</p>
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <strong className="text-foreground">Por e-mail:</strong> o botão <Chip>Disparar</Chip>{" "}
            envia a cada proprietário com e-mail o seu link pessoal de voto.
          </li>
          <li>
            <strong className="text-foreground">Link de entrada (WhatsApp):</strong> copie o{" "}
            <Chip>Link de entrada</Chip> e cole no grupo. A pessoa se identifica pela{" "}
            <em>unidade + CPF</em> e entra para votar. Ótimo para a assembleia presencial ou híbrida.
          </li>
        </ul>
        <p className="text-xs">
          Cada pessoa vota uma única vez por pauta. O voto é individual e o peso é congelado no
          momento do voto.
        </p>
      </Secao>

      <Secao icon={UserCheck} titulo="5. Presença">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            Você pode <strong className="text-foreground">exigir presença confirmada pela mesa</strong>:
            com isso ligado, só vota quem a mesa marcar como presente. É a garantia de que o voto fica
            amarrado a quem realmente está na assembleia.
          </li>
          <li>
            <strong className="text-foreground">Marcar presença:</strong> direto na lista de
            proprietários (a bolinha ao lado do nome, com a assembleia aberta) ou pela{" "}
            <Chip>Chamada</Chip> dentro da assembleia. O <span className="text-emerald-600 dark:text-emerald-400">check verde</span>{" "}
            indica quem está presente — e continua à vista mesmo quando você filtra por
            &quot;Votaram&quot; ou &quot;Não votaram&quot;.
          </li>
          <li>Não é possível desmarcar a presença de quem já votou.</li>
        </ul>
      </Secao>

      <Secao icon={Gavel} titulo="6. Procurações e voto manual">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <strong className="text-foreground">Procurações:</strong> dentro da assembleia dá para
            registrar quem vota representando outra unidade.
          </li>
          <li>
            <strong className="text-foreground">Registrar voto:</strong> para quem não tem e-mail ou
            votou na mão, use <Chip>Registrar voto</Chip> dentro da assembleia para lançar o voto
            manualmente.
          </li>
        </ul>
      </Secao>

      <Secao icon={BellRing} titulo="7. Acompanhar e cobrar quem falta">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            Na lista de proprietários, use os filtros <Chip>Geral</Chip> · <Chip>Presentes</Chip> ·{" "}
            <Chip>Votaram</Chip> · <Chip>Não votaram</Chip> para enxergar o andamento na hora.
          </li>
          <li>
            O botão <Chip>Lembrar quem não votou</Chip> reenvia o e-mail só para quem ainda está
            pendente.
          </li>
        </ul>
      </Secao>

      <Secao icon={Tv} titulo="8. Telão ao vivo">
        <p>
          O botão <Chip>Telão</Chip> abre uma tela cheia que se atualiza sozinha, pensada para
          projetar no salão. Mostra o resultado parcial em tempo real. Está liberado inclusive para o
          Visualizador — o advogado pode abrir e acompanhar sem depender do síndico.
        </p>
      </Secao>

      <Secao icon={LockKeyhole} titulo="9. Encerrar e apurar">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <Chip>Encerrar</Chip> fecha a votação. A tela passa a mostrar o resultado ponderado (em
            imóveis ou em % da fração ideal, conforme o critério do condomínio).
          </li>
          <li>
            Baixe os relatórios: <strong className="text-foreground">PDF</strong>,{" "}
            <strong className="text-foreground">Excel</strong> e a{" "}
            <strong className="text-foreground">Ata</strong>.
          </li>
          <li>
            Se precisar corrigir algo, dá para <Chip>Reabrir</Chip> a assembleia encerrada.
          </li>
        </ul>
      </Secao>

      <p className="px-1 text-xs text-muted-foreground">
        Ficou com dúvida ou achou algo estranho? Fale com o administrador do sistema. {APP_NAME} ·
        versão {APP_VERSION}.
      </p>
    </div>
  )
}
