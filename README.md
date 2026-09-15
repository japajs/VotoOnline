# VotoOnline

Sistema de Assembleias Eletrônicas para Condomínios.

Gerencie assembleias, proprietários, unidades e votações eletrônicas de múltiplos condomínios em uma única plataforma.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | Tailwind CSS v4 + shadcn/ui (Base UI) |
| Banco de dados | Supabase (PostgreSQL) |
| E-mail | Resend |
| Auth | JWT (HS256) em cookie HttpOnly via `jose` + bcryptjs |
| Testes | Vitest |
| Monitoramento de erros | Sentry (opcional) |
| Deploy | Vercel (recomendado) |

---

## Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com)
- Conta no [Resend](https://resend.com) com domínio verificado

---

## Configuração local

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar arquivo de variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha todas as variáveis conforme descrito em [Variáveis de ambiente](#variáveis-de-ambiente).

### 3. Criar tabelas no Supabase

Acesse **Dashboard → SQL Editor** e execute o schema em `supabase/schema.sql` (é idempotente — pode ser rodado de novo com segurança se o banco já existir; blocos de migração aditivos ao longo do arquivo documentam a evolução do schema).

### 4. Primeiro acesso

```bash
npm run dev
```

Acesse `http://localhost:3000` — será redirecionado para `/setup` para criar o primeiro administrador.

---

## Variáveis de ambiente

### Supabase

Obtenha em **Dashboard → Settings → API**:

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role (secreta) — usada em **todo** acesso ao banco pela aplicação (ver [Segurança e RLS](#segurança-e-rls)) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon (pública). **Não é usada em nenhum lugar do código hoje** — não existe cliente Supabase no navegador, tudo passa pelo servidor com a service role key. Mantida aqui só caso um cliente client-side seja adicionado no futuro; pode ser omitida sem quebrar nada. |

### Resend

| Variável | Descrição |
|---|---|
| `RESEND_API_KEY` | API key do Resend (`re_...`) |
| `RESEND_FROM_EMAIL` | Remetente verificado (ex.: `VotoOnline <no-reply@seudominio.com>`) — o domínio precisa estar verificado (DNS) na conta Resend |

### Auth

| Variável | Descrição |
|---|---|
| `AUTH_PASSWORD` | Segredo usado para **assinar os JWT de sessão** (HMAC HS256) — apesar do nome (herdado de uma versão anterior com senha única compartilhada), não é mais a senha de login de ninguém: login hoje é por usuário, com senha própria com hash bcrypt na tabela `usuarios`. Use uma string longa e aleatória (`openssl rand -base64 32`), nunca uma senha memorável — trocar este valor invalida todas as sessões ativas na hora. |

### App

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública sem barra final (ex.: `https://votoonline.vercel.app`) — usada para montar o link de votação (`/v/[token]`) enviado por e-mail |

### Sentry (opcional)

Só necessário se for usar monitoramento de erros. Sem essas variáveis o Sentry simplesmente não reporta nada — não quebra a aplicação.

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | DSN do projeto Sentry (público) |
| `SENTRY_ORG` | Slug da organização Sentry — só usado em **build** (upload de source maps) |
| `SENTRY_PROJECT` | Slug do projeto Sentry — só usado em **build** |
| `SENTRY_AUTH_TOKEN` | Token de autenticação — só usado em **build**, nunca em runtime |

---

## Testes

```bash
npm test          # roda a suíte uma vez
npm run test:watch # observa arquivos e roda de novo a cada mudança
```

Cobertura atual: funções puras de cálculo de peso/quórum (`lib/peso.ts`) e a lógica de agrupamento da importação de planilha (`lib/importacao/processor.ts`), incluindo um teste de regressão para o bug de e-mail compartilhado descrito em [Importação de proprietários](#importação-de-proprietários). Nenhum teste toca o banco de dados — são todos isolados, sem chamar `createServerClient()`.

Ainda não há cobertura para a camada de `services/` (que fala com o Supabase) nem para os componentes React — ver [Problemas conhecidos e melhorias futuras](#problemas-conhecidos-e-melhorias-futuras).

---

## Deploy na Vercel

1. Faça push para GitHub
2. Importe em [vercel.com/new](https://vercel.com/new)
3. Adicione todas as variáveis de ambiente obrigatórias (Sentry é opcional)
4. Deploy automático a cada push em `main`

### Checklist pré-deploy

- [ ] Tabelas criadas no Supabase (`supabase/schema.sql` executado)
- [ ] Domínio de e-mail verificado no Resend
- [ ] `RESEND_FROM_EMAIL` usa o domínio verificado
- [ ] `NEXT_PUBLIC_APP_URL` aponta para a URL de produção (sem barra final)
- [ ] `AUTH_PASSWORD` definido com valor forte e aleatório
- [ ] Build local limpo: `npm run build`
- [ ] Testes passando: `npm test`

---

## Estrutura do projeto

```
app/
  (auth)/login/            # Página de login
  (auth)/setup/            # Configuração inicial (primeiro admin)
  (dashboard)/             # Páginas protegidas (exigem sessão — ver proxy.ts)
    dashboard/             # Métricas gerais e resumo por condomínio
    condominios/[id]/      # Detalhe de condomínio, proprietários, assembleias
    importacao/            # Importação de proprietários via XLSX/CSV
    configuracoes/         # Configurações do sistema
    relatorios/            # Relatórios consolidados entre condomínios
    usuarios/              # Gestão de usuários (perfis)
  actions/                 # Server Actions (toda escrita no banco passa por aqui)
  api/condominios/[id]/    # Export XLSX de proprietários
  api/relatorios/          # Geração de PDF/XLSX de apuração e ata
  v/[token]/               # Página pública de votação (sem autenticação)

components/
  assembleias/             # Criação, apuração, votação, procurações, status
  condominios/             # Lista, cadastro
  proprietarios/           # Formulários, listagem, coproprietários
  importacao/              # Assistente de importação
  configuracoes/           # Seções de configurações
  dashboard/               # Tabelas e resumos do painel
  layout/                  # Sidebar, shell do dashboard
  ui/                      # Componentes base (shadcn/ui + Base UI)

services/                  # Toda consulta/escrita no Supabase vive aqui —
                            # nenhum componente ou action fala com o banco
                            # diretamente
lib/
  auth.ts                  # Sessão JWT
  peso.ts                  # Peso de voto e quórum 1ª/2ª convocação
  assembleia-status.ts      # Rótulos/cores/regras de status de assembleia
  importacao/               # Parsing e agrupamento da planilha de importação
  relatorios/                # Geração de PDF (react-pdf) e XLSX (xlsx)
  rate-limit.ts             # Limite de tentativas (voto, login)
  supabase/                 # Cliente Supabase (server-only) e tipos gerados

proxy.ts                    # Middleware de autenticação (roda no edge)
supabase/schema.sql          # Schema completo do banco + migrações aditivas
```

---

## Conceitos e regras de negócio

Esta seção é o que mais importa pra quem for dar manutenção — as regras aqui não são óbvias só lendo o código isolado.

### Peso de voto

Cada condomínio tem um `criterio_peso`: `"unidade"` (padrão — 1 unidade = 1 voto) ou `"fracao_ideal"` (peso = soma da fração ideal das unidades do proprietário, o padrão legal brasileiro salvo disposição diversa na convenção). Ver `lib/peso.ts`. O peso é **sempre calculado ao vivo** a partir das unidades atuais — nunca armazenado no cadastro — exceto no momento do voto, quando é **congelado** em `assembleia_respostas.peso` e nas colunas `*_snapshot` de `assembleia_sends`. Uma venda de unidade depois do voto nunca altera um resultado já apurado.

### Quórum 1ª/2ª convocação

`quorum_minimo` vale até a data-limite `data_1a_convocacao`; depois dela, vale `quorum_minimo_2a` (tipicamente menor). Como a votação é assíncrona (por e-mail, ao longo de dias — não uma reunião num instante só), "convocação" aqui é uma data-limite, não uma hora com tolerância. Ver `getQuorumEfetivo` em `lib/peso.ts`.

### Status da assembleia

`rascunho → aberta → encerrada`, com um estado adicional `pausada` (suspensão temporária, não fecha a votação de vez). Regras importantes:

- **`encerrada` é definitiva** por padrão — a função genérica de troca de status (`updateAssembleiaStatus`) bloqueia qualquer tentativa de sair de `encerrada`. A única exceção é `reabrirAssembleia`, uma função **separada e explícita**, pensada para correção pontual (ex.: remover um voto indevido), não para uso rotineiro.
- **`pausada`** existe pra interromper temporariamente sem perder nada: some com o botão de votar, mas não mexe em nenhum voto já registrado. Ao contrário de `encerrada`, pausar/retomar é livre, sem confirmação.
- Só `aberta` aceita voto novo (`isVotacaoAberta` em `lib/assembleia-status.ts`); `aberta` e `pausada` juntas contam como "em andamento" pra fins de trava operacional — ex.: `hasAssembleiaAberta` bloqueia transferência de unidade ou troca de `criterio_peso` durante as duas, não só durante `aberta`.

### Inadimplente

Um proprietário marcado como `inadimplente` é bloqueado de votar (Código Civil, art. 1.335, §único) — tanto no link de autoatendimento quanto no lançamento manual pelo síndico, **sem exceção**, inclusive por procuração (um inadimplente não pode outorgar nem receber procuração). Ver `getIdsInadimplentes` em `services/proprietarios.ts`, chamada tanto em `services/procuracoes.ts` quanto em `services/assembleia-votos.ts`.

### Procuração

Um proprietário (outorgante) pode delegar o próprio voto a outro proprietário já cadastrado no mesmo condomínio (outorgado) — nunca a alguém de fora. O outorgante fica bloqueado de votar sozinho; o voto do outorgado soma o peso de todas as unidades de quem delegou pra ele. Só é possível enquanto nenhum dos dois lados já votou nesta assembleia (ver `services/procuracoes.ts`). Um outorgado que não é proprietário de nenhuma unidade real pode ser cadastrado só com nome + e-mail (sem vincular unidade) exclusivamente pra esse fim.

### Importação de proprietários

`lib/importacao/processor.ts` agrupa linhas da planilha em proprietários por **nome + e-mail juntos** (não só e-mail). Isso existe por um bug real encontrado em produção: quando várias unidades de donos **diferentes** compartilhavam um mesmo contato (zelador, portaria, administradora), agrupar só por e-mail fundia todo mundo num único cadastro — e as outras pessoas nunca ganhavam registro próprio, com o peso de voto delas silenciosamente incorporado ao de outra pessoa. Ver o teste de regressão em `lib/importacao/processor.test.ts` reproduzindo o caso real. Limitação conhecida: duas linhas com o **mesmo nome completo e mesmo e-mail**, mas que sejam pessoas fisicamente diferentes (mesmo nome, coincidência), ainda se fundem — só cruzamento manual por CPF pega esse caso residual.

### Segurança e RLS

A aplicação nunca usa a chave `anon` do Supabase — todo acesso ao banco passa pela `service_role` key, só no servidor (`lib/supabase/server.ts`). Row Level Security está habilitado em todas as tabelas, com policies explícitas de "deny all" pra `anon`/`authenticated` — isso não muda nada no comportamento (a `service_role` sempre ignora RLS), só documenta a intenção e silencia o linter de segurança do Supabase. Autenticação de usuário é por sessão JWT em cookie HttpOnly, verificada tanto no middleware (`proxy.ts`, edge) quanto em cada Server Action sensível (`requirePerfil`/`requireAcessoCondominio` em `lib/auth.ts`).

---

## Funcionalidades

- **Condomínios** — cadastro com endereço e síndico, exportação XLSX de proprietários (reflete o banco em tempo real)
- **Proprietários e Unidades** — importação via XLSX/CSV com detecção inteligente de colunas e agrupamento por nome+e-mail; busca e ordenação; coproprietários informativos; transferência de unidade entre cadastros
- **Assembleias** — criação com múltiplas pautas, status rascunho → aberta → pausada ⇄ aberta → encerrada, reabertura excepcional pra correção
- **Votação eletrônica** — link único por proprietário (token), votação parcial/complementar (pauta pode ser respondida aos poucos ou adicionada depois), bloqueio de inadimplente, procuração
- **Disparo de e-mail** — convite e lembrete mostram peso de voto e unidades vinculadas (pra o próprio proprietário conferir o cadastro), anexo de PDF opcional, busca ao selecionar destinatários
- **Apuração** — gráficos de rosca por pauta, quórum 1ª/2ª convocação, PDF/XLSX/ata, controle interno de participação com busca e filtro por status
- **Usuários** — sistema multi-usuário com perfis (administrador / operador / visualizador) e escopo de acesso por condomínio
- **Dashboard** — métricas de participação, resumo por condomínio (assembleias abertas/pausadas)

---

## Problemas conhecidos e melhorias futuras

- **Sem testes na camada de `services/`** — hoje só a lógica pura (`lib/peso.ts`, `lib/importacao/processor.ts`) tem cobertura. Testar `services/` exigiria mockar o cliente Supabase ou usar um projeto Supabase separado só pra teste (nunca o de produção).
- **Sem verificação de consistência self-service** — hoje, achar um cadastro com unidades mal vinculadas (como o bug de importação) exige consulta SQL manual. Uma tela de "verificar cadastro" rodando essas checagens automaticamente antes do disparo de e-mail seria valiosa.
- **Sem lembrete automático por prazo** — o síndico precisa lembrar de clicar em "notificar quem não votou"; um aviso automático X dias antes do encerramento eliminaria esse passo manual.
- **Sem canal alternativo pra quem não tem e-mail cadastrado** — hoje só resta contato manual (telefone/WhatsApp); integração com WhatsApp Business API cobriria esse caso.
- **Reabertura de assembleia não notifica ninguém** — usar `reabrirAssembleia` pra correção não avisa automaticamente quem já votou ou já recebeu o resultado que algo mudou.
- **Lista de outorgante/outorgado na procuração não filtra inadimplente na busca** — o bloqueio funciona (erro claro ao tentar), mas a pessoa continua aparecendo como opção selecionável até tentar confirmar.
