---
name: votoonline
description: >-
  Working conventions for the VotoOnline codebase — a Brazilian condo
  electronic-assembly (assembleia) SaaS in REAL PAID production. Consult this
  skill whenever you touch this repo: shipping any code change, opening or
  merging a PR, running a DB migration, or working on anything about
  assembleias, voto/votação, apuração, quórum, empate, procuração, presença,
  e-mail/Resend/disparos, or relatórios (XLSX/PDF). It covers the PR +
  quality-gate workflow, the Supabase/app-authz model, historical vote
  snapshots, the assembly domain rules agreed with the síndico, and the
  email/deliverability facts. Follow it even when the request doesn't name these
  things explicitly — almost every change here touches at least one of them, and
  getting the domain rules or the historical-integrity model wrong corrupts real
  paid assemblies.
---

# VotoOnline — project conventions

VotoOnline runs **real, paid, presencial** condo assemblies (Carlos, the
síndico/intermediary, charges condomínios and pays Cleiton per assembly).
Mistakes land in a live assembly, so correctness and the domain rules below
matter more than cleverness. Stack: **Next.js (App Router — a modified build,
see `AGENTS.md`), React, Supabase, Resend e-mail, Vercel**.

**Who's who:** Cleiton = owner/dev — he merges PRs, runs SQL himself, and
forwards Carlos's feedback. Carlos = síndico and domain expert who runs the
assemblies. When Cleiton pastes Carlos's audios/texts, your job is usually to
diagnose + propose + ship, then give Cleiton a ready message for Carlos.

## Shipping a change (PR workflow)

Never commit to `main`. The loop Cleiton expects, every time:

1. `git fetch origin` first, then branch off `origin/main`.
2. Make the change. Before opening the PR, the quality gate must be **green**:
   - `npx tsc --noEmit` (type-check)
   - `npm run build` (`next build` — this build flakes intermittently on Vercel;
     a local pass means the code is fine, so retrigger rather than assume it's
     broken)
   - `npm test` (vitest) when you touched logic with tests
   - `npm run lint` (eslint) for non-trivial changes
   `next build` can exceed a 120s foreground timeout — run it in the background.
3. Commit. End the message with the attribution line the session's reminder
   gives; the repo history uses `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
4. Open the PR with `gh`. End the PR body with
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
5. **Do not merge.** Cleiton merges himself, and each `gh pr merge` needs his
   explicit per-PR OK ("pode mergear o 123") — a blanket "aprovado" earlier does
   not cover later PRs. After he merges, sync `main`, delete the branch, and
   **confirm the Vercel deploy** (auto-deploys on push to `main`).

Write PR titles/bodies and commit messages in **Portuguese** — that's the repo's
language and Cleiton reads them.

## Database & migrations (Supabase)

- Supabase is accessed with the **service_role** key. There is **no RLS** doing
  authorization — access control lives in app code (`requirePerfil`,
  `requireAcessoCondominio`). Any new data path must enforce access itself; a
  server action or route that skips these checks is a security bug.
- **Migrations/SQL are run manually by Cleiton** in the Supabase SQL Editor.
  Provide the SQL for him to paste; don't try to run it. `Success. No rows
  returned` is the normal result for an `UPDATE`/DDL — it's not an error.
- There are **no local Supabase credentials** (no `.env.local`), so you can't
  run queries locally. Reason about the schema from `supabase/schema.sql` and
  `lib/supabase/types.ts`.

## Historical integrity — vote snapshots (Etapa 3)

When a person votes, their `nome`, `email`, `unidades`, `peso` are **frozen** in
`*_snapshot` columns on `assembleia_sends` (e.g. `unidades_snapshot`,
`peso_snapshot`). Reports and the apuração read the **snapshot**, falling back to
the current cadastro only when the snapshot is absent (person hasn't voted yet).

Why it matters: a proprietário edited after voting must not retroactively change
what their recorded vote says. When you touch anything that reads votes
(relatórios, apuração, histórico), keep the `snapshot ?? cadastro atual` pattern
— don't switch to reading the live cadastro. See `services/relatorios.ts` and
`services/presenca.ts` for the established shape, including the nested embed
`proprietarios(nome, email, unidades(numero, bloco))`.

## Assembly domain rules (agreed with Carlos — do not "fix" these)

These are deliberate, validated with the síndico. Breaking them produces a wrong
but plausible-looking result in a contestable assembly.

- **Totals are per IMÓVEL (unit), not per person.** A multi-unit owner weighs
  more; apuração counts units/fração ideal, never headcount.
- **The system never decides a tie.** `EMPATE` is surfaced, but the **mesa**
  (board) resolves it — no code picks a winner on a tie.
- **`EMPATE` only arises from Sim/Não votes that tie.** Only abstentions or no
  votes is `SEM VOTOS`, not a tie.
- **Maioria simples:** don't show a "quórum 50%" — it's not a quórum gate.
  Pauta approval uses `pauta.quorum_aprovacao` (maioria simples, 2/3,
  unanimidade…), never a hardcoded `>50%`.
- **No cadastro/unit changes after voting starts** — integrity.
- **Procuração:** the outorgante cannot vote for himself (the representative
  does); the unit counts as present only once the representative votes.
- **Hide partial results while voting is open** (anti-herd), same reason
  elections don't publish partials with the urn open.

## E-mail / Resend / deliverability

- Transactional e-mail goes through **Resend** from the domain
  `votoonline.online` (Verified). Plan: **Pro** (≈US$20/mês ≈ R$114, 50k/mês,
  **no daily cap**). `RESEND_FROM_EMAIL`/`RESEND_API_KEY` are env vars; changing
  them needs a redeploy. Never echo or store the webhook secret or API key.
- **There is no cron/scheduled sending.** Every disparo is manual — someone
  clicks "Disparar". "It should send weekly automatically" is a false
  expectation, not a missing feature.
- The **Resend webhook PROVES delivery, it doesn't improve it.** `Enviado` =
  Resend accepted; `Entregue`/`Bounce`/`Spam` come later via webhook into the
  `*_em` columns. `"não recebeu"` is almost always a **wrong/dead e-mail in the
  cadastro** (bounce → Resend auto-suppresses the address), not a system bug —
  the fix is correcting the e-mail or using WhatsApp.
- The Resend SDK **never rejects on API failure** — `resend.batch.send` /
  `resend.emails.send` resolve with `{ error }`. Always check `error` before
  marking a send as succeeded, or you'll record "sent" for mail that never left.

## Reports (XLSX / PDF)

Builders live in `lib/relatorios/`, served by routes under
`app/api/relatorios/`, triggered client-side with a
`document.createElement("a"); a.href = "…"; a.click()`. Always:
- Gate the route like the apuração one: logged in, **não-visualizador**, with
  `requireAcessoCondominio` — reports carry condômino PII (e-mail/CPF).
- Run every cell through `sanitizarLinhas` (anti CSV/Formula-injection) and
  format dates with `formatDateTimeBR`.
Reuse `lib/relatorios/xlsx-apuracao.ts` / `xlsx-disparos.ts` as the template.

## Small conventions worth matching

- **Unit display:** `bloco-numero` when a separate bloco exists, else just
  `numero` (bloco is often embedded, e.g. `A0101`). Sort natural/numeric.
- **Per-proprietário Set/Map pattern:** the condo page builds `*NaAberta`
  Sets/Maps keyed by `proprietario_id` and passes them to `ProprietariosList`;
  add new per-person signals the same way.
- Comments and UI copy are in **Portuguese (pt-BR)**.

## Memory

Durable facts about this project (security review, domain rules, email
deliverability, the real-production context, Carlos as a legit MASTER admin,
etc.) live in Cleiton's auto-memory `MEMORY.md`. When something non-obvious and
lasting is learned, record it there rather than only in the PR.
