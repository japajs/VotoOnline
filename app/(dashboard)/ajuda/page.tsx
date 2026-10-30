import type { Metadata } from "next"
import {
  BookOpen,
  Building2,
  ClipboardList,
  Unlock,
  Send,
  ListChecks,
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
            Informe o <strong className="text-foreground">CNPJ</strong> do condomínio: é exigido pelo
            cartório para registrar a ata e sai impresso nos relatórios.
          </li>
          <li>
            Cadastre os proprietários e vincule as unidades de cada um. Preencher o{" "}
            <strong className="text-foreground">CPF</strong> é importante: é ele que permite a pessoa
            entrar e votar pelo link do WhatsApp. Se o condomínio tem{" "}
            <strong className="text-foreground">blocos</strong>, grave a unidade já com o bloco junto
            (ex.: <Chip>A0101</Chip>, <Chip>B0203</Chip>) — é exatamente assim que a pessoa vai
            digitar para entrar.
          </li>
          <li>
            Proprietário marcado como <Chip>Inadimplente</Chip> fica bloqueado de votar.
          </li>
          <li>
            Opcionalmente, grave o <strong className="text-foreground">Cônjuge / 2º participante</strong>{" "}
            (o co-dono que costuma comparecer). Na assembleia ele vira um atalho de um toque para
            anotar quem participou pelo imóvel. Também pode vir já preenchido pela planilha de
            importação.
          </li>
          <li>
            Se você cadastrar alguém com um <strong className="text-foreground">nome que já existe</strong>{" "}
            no condomínio, o sistema avisa na hora — para você confirmar se é a mesma pessoa (e evitar
            o cadastro duplicado) ou outra pessoa com o mesmo nome.
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
          <li>
            <strong className="text-foreground">Quórum mínimo (opcional):</strong> o percentual do
            condomínio que precisa participar para a assembleia valer. Em branco, o sistema não checa
            quórum.
          </li>
          <li>
            <strong className="text-foreground">1ª / 2ª convocação (opcional):</strong> informe a{" "}
            <strong className="text-foreground">data-limite da 1ª convocação</strong>; passada ela,
            vale o <strong className="text-foreground">quórum da 2ª convocação</strong>. Essa
            data-limite precisa ficar <strong className="text-foreground">entre a abertura e o
            encerramento</strong>.
          </li>
          <li>Enquanto não houver votos, você ainda pode editar a assembleia e as pautas.</li>
          <li>
            Se o botão <Chip>Salvar</Chip> ficar bloqueado, o sistema mostra o{" "}
            <strong className="text-foreground">motivo logo abaixo</strong> (ex.: falta o título, ou a
            data da 1ª convocação está fora da janela) — é só ajustar o que ele apontar.
          </li>
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
            Em condomínio com blocos, ela digita a unidade <strong className="text-foreground">com o
            bloco junto</strong> (ex.: <Chip>A0101</Chip>).
          </li>
        </ul>
        <p className="text-xs">
          Cada pessoa vota uma única vez por pauta. O voto é individual e o peso é congelado no
          momento do voto.
        </p>
      </Secao>

      <Secao icon={ListChecks} titulo="5. Votação pauta por pauta (opcional)">
        <p>
          Modo para conduzir a assembleia no ritmo do salão: em vez de liberar todas as pautas de
          uma vez, a mesa abre e fecha a votação de{" "}
          <strong className="text-foreground">cada pauta</strong>, uma por vez.
        </p>
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            Na tela de apuração, ligue <Chip>Pauta por pauta</Chip>. Aí cada pauta ganha os botões{" "}
            <Chip>Abrir votação</Chip> e <Chip>Fechar votação</Chip>.
          </li>
          <li>
            O rito: discute a pauta → <strong className="text-foreground">Abrir votação</strong> →
            dá o tempo → <strong className="text-foreground">Fechar votação</strong> → próxima.
            Precisou voltar numa pauta? É só <Chip>Abrir</Chip> de novo (sem reabrir a assembleia
            toda).
          </li>
          <li>
            No celular do condômino aparece{" "}
            <strong className="text-foreground">só a pauta aberta no momento</strong> (as já votadas
            como &quot;Votada&quot;, as próximas como &quot;Aguardando&quot;), e a tela dele{" "}
            <strong className="text-foreground">atualiza sozinha</strong> quando você abre a próxima.
          </li>
          <li>Segurança: voto numa pauta que a mesa ainda não abriu é recusado.</li>
        </ul>
        <p className="text-xs">
          Desligado (padrão): abrir a assembleia libera todas as pautas de uma vez, como sempre.
        </p>
      </Secao>

      <Secao icon={UserCheck} titulo="6. Presença">
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
            &quot;Votou geral&quot; ou &quot;Não votaram&quot;. Duas pessoas podem marcar presença ao
            mesmo tempo, em celulares diferentes: a tela de uma atualiza o que a outra marcou em
            poucos segundos.
          </li>
          <li>
            <strong className="text-foreground">Entrada automática:</strong> com &quot;exigir
            presença&quot; ligado, o condômino informa unidade + CPF uma vez e vê uma mensagem para
            aguardar. Assim que a mesa marca ele como presente, o celular dele{" "}
            <strong className="text-foreground">entra sozinho</strong> na votação — não precisa
            digitar de novo.
          </li>
          <li>
            <strong className="text-foreground">Quem participou pelo imóvel:</strong> quando quem
            compareceu não é o titular do cadastro (ex.: o imóvel está no nome do marido e veio a
            esposa, também dona — diferente de procuração), anote o nome na linha do proprietário (um
            toque usa o cônjuge cadastrado, se houver). Essa anotação sai no detalhamento do relatório
            de apuração (PDF).
          </li>
          <li>Não é possível desmarcar a presença de quem já votou.</li>
        </ul>
      </Secao>

      <Secao icon={Gavel} titulo="7. Procurações e voto manual">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <strong className="text-foreground">Procurações:</strong> dentro da assembleia dá para
            registrar quem vota representando outra unidade.
          </li>
          <li>
            <strong className="text-foreground">Limite de procurações:</strong> no cadastro do
            condomínio dá para definir o máximo de procurações que uma mesma pessoa pode receber
            (varia conforme a convenção). Ao passar do limite, o sistema <strong className="text-foreground">avisa</strong>{" "}
            — e você decide registrar assim mesmo ou escolher outro representante.
          </li>
          <li>
            <strong className="text-foreground">Registrar voto manual:</strong> para quem não tem
            e-mail ou votou na mão. Use <Chip>Registrar voto manual</Chip> no topo da lista (busca a
            pessoa) ou, mais rápido, pelo <strong className="text-foreground">ícone na coluna Ações da
            própria linha</strong> do proprietário — já com o ponteiro na pessoa, sem trocar de tela.
            Com &quot;exigir presença&quot; ligado, só aparece quem já está presente; e o imóvel
            aparece na frente do nome (dá para buscar pelo nome ou pela unidade, ex.: &quot;A0101&quot;).
          </li>
          <li>
            <strong className="text-foreground">Data e hora do voto:</strong> no voto manual dá para
            ajustar a data/hora — útil quando a pessoa votou antes (ex.: no chat da reunião) e você
            lança depois. Sem mexer, vale a hora atual.
          </li>
          <li>
            O sistema <strong className="text-foreground">não registra voto de quem não tem imóvel
            vinculado</strong> (sem peso de voto) — nem pela mesa, nem pelo link. Vincule um imóvel ao
            cadastro ou registre por procuração.
          </li>
        </ul>
      </Secao>

      <Secao icon={BellRing} titulo="8. Acompanhar e cobrar quem falta">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            Na lista de proprietários, use os filtros <Chip>Imóveis</Chip> · <Chip>Presentes</Chip> ·{" "}
            <Chip>Votou geral</Chip> · <Chip>Votou parcial</Chip> · <Chip>Não votaram</Chip> para
            enxergar o andamento na hora (do total de imóveis, os presentes; dos presentes, quem
            votou geral, parcial ou ainda não votou).
          </li>
          <li>
            O botão <Chip>Lembrar quem não votou</Chip> reenvia o e-mail só para quem ainda está
            pendente.
          </li>
          <li>
            <strong className="text-foreground">Modo compartilhar (LGPD):</strong> o botão{" "}
            <Chip>Modo compartilhar</Chip> oculta e-mail, CPF e celular da lista e deixa só nome
            (com quem participou pelo imóvel, quando anotado), situação e imóvel — útil para projetar
            ou compartilhar a tela (ex.: os presentes online
            conferirem se já constam como presentes) sem expor os dados dos condôminos. Clicar de
            novo volta ao normal.
          </li>
        </ul>
      </Secao>

      <Secao icon={Tv} titulo="9. Telão ao vivo">
        <p>
          O botão <Chip>Telão</Chip> abre uma tela cheia que se atualiza sozinha, pensada para
          projetar no salão. Mostra o resultado parcial em tempo real. Está liberado inclusive para o
          Visualizador — o advogado pode abrir e acompanhar sem depender do síndico.
        </p>
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <strong className="text-foreground">QR de entrada fixo:</strong> enquanto a votação está
            aberta, o telão mantém o <strong className="text-foreground">QR de entrada fixo no
            canto</strong>, sempre à vista mesmo rolando a tela — os presentes escaneiam e entram
            para votar sem sair do lugar.
          </li>
          <li>
            Quando a assembleia está <strong className="text-foreground">pausada</strong>, o telão
            mostra <Chip>PAUSADA</Chip> (não &quot;AO VIVO&quot;), para não dar a entender que ainda
            está recebendo voto.
          </li>
        </ul>
      </Secao>

      <Secao icon={LockKeyhole} titulo="10. Encerrar e apurar">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-muted-foreground/50">
          <li>
            <Chip>Encerrar</Chip> fecha a votação. A tela passa a mostrar o resultado ponderado (em
            imóveis ou em % da fração ideal, conforme o critério do condomínio).
          </li>
          <li>
            <strong className="text-foreground">Hora do encerramento:</strong> dá para corrigir a
            data/hora que a mesa declarou encerrada (sai no boletim e na ata) sem precisar reabrir a
            assembleia.
          </li>
          <li>
            <strong className="text-foreground">Mesa da ata (3 assinaturas):</strong> antes de gerar
            a Ata, use o botão <Chip>Mesa</Chip> (ao lado da Ata) para informar{" "}
            <strong className="text-foreground">presidente</strong> e{" "}
            <strong className="text-foreground">secretário</strong> — a ata sai com as três
            assinaturas (síndico, presidente e secretário). Em branco, sai só a linha com o cargo
            (assina à mão).
          </li>
          <li>
            Baixe os relatórios: <strong className="text-foreground">PDF</strong>,{" "}
            <strong className="text-foreground">Excel</strong> e a{" "}
            <strong className="text-foreground">Ata</strong>. O PDF já sai com os dados completos do
            condomínio (CNPJ, endereço, síndico, contato e critério de peso) e{" "}
            <strong className="text-foreground">sem expor e-mails</strong> dos votantes (LGPD).
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
