# Checklist de segurança — VotoOnline

Guia curto pra consultar **a cada feature nova** (action, rota, relatório, tela
pública). Não é teoria: cada item aponta pro arquivo/helper real do projeto.
Baseado no [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) e na
arquitetura deste repo (Supabase com `service_role` e **sem RLS** → toda a
autorização vive no código do app).

> Regra de ouro: **sem RLS, o servidor é a única fronteira.** A UI esconder um
> botão não protege nada — qualquer `"use server"` action e qualquer rota é
> chamável direto por quem estiver autenticado. A proteção tem que estar na
> action/rota, não na tela.

---

## 1. Autorização (o item nº 1 aqui)

Toda server action / rota que **lê ou escreve** dado de condomínio:

- [ ] Chama `requirePerfil([...])` com os perfis que podem — ver [`lib/auth.ts`](lib/auth.ts).
      Ação que **muda** dado nunca inclui `"visualizador"`.
- [ ] Chama `requireAcessoCondominio(condominioId)` — garante que um usuário
      PESSOAL só mexe nos condomínios dele. MASTER passa direto.
- [ ] Operação **global** (gestão de usuários, criar/excluir condomínio) exige
      **MASTER** (`auth.session.acessoTotal === true`), não só `perfil`.
      Ex.: [`condominios.ts`](app/actions/condominios.ts) já faz isso.
- [ ] Ação destrutiva (excluir, anular voto, remover unidade) pede senha via
      `verificarSenhaUsuarioAtual` ([`lib/confirmar-senha.ts`](lib/confirmar-senha.ts)).

**Superfícies públicas** (sem login — voto do condômino):
- [ ] A credencial é o **token** (122 bits) do `assembleia_send`, ou **unidade +
      CPF** na entrada. Ver `pingLinkAtivoAction`, `getEstadoVotoAction`,
      `entrarAssembleiaAction`.
- [ ] Mensagem de erro **uniforme** (não revela se o CPF/e-mail existe).
- [ ] Tem **rate-limit** (ver abaixo).

## 2. IDOR (referência direta a objeto)

- [ ] Nenhum `id` vindo do cliente é usado sem antes passar por
      `requireAcessoCondominio` do condomínio dono daquele dado.
- [ ] Não confie em `condominioId` do cliente como prova de acesso **a outro
      recurso**: valide que o recurso (assembleia, proprietário, unidade)
      pertence mesmo àquele condomínio quando o id do recurso também vem do
      cliente.
- [ ] IDs expostos ao público são UUID aleatório (não sequencial/enumerável).

## 3. Validação de entrada & mass assignment

- [ ] Entrada validada (formato, limites, obrigatórios) — `zod` nos fluxos de
      auth, validação manual nas actions.
- [ ] O cliente **nunca** consegue setar campo sensível mandando-o no payload:
      `peso`, `perfil`, `acesso_total`, `fracao_ideal`, `quantidade_unidades`,
      `votado_em`. Monte o objeto de escrita a partir de campos **whitelistados**,
      não repasse o input inteiro.
- [ ] Teto em operações em lote (ex.: import limita a 5.000 — ver
      [`importacao.ts`](app/actions/importacao.ts)).
- [ ] Datas do cliente: rejeitar inválidas e futuras (ver `registrarVotoManualAction`).

## 4. Integridade histórica (regra de domínio = segurança aqui)

- [ ] Relatórios/apuração leem o **snapshot** (`*_snapshot`), com fallback pro
      cadastro só quando não há snapshot. Ver `services/relatorios.ts`,
      `services/presenca.ts`.
- [ ] Peso do voto é **congelado** na hora do voto, nunca recalculado depois.
- [ ] Nada de mudar cadastro/unidade/critério de peso com assembleia aberta e
      peso já congelado (travas em `proprietarios.ts` / `condominios.ts`).

## 5. XSS

- [ ] **Nunca** `dangerouslySetInnerHTML` com conteúdo de usuário — principalmente
      **ata** (abertura/deliberação/encerramento), nome de pauta, nome de
      proprietário. O React já escapa; o risco só aparece se alguém "sair" dele.
- [ ] Se um dia precisar renderizar HTML, sanitizar antes (DOMPurify ou similar).

## 6. Relatórios (PDF / XLSX) — carregam PII

- [ ] Rota logada, **não-visualizador**, com `requireAcessoCondominio` (mesmo
      gate da apuração).
- [ ] Toda célula passa por `sanitizarLinhas` (anti CSV/Formula injection) e
      datas por `formatDateTimeBR` — ver [`lib/relatorios/`](lib/relatorios/).

## 7. Segredos & e-mail

- [ ] `service_role`, `RESEND_API_KEY`, segredo do webhook, `AUTH_PASSWORD`
      **nunca** aparecem em log, resposta ou mensagem de erro.
- [ ] PII não vaza pro Sentry — ver [`lib/sentry-scrub.ts`](lib/sentry-scrub.ts).
- [ ] Webhook do Resend **verifica a assinatura** (Svix) antes de aceitar o
      evento — senão qualquer um forja "entregue".
- [ ] SDK do Resend não rejeita em falha: checar `{ error }` antes de marcar
      "enviado".

## 8. Rate limiting

- [ ] Toda rota pública nova tem rate-limit ([`lib/rate-limit.ts`](lib/rate-limit.ts)).
- [ ] A chave combina IP **+** identificador do recurso (ver `entrada(ip, unidade)`
      e `votoSubmit(sendId)`): numa assembleia presencial todo mundo sai pelo
      mesmo IP (wi-fi do salão), então limitar só por IP bloquearia gente de
      verdade.

## 9. Sessão & senha

- [ ] Cookie de sessão: `httpOnly` + `secure` (prod) + `sameSite` — ver `createSession`.
- [ ] Senha com bcrypt custo 12; mínimo 8 caracteres.
- [ ] Troca de senha própria confere a senha atual (`updateSenhaAction`).

## 10. Criptografia — para o "selo de integridade" (feature futura)

Quando for implementar o selo/hash do resultado, lembrar do que o OWASP
*Cryptographic Storage* deixa claro:

- [ ] Um **SHA-256 puro gravado no mesmo banco** que um atacante consegue
      editar **não** é à prova de adulteração — ele recalcula e sobrescreve.
- [ ] Para ser tamper-evident de verdade, usar **uma** destas:
  - **HMAC-SHA256 com uma chave secreta em env var** (fora do banco), ou
  - **ancorar o hash fora do banco** no fechamento (ex.: enviar o código por
    e-mail via Resend pros condôminos/mesa → passa a existir em caixas de
    entrada que o banco não alcança).
- [ ] O "protocolo do condômino" não pode revelar **em quem** a pessoa votou.

---

## Antes de abrir PR de uma feature nova — passada rápida

1. Toda action/rota nova tem `requirePerfil` + `requireAcessoCondominio` (ou MASTER)?
2. Algum `id`/campo do cliente escrevendo sem whitelist?
3. Leu snapshot (não cadastro ao vivo) em algo que mostra voto?
4. Rota pública? Tem rate-limit + erro uniforme?
5. Relatório/PII? Gate + `sanitizarLinhas`?
6. Mexeu em cripto/segredo? Nada em log; hash não é SHA-256 puro no banco.

## Mapa OWASP → onde se aplica aqui

| Cheat Sheet | Onde pega no VotoOnline |
|---|---|
| Authorization / IDOR | `lib/auth.ts`, toda `app/actions/*` (nº 1, por causa do no-RLS) |
| Cryptographic Storage / Key Management | selo de integridade (feature futura) |
| XSS Prevention | ata, nomes de pauta/proprietário |
| Mass Assignment / Input Validation | escrita de `peso`/`perfil`/`acesso_total` |
| Authentication / Session / CSRF | `login`, `lib/auth.ts`, server actions |
| CSV Injection | relatórios (`sanitizarLinhas`) — já coberto |
| DoS / Rate Limiting | `lib/rate-limit.ts`, superfícies públicas |
| Secrets Management | envs Supabase/Resend, `sentry-scrub` |
