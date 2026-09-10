-- ============================================================
-- VotoOnline — Schema SQL (recriação completa)
-- Execute este script inteiro, uma única vez, num projeto Supabase
-- novo/vazio: SQL Editor → New query → cole tudo → Run.
--
-- Este arquivo substitui o antigo log de migrações incrementais por um
-- único script consolidado, gerado a partir do estado real do código
-- (lib/supabase/types.ts + services/*) em 2026-08-06, depois que o projeto
-- anterior no Supabase foi excluído. Não inclui as tabelas antigas do
-- módulo "Pesquisa Fácil" (surveys/clients/survey_sends/survey_responses)
-- nem "condo_surveys*" — nenhuma delas tem referência no código atual
-- (o módulo de votação usa assembleias/pautas/assembleia_sends/
-- assembleia_respostas).
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── Função utilitária: updated_at automático ────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = '';

-- ============================================================
-- Usuários do sistema (administradores/operadores/visualizadores)
-- ============================================================

create table if not exists usuarios (
  id            uuid        primary key default uuid_generate_v4(),
  nome          text        not null,
  email         text        not null unique,
  senha_hash    text        not null,
  cpf           text,
  celular       text,
  perfil        text        not null default 'operador'
                            check (perfil in ('administrador', 'operador', 'visualizador')),
  acesso_total  boolean     not null default true,
  ativo         boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- ─── Tabela: condominios ───────────────────────────────────────
-- criterio_peso decide como o peso de voto de cada proprietário é calculado
-- neste condomínio (ver lib/peso.ts): "unidade" = 1 unidade = 1 voto (padrão,
-- comportamento histórico); "fracao_ideal" = soma de unidades.fracao_ideal —
-- uso obrigatório em condomínios cuja convenção segue a regra padrão do
-- Código Civil (voto proporcional à fração ideal, não por unidade).
create table if not exists condominios (
  id              uuid        primary key default uuid_generate_v4(),
  nome            text        not null,
  endereco        text,
  sindico_nome    text,
  sindico_contato text,
  criterio_peso   text        not null default 'unidade'
                              check (criterio_peso in ('unidade', 'fracao_ideal')),
  created_at      timestamptz not null default now()
);

-- Escopo por condomínio (MASTER/PESSOAL): quais condomínios um usuário com
-- acesso_total = false enxerga. Usuários MASTER (acesso_total = true) não
-- precisam de linhas aqui — veem tudo independente desta tabela.
create table if not exists usuario_condominios (
  usuario_id    uuid not null references usuarios(id)    on delete cascade,
  condominio_id uuid not null references condominios(id) on delete cascade,
  primary key (usuario_id, condominio_id)
);

-- ─── Tabela: configuracoes ──────────────────────────────────────────────
-- Chave-valor para configurações do sistema. Lida apenas server-side.
create table if not exists configuracoes (
  chave      text        primary key,
  valor      text        not null,
  updated_at timestamptz not null default now()
);

insert into configuracoes (chave, valor) values
  ('admin_nome',                      'Administrador'),
  ('admin_email',                     'admin@exemplo.com'),
  ('auth_password',                   ''),
  ('email_nome_remetente',            'Sistema de Votação'),
  ('votacao_encerramento_automatico', 'false')
on conflict (chave) do nothing;

-- ─── Tabela: rate_limits ─────────────────────────────────────────────────
-- Janela deslizante para limitar tentativas de login e votação. Persistida
-- (em vez de Map em memória) porque cada instância serverless da Vercel tem
-- sua própria memória. Linhas com mais de 1 dia são expurgadas
-- oportunistamente pelo próprio app (ver lib/rate-limit.ts).
create table if not exists rate_limits (
  chave         text        primary key,
  contagem      integer     not null default 1,
  inicio_janela timestamptz not null default now()
);

-- ============================================================
-- Cadastro: proprietários e unidades
-- Peso de voto = número de unidades do proprietário, sempre calculado
-- dinamicamente (nunca armazenado em proprietarios/unidades) — ver
-- lib/peso.ts. O peso só é congelado no momento do voto, em
-- assembleia_respostas.peso / assembleia_sends.*_snapshot (ver abaixo).
-- ============================================================

-- inadimplente: bloqueia voto (Código Civil, art. 1.335, §único /
-- convenção condominial) — ver validarVotoOuFalhar em
-- services/assembleia-votos.ts. Marcado manualmente pelo síndico, não
-- calculado a partir de nenhuma cobrança/boleto.
create table if not exists proprietarios (
  id                    uuid        primary key default uuid_generate_v4(),
  condominio_id         uuid        not null references condominios(id) on delete cascade,
  nome                  text        not null,
  email                 text,
  cpf                   text,
  telefone              text,
  observacoes           text,
  inadimplente          boolean     not null default false,
  historico_alteracoes  jsonb       not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);

-- numero_normalizado é coluna gerada: extrai letras (maiúsculas) e números
-- de bloco+numero e concatena letras-então-números, para que "C-0502",
-- "C0502", "c 0502" e "0502 C" sejam sempre a mesma chave de duplicidade.
-- Espelha exatamente lib/unidade-format.ts:normalizarChaveUnidade — se uma
-- mudar, a outra precisa mudar junto.
-- fracao_ideal: fração ideal da unidade em relação ao condomínio (ex.:
-- 0.014235). Nullable — só é exigida quando condominios.criterio_peso =
-- 'fracao_ideal' (checado em código, não aqui, pra não travar condomínios
-- que continuam usando "unidade" e nunca preenchem este campo).
create table if not exists unidades (
  id                  uuid          primary key default uuid_generate_v4(),
  proprietario_id     uuid          not null references proprietarios(id) on delete cascade,
  condominio_id       uuid          not null references condominios(id)   on delete cascade,
  numero              text          not null,
  bloco               text,
  fracao_ideal        numeric(14,6),
  numero_normalizado  text          generated always as (
                        upper(regexp_replace(coalesce(bloco, '') || numero, '[^A-Za-z]', '', 'g'))
                        || regexp_replace(coalesce(bloco, '') || numero, '[^0-9]', '', 'g')
                      ) stored,
  created_at          timestamptz   not null default now()
);

-- Auditoria de assembleias — Fase 9 (copropriedade, versão de menor
-- risco escolhida pelo usuário): registro puramente informativo de donos
-- ADICIONAIS de uma unidade (ex.: cônjuge, herdeiros) — nunca lido por
-- lib/peso.ts, services/assembleia-votos.ts, importação ou qualquer
-- cálculo de peso/voto. Quem vota pela unidade continua sendo só
-- unidades.proprietario_id, exatamente como antes desta fase. Se um
-- coproprietário quiser votar de verdade, o caminho é procuração (Fase 8)
-- entre proprietários já cadastrados — não este cadastro.
create table if not exists unidade_coproprietarios (
  id               uuid        primary key default uuid_generate_v4(),
  unidade_id       uuid        not null references unidades(id)      on delete cascade,
  proprietario_id  uuid        not null references proprietarios(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (unidade_id, proprietario_id)
);

-- ============================================================
-- Votação: assembleias, pautas e opções
-- ============================================================

-- quorum_minimo: fração (0–1) do peso total do condomínio exigida pra
-- assembleia ser válida na 1ª convocação (ex.: 0.5 = metade do condomínio
-- precisa ter participado). Null = sem checagem de quórum mínimo
-- (comportamento histórico).
--
-- Auditoria de assembleias — Fase 2: 1ª/2ª convocação. Esta votação é
-- assíncrona (por e-mail, ao longo de dias), não uma reunião num instante
-- só — então "convocação" aqui não é uma hora marcada com tolerância, é uma
-- DATA-LIMITE (data_1a_convocacao). Se a apuração acontece (assembleia
-- ainda aberta "agora", ou já encerrada em data_encerramento) até essa
-- data, vale quorum_minimo; depois dela, vale quorum_minimo_2a (tipicamente
-- menor, ou null = sem checagem nenhuma na 2ª convocação). Ver
-- getQuorumEfetivo em lib/peso.ts. data_1a_convocacao null = sem 1ª/2ª
-- convocação, só o quorum_minimo único de sempre (Fase 1).
create table if not exists assembleias (
  id                  uuid          primary key default uuid_generate_v4(),
  condominio_id       uuid          not null references condominios(id) on delete cascade,
  titulo              text          not null,
  descricao           text,
  status              text          not null default 'rascunho'
                                    check (status in ('rascunho', 'aberta', 'encerrada')),
  data_abertura       timestamptz,
  data_encerramento   timestamptz,
  quorum_minimo       numeric(5,4)  check (quorum_minimo is null or (quorum_minimo > 0 and quorum_minimo <= 1)),
  data_1a_convocacao  timestamptz,
  quorum_minimo_2a    numeric(5,4)  check (quorum_minimo_2a is null or (quorum_minimo_2a > 0 and quorum_minimo_2a <= 1)),
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

drop trigger if exists assembleias_updated_at on assembleias;
create trigger assembleias_updated_at
  before update on assembleias
  for each row execute function update_updated_at();

-- status: ciclo de vida independente do status da assembleia. Toda pauta
-- nasce em "aberta" e sobe sozinha para "em_votacao" no 1º voto; só vira
-- "encerrada" quando a assembleia inteira encerra (nenhuma pauta fecha
-- isolada). "rascunho" existe só por simetria/futuro.
-- quorum_aprovacao: fração (0–1) de Sim sobre (Sim + Não) exigida pra pauta
-- ser aprovada — abstenções não entram no denominador (não contam a favor
-- nem contra). Default 0.5 = maioria simples dos votantes; 0.6667 pra 2/3;
-- 1 pra unanimidade. Ver apurarSimNao/apurarMultiplaEscolha em
-- services/assembleia-votos.ts.
create table if not exists pautas (
  id                 uuid          primary key default uuid_generate_v4(),
  assembleia_id      uuid          not null references assembleias(id) on delete cascade,
  ordem              integer       not null,
  titulo             text          not null,
  descricao          text,
  ativa              boolean       not null default true,
  tipo               text          not null default 'sim_nao'
                                   check (tipo in ('sim_nao', 'multipla_escolha')),
  permite_abstencao  boolean       not null default true,
  status             text          not null default 'aberta'
                                   check (status in ('rascunho', 'aberta', 'em_votacao', 'encerrada')),
  quorum_aprovacao   numeric(5,4)  not null default 0.5
                                   check (quorum_aprovacao > 0 and quorum_aprovacao <= 1),
  -- Auditoria de assembleias — Fase 5: pauta sigilosa (ex.: eleição de
  -- síndico) — o resultado agregado (Sim/Não/opção) continua público como
  -- sempre; o que muda é que "Detalhamento de Votos" no PDF/Excel omite o
  -- vínculo nome↔voto pra pautas marcadas aqui. Não afeta a tela viva do
  -- admin, que nunca mostrou esse detalhamento nominal (só nos exports).
  sigiloso           boolean       not null default false,
  created_at         timestamptz   not null default now()
);

-- Opções de uma pauta de múltipla escolha (ex.: candidatos).
create table if not exists pauta_opcoes (
  id         uuid        primary key default uuid_generate_v4(),
  pauta_id   uuid        not null references pautas(id) on delete cascade,
  ordem      integer     not null,
  label      text        not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Envio de link de votação e respostas
-- ============================================================

-- Um proprietário recebe no máximo um send por assembleia (upsert por
-- assembleia_id+proprietario_id — ver services/assembleia-votos.ts). As
-- colunas *_snapshot congelam a identidade/unidades/peso do proprietário no
-- momento em que ele registra o 1º voto — nunca recalculadas depois, mesmo
-- que o cadastro ou as unidades mudem em seguida.
create table if not exists assembleia_sends (
  id                             uuid        primary key default uuid_generate_v4(),
  assembleia_id                  uuid        not null references assembleias(id)   on delete cascade,
  proprietario_id                uuid        not null references proprietarios(id) on delete cascade,
  token                          text        not null unique,
  status                         text        not null default 'pending'
                                             check (status in ('pending', 'sent', 'failed')),
  sent_at                        timestamptz,
  nome_snapshot                  text,
  cpf_snapshot                   text,
  email_snapshot                 text,
  telefone_snapshot              text,
  quantidade_unidades_snapshot   integer,
  unidades_snapshot              jsonb,
  peso_snapshot                  numeric(14,6),
  votado_em                      timestamptz,
  ip_snapshot                    text,
  user_agent_snapshot            text,
  created_at                     timestamptz not null default now(),
  unique (assembleia_id, proprietario_id)
);

-- Uma resposta por pauta por send. `resposta` é usada para pautas
-- "sim_nao" (ou abstenção em "multipla_escolha"); `opcao_id` para o voto
-- numa opção de pauta "multipla_escolha" — exatamente um dos dois é
-- preenchido (constraint XOR abaixo). `peso` é congelado no momento do
-- voto (ver lib/peso.ts) — nunca recalculado na apuração.
create table if not exists assembleia_respostas (
  id         uuid        primary key default uuid_generate_v4(),
  send_id    uuid        not null references assembleia_sends(id) on delete cascade,
  pauta_id   uuid        not null references pautas(id)           on delete cascade,
  resposta   text        check (resposta is null or resposta in ('Sim', 'Não', 'Abstenção')),
  opcao_id   uuid        references pauta_opcoes(id) on delete restrict,
  peso       numeric(14,6) not null default 0,
  created_at timestamptz not null default now(),
  constraint assembleia_respostas_resposta_xor_opcao
    check ((resposta is not null)::int + (opcao_id is not null)::int = 1),
  unique (send_id, pauta_id)
);

-- Auditoria de assembleias — Fase 8: procuração — outorgante (quem
-- delega) precisa ser um proprietário já cadastrado no mesmo condomínio
-- do outorgado (quem recebe/vota) — nunca uma pessoa externa ao sistema,
-- de propósito, pra não inventar um conceito novo de identidade. Escopo
-- por assembleia (não é uma delegação permanente) — mais seguro e mais
-- perto de como procuração funciona na prática (documento específico pra
-- uma reunião). Peso do outorgado, quando vota, passa a somar o peso das
-- unidades do outorgante também — ver createAssembleiaRespostas em
-- services/assembleia-votos.ts. Um proprietário só pode outorgar a UM
-- representante por assembleia (unique abaixo); nem outorgante nem
-- outorgado podem já ter votado nesta assembleia quando a procuração é
-- criada (services/procuracoes.ts garante isso em código).
create table if not exists procuracoes (
  id             uuid        primary key default uuid_generate_v4(),
  assembleia_id  uuid        not null references assembleias(id)   on delete cascade,
  outorgante_id  uuid        not null references proprietarios(id) on delete cascade,
  outorgado_id   uuid        not null references proprietarios(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint procuracoes_nao_autorrepresentacao check (outorgante_id <> outorgado_id),
  unique (assembleia_id, outorgante_id)
);

-- ─── Índices ───────────────────────────────────────────────────────────────
create index if not exists idx_usuario_condominios_usuario_id     on usuario_condominios(usuario_id);
create index if not exists idx_usuario_condominios_condominio_id  on usuario_condominios(condominio_id);

create index if not exists idx_proprietarios_condominio_id        on proprietarios(condominio_id);

create index if not exists idx_unidades_proprietario_id           on unidades(proprietario_id);
create index if not exists idx_unidades_condominio_id             on unidades(condominio_id);
create index if not exists idx_unidades_condominio_normalizado    on unidades(condominio_id, numero_normalizado);

create index if not exists idx_assembleias_condominio_id          on assembleias(condominio_id);

create index if not exists idx_pautas_assembleia_id               on pautas(assembleia_id);

create index if not exists idx_pauta_opcoes_pauta_id              on pauta_opcoes(pauta_id);

create index if not exists idx_assembleia_sends_assembleia_id     on assembleia_sends(assembleia_id);
create index if not exists idx_assembleia_sends_proprietario_id   on assembleia_sends(proprietario_id);
create index if not exists idx_assembleia_sends_token             on assembleia_sends(token);
create index if not exists idx_assembleia_sends_status            on assembleia_sends(status);

create index if not exists idx_assembleia_respostas_send_id       on assembleia_respostas(send_id);
create index if not exists idx_assembleia_respostas_pauta_id      on assembleia_respostas(pauta_id);
create index if not exists idx_assembleia_respostas_opcao_id      on assembleia_respostas(opcao_id);

create index if not exists idx_procuracoes_assembleia_id          on procuracoes(assembleia_id);
create index if not exists idx_procuracoes_outorgante_id          on procuracoes(outorgante_id);
create index if not exists idx_procuracoes_outorgado_id           on procuracoes(outorgado_id);

create index if not exists idx_unidade_coprop_unidade_id          on unidade_coproprietarios(unidade_id);
create index if not exists idx_unidade_coprop_proprietario_id     on unidade_coproprietarios(proprietario_id);

-- ─── Row Level Security ───────────────────────────────────────────────────
-- O service role key (usado pelo Next.js) bypassa o RLS automaticamente.
-- Nenhuma policy pública é criada — sem elas, a anon key não acessa nada.
-- Toda a comunicação ocorre via service role key no servidor Next.js.
alter table usuarios              enable row level security;
alter table usuario_condominios   enable row level security;
alter table condominios           enable row level security;
alter table configuracoes         enable row level security;
alter table rate_limits           enable row level security;
alter table proprietarios         enable row level security;
alter table unidades              enable row level security;
alter table assembleias           enable row level security;
alter table pautas                enable row level security;
alter table pauta_opcoes          enable row level security;
alter table assembleia_sends      enable row level security;
alter table assembleia_respostas  enable row level security;
alter table procuracoes           enable row level security;
alter table unidade_coproprietarios enable row level security;

-- Policies explícitas de "deny all" para anon/authenticated — apenas
-- documentam a intenção acima e silenciam o linter do Supabase
-- (rls_enabled_no_policy). service_role sempre bypassa RLS, com ou
-- sem policy.
drop policy if exists "deny_all" on usuarios;
create policy "deny_all" on usuarios              for all using (false) with check (false);
drop policy if exists "deny_all" on usuario_condominios;
create policy "deny_all" on usuario_condominios   for all using (false) with check (false);
drop policy if exists "deny_all" on condominios;
create policy "deny_all" on condominios           for all using (false) with check (false);
drop policy if exists "deny_all" on configuracoes;
create policy "deny_all" on configuracoes         for all using (false) with check (false);
drop policy if exists "deny_all" on rate_limits;
create policy "deny_all" on rate_limits           for all using (false) with check (false);
drop policy if exists "deny_all" on proprietarios;
create policy "deny_all" on proprietarios         for all using (false) with check (false);
drop policy if exists "deny_all" on unidades;
create policy "deny_all" on unidades              for all using (false) with check (false);
drop policy if exists "deny_all" on assembleias;
create policy "deny_all" on assembleias           for all using (false) with check (false);
drop policy if exists "deny_all" on pautas;
create policy "deny_all" on pautas                for all using (false) with check (false);
drop policy if exists "deny_all" on pauta_opcoes;
create policy "deny_all" on pauta_opcoes          for all using (false) with check (false);
drop policy if exists "deny_all" on assembleia_sends;
create policy "deny_all" on assembleia_sends      for all using (false) with check (false);
drop policy if exists "deny_all" on assembleia_respostas;
create policy "deny_all" on assembleia_respostas  for all using (false) with check (false);
drop policy if exists "deny_all" on procuracoes;
create policy "deny_all" on procuracoes           for all using (false) with check (false);
drop policy if exists "deny_all" on unidade_coproprietarios;
create policy "deny_all" on unidade_coproprietarios for all using (false) with check (false);

-- ============================================================
-- Migração — Fase 1 da auditoria de assembleias: fração ideal,
-- quórum de aprovação por pauta, quórum mínimo por assembleia.
-- Execute este bloco no SQL Editor do Supabase (idempotente e aditivo —
-- os "create table" acima não recriam tabelas já existentes, então as
-- colunas novas só chegam ao banco através deste bloco de ALTER).
-- ============================================================

-- condominios: critério de peso (não quebra quem já vota por unidade —
-- default 'unidade' preserva o comportamento atual pra todo condomínio
-- existente).
alter table condominios add column if not exists criterio_peso text not null default 'unidade';
alter table condominios drop constraint if exists condominios_criterio_peso_check;
alter table condominios add constraint condominios_criterio_peso_check
  check (criterio_peso in ('unidade', 'fracao_ideal'));

-- unidades: fração ideal (opcional — só obrigatória, em código, quando o
-- condomínio usa criterio_peso = 'fracao_ideal').
alter table unidades add column if not exists fracao_ideal numeric(14,6);

-- assembleias: quórum mínimo pra validar a assembleia (opcional).
alter table assembleias add column if not exists quorum_minimo numeric(5,4);
alter table assembleias drop constraint if exists assembleias_quorum_minimo_check;
alter table assembleias add constraint assembleias_quorum_minimo_check
  check (quorum_minimo is null or (quorum_minimo > 0 and quorum_minimo <= 1));

-- pautas: quórum de aprovação (fração de Sim sobre Sim+Não). Default 0.5
-- preserva a leitura de maioria simples que já era o comportamento
-- implícito até aqui.
alter table pautas add column if not exists quorum_aprovacao numeric(5,4) not null default 0.5;
alter table pautas drop constraint if exists pautas_quorum_aprovacao_check;
alter table pautas add constraint pautas_quorum_aprovacao_check
  check (quorum_aprovacao > 0 and quorum_aprovacao <= 1);

-- assembleia_respostas.peso e assembleia_sends.peso_snapshot: de integer
-- pra numeric, pra suportar peso fracionário (fração ideal). Conversão
-- direta é segura — todo valor integer existente já é um numeric válido.
alter table assembleia_respostas alter column peso type numeric(14,6);
alter table assembleia_sends alter column peso_snapshot type numeric(14,6);

-- ============================================================
-- Migração — Fase 2 da auditoria de assembleias: 1ª/2ª convocação.
-- Execute este bloco no SQL Editor do Supabase.
-- ============================================================

alter table assembleias add column if not exists data_1a_convocacao timestamptz;
alter table assembleias add column if not exists quorum_minimo_2a numeric(5,4);
alter table assembleias drop constraint if exists assembleias_quorum_minimo_2a_check;
alter table assembleias add constraint assembleias_quorum_minimo_2a_check
  check (quorum_minimo_2a is null or (quorum_minimo_2a > 0 and quorum_minimo_2a <= 1));

-- ============================================================
-- Migração — Fase 4 da auditoria de assembleias: inadimplência
-- (bloqueia voto — Código Civil). Execute no SQL Editor.
-- ============================================================

alter table proprietarios add column if not exists inadimplente boolean not null default false;

-- ============================================================
-- Migração — Fase 5 da auditoria de assembleias: voto sigiloso.
-- Execute no SQL Editor.
-- ============================================================

alter table pautas add column if not exists sigiloso boolean not null default false;

-- ============================================================
-- Migração — Fase 8 da auditoria de assembleias: procuração.
-- Execute no SQL Editor.
-- ============================================================

create table if not exists procuracoes (
  id             uuid        primary key default uuid_generate_v4(),
  assembleia_id  uuid        not null references assembleias(id)   on delete cascade,
  outorgante_id  uuid        not null references proprietarios(id) on delete cascade,
  outorgado_id   uuid        not null references proprietarios(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint procuracoes_nao_autorrepresentacao check (outorgante_id <> outorgado_id),
  unique (assembleia_id, outorgante_id)
);

create index if not exists idx_procuracoes_assembleia_id on procuracoes(assembleia_id);
create index if not exists idx_procuracoes_outorgante_id on procuracoes(outorgante_id);
create index if not exists idx_procuracoes_outorgado_id  on procuracoes(outorgado_id);

alter table procuracoes enable row level security;

-- ============================================================
-- Migração — Fase 9 da auditoria de assembleias: coproprietários
-- (registro puramente informativo — nunca afeta peso/voto). Execute no
-- SQL Editor.
-- ============================================================

create table if not exists unidade_coproprietarios (
  id               uuid        primary key default uuid_generate_v4(),
  unidade_id       uuid        not null references unidades(id)      on delete cascade,
  proprietario_id  uuid        not null references proprietarios(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (unidade_id, proprietario_id)
);

create index if not exists idx_unidade_coprop_unidade_id      on unidade_coproprietarios(unidade_id);
create index if not exists idx_unidade_coprop_proprietario_id on unidade_coproprietarios(proprietario_id);

alter table unidade_coproprietarios enable row level security;

-- ============================================================
-- Migração — limpeza de configurações mortas. Três chaves em
-- "Configuração da Votação" (resposta única, votação ponderada, permitir
-- abstenção) eram globais e nunca influenciavam o cálculo de peso/voto de
-- verdade — desde a Fase 1 da auditoria, isso é decidido por
-- condominios.criterio_peso e pautas.permite_abstencao, por condomínio/
-- pauta. Execute no SQL Editor.
-- ============================================================

delete from configuracoes
  where chave in ('votacao_resposta_unica', 'votacao_ponderada', 'votacao_permite_abstencao');
