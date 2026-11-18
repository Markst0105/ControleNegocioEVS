# Controle de Negócio — Project Summary

> **Snapshot:** 18 November 2026
> **Status:** Phase 5A (application and credits) complete; Phase 5 (production
> cutover and business-data reconciliation) still in progress.

## 1. What this is

**Controle de Negócio** (repository `BioAvalia`) is a web-based management
console for a Herbalife distributor operating as **EVS Mooca + CASA**. It
replaces the owner's `Controle do Negócio` spreadsheet with a single source of
truth for sales, clients, stock, prices, expenses, receivables, cash, monthly
results and client credits.

The spreadsheet was imported once into PostgreSQL. After cutover, the app — not
the workbook — is authoritative. The interface is in **pt-BR**; code, comments
and database identifiers are in **English**.

## 2. Goal

Give the owner and a small team a fast daily console that:

- records every sale and purchase without spreadsheet drift;
- keeps stock, prices and receivables consistent from the same ledger;
- produces a defensible monthly P&L and cash view;
- lets clients buy credits without staff typing every purchase;
- enforces who can see what in the database, not only in the UI.

Success means the workbook can be frozen and the business can operate from the
app for a full monthly close.

## 3. Scope

### In scope

| Area | Capability |
|------|------------|
| Sales | Per-sale ledger, deal types, discounts, PV, profit, product costs, installments |
| Clients | Client records, phone/WhatsApp, name aliases, purchase overview |
| Inventory | Purchases, manual movements, transfers, counts, per-location balances |
| Prices | Retail and discount tiers, PV, print-friendly counter sheet, spreadsheet price import |
| Expenses | Business vs. personal costs, categories, monthly ledger |
| Receivables | Partial receipts, write-offs, filters, historical bulk reconciliation |
| Cash flow | Derived monthly ledger from receipts, expenses, stock purchases and approved credits |
| Month close | Admin-only soft close, snapshot, completeness warnings, change detection, audited reopen |
| MDO | Daily activity KPIs plus week/month views |
| Credits | Client self-registration/PIN login, self-purchase, staff approval and manual issuance |
| Reporting | Painel KPIs, monthly P&L, cash and receivables summaries |
| Access control | `admin`, `operator` and `member` roles enforced with RLS |

### Explicitly out of scope / removed

- **Reservations** are no longer exposed in the app or navigation. Their tables
  and SQL remain for history and reversibility.
- Clientes, Resultado and Fornecedores are not separate top-level pages; client
  and supplier data live inside their related workflows.
- No staging database and no multi-tenant tenancy.
- No external ERP, payment gateway or NF-e integration.
- No client-facing catalog beyond the credits area.

## 4. Architecture

```
Browser
  │  cookies (Supabase session)
  ▼
Next.js 16 App Router on Vercel
  │  proxy.ts → refresh session, gate routes
  │  Server Components → read
  │  Server Actions    → write/validate
  ▼
@supabase/ssr / PostgREST
  │  JWT claims drive auth.uid()
  ▼
Supabase PostgreSQL
  ├─ tables + constraints + triggers
  ├─ RLS policies (admin / operator / member)
  ├─ reporting views (v_monthly_pnl, v_cash_flow_entries, …)
  └─ SQL functions/RPCs (monthly_pnl, issue_credit, review_credit, …)
```

### Frontend structure

- `src/app/(auth)/` — public login, staff login, client registration and
  `/confirmado`.
- `src/app/(app)/` — staff console: Painel, Vendas, Créditos, Preços, Estoque,
  Compras, MDO, Recebíveis, Caixa, Despesas, Fechamento.
- `src/app/(member)/membro/` — the client's own credits screen.
- `src/app/auth/confirm/route.ts` — consumes Supabase confirmation links.
- `src/app/api/health/` — public readiness endpoint.
- `src/app/api/precos/importar/` — spreadsheet price import endpoint.
- `src/components/ui` — shadcn/Radix primitives.
- `src/components/app` — shell, navigation, badges, comboboxes and shared app UI.
- `src/lib` — Supabase clients, auth/session helpers, formatting, navigation,
  credit/auth rules and domain helpers.
- `src/proxy.ts` — Next.js 16 proxy entry point; delegates to
  `src/lib/supabase/proxy.ts`.

There is no separate application API layer. Reads are server-side Supabase
queries; writes are server actions that validate input and call tables or RPCs.
The database is the security boundary.

### Data and reporting model

- Normalized operational tables hold the ledger: sales, sale lines/payments,
  purchase records, inventory movements, expenses, clients, products, prices,
  credit purchases and month closures.
- Reporting views and SQL functions compute totals. PostgREST aggregate
  selectors are disabled on purpose, so the UI never issues client-side
  aggregations over full tables.
- The ETL (`etl/`) converts the source workbook into deterministic SQL seeds.
  Derived spreadsheet sheets are not imported; they are recomputed as SQL views.

### Deployment topology

- **Vercel** functions pinned to `cle1`.
- **Supabase** project `ControleNegocioEVS` in `us-east-2`, the same AWS region.
- One production environment. Preview deployments must never point at production
  data without Deployment Protection.

## 5. Stack

| Layer | Choice |
|-------|--------|
| Web | Next.js 16.4 App Router, React 19, TypeScript |
| Auth/session | `@supabase/ssr`, cookie sessions, `getClaims()` |
| UI | Tailwind CSS v4, shadcn/ui, Radix, Lucide, Sonner |
| Type | Bricolage Grotesque, Instrument Serif, IBM Plex Sans/Mono |
| Database | Supabase PostgreSQL, SQL migrations, RLS, views, RPCs |
| ETL | Python 3 standard library only |
| Deploy | Vercel + Supabase |
| Tooling | ESLint, `tsc --noEmit`, Supabase CLI, custom bash/Node checks |

## 6. Roles and access control

| Role | Scope |
|------|-------|
| `admin` | Full access: personal expenses, Herbalife statements, month close, audit, roles and price tiers |
| `operator` | Day-to-day operations and business expenses; no personal expenses, royalties, audit log or month close |
| `member` | Own credit balance, pending purchases and own history only |

Security is enforced in PostgreSQL with Row-Level Security. The UI hides routes
and actions, but RLS is the real gate. Only admins may change a profile's
`role` or `price_tier`.

Client login is intentionally separate from staff login:

- clients enter **full name or e-mail + 4–6 digit PIN**;
- the PIN is expanded into a deterministic Supabase Auth password
  (`evs-credits-v1:<pin>`), preserving normal sessions, RLS and rate limits;
- a security-definer RPC resolves a member name/e-mail to its login e-mail;
- staff use `/login/admin` with e-mail and password;
- self-registration creates a `member` profile through an auth trigger.

## 7. Important business rules

### Sales, profit and P&L

- `monthly_pnl` counts **client sales only**: deal types `sale`, `discount`,
  `financial` and blank deal type. Personal consumption, transfers, gifts,
  loans and returns move stock but are not revenue.
- `pv_total` sums all sales, including PV from non-revenue deal types.
- A historical **cartela** sale keeps its full value as profit (`product_cost`
  zeroed for that line).
- An access paid with a ticket (**TK**) or “não trouxe ticket” (**NTT**) carries
  zero cash and the product cost is the loss.
- Herbalife royalties and bonus are converted from USD using the statement's FX
  rate.
- Personal expenses stay separate from the business result.

### Cash and receivables

- Cash is derived, not bank-reconciled.
- Receipts are dated by the receipt event; expenses by `incurred_on`; stock
  purchases by `paid_on`.
- Approved credits are cash-in and revenue on `purchased_on`.
- Card-account purchases start **pending** and stay out of cash until each
  transaction is confirmed with `set_purchase_paid_on`.
- Receivables support partial receipts, write-offs and an admin-only historical
  bulk reconciliation with a preview before writing.

### Credits (replacing the cartela)

- One table, `public.credit_purchases`, with `status` = `pending` / `approved` /
  `rejected` and `source` = `site` / `staff`.
- A client purchase from `/membro` arrives **pending**; staff approve or reject
  in `/creditos`.
- Staff issuance is immediately **approved**.
- Review is final; a rejected request cannot later be approved.
- Credit payment methods exclude `ticket` and `exception`: `cash`, `pix`,
  `debit`, `credit`, `voucher`.
- `request_credit` has no profile argument and always uses `auth.uid()`, so a
  member can only request credits for themselves.
- Approved credits appear in `v_cash_flow_entries` (`entry_kind = 'credit'`)
  and in monthly revenue.

### Month close

- Admin-only soft close stores a snapshot of result, cash and receivables.
- Completeness warnings flag missing expenses or statements.
- Editing data after closing is detected; reopening is audited and preserves
  the last snapshot.

## 8. Key decisions

1. **Database as source of truth.** The workbook is imported once and frozen;
   derived sheets are replaced by SQL views.
2. **RLS over UI-only checks.** Every role boundary is enforced in PostgreSQL.
3. **Server actions, not a separate API.** Validation and writes stay close to
   the route that owns them; only health and price import have dedicated routes.
4. **Aggregates in SQL.** PostgREST aggregate selectors stay disabled; sums come
   from views/functions so permissions and performance are explicit.
5. **One production environment.** No staging split; the runbook compensates
   with read-only pre-cutover checks, schema parity, RLS and smoke tests.
6. **Credits replace the cartela.** Single credit ledger, client self-service,
   staff approval, no parallel cartela product.
7. **Client PIN auth without a custom auth server.** PIN → deterministic
   password keeps normal Supabase Auth sessions and policies.
8. **Card purchases are pending until confirmed.** A card account is not cash
   until the transaction is actually paid.
9. **Sales are grouped into purchases for display.** Vendas shows one card per
   purchase (date + client + payment method), not one row per line.
10. **No page-load choreography.** The UI is dense, immediate and
    reduced-motion-safe, following the **Balcão** design direction.
11. **Formatting is a presentation concern.** Money, dates and months are
    formatted in pt-BR at render time; the database keeps exact values.
12. **Email confirmation ends on a human page.** `/auth/confirm` accepts both
    `token_hash` and PKCE `code`, then redirects to `/confirmado`.

## 9. Constraints and guardrails

- **The repository must stay private.** Seeds contain real client names, 18k
  sales, expenses and prices. `npm run repo:visibility` fails while the GitHub
  repository is public.
- **Load the seed exactly once.** Ledger rows have no natural unique key;
  re-running the seed duplicates them. Migrations are idempotent.
- **No service-role key in the app.** Only the publishable/anon key is used.
- **Single production database.** Never run migrations, reconciliation or
  destructive tests from an unprotected preview.
- **PostgREST aggregate selectors are disabled.** Add a view or function instead
  of computing totals in the browser.
- **pt-BR UI, English code.** Labels and copy are Portuguese; identifiers,
  comments and migrations are English.
- **Light theme only**, pt-BR money/date formats, reduced-motion compliance and
  no entrance animations.
- **Current Next.js version is flagged by a security advisory.** A `next build`
  prints the recommendation and needs a retry; an upgrade should be scheduled.
- **Accepted dev-only audit advisories.** The `braces`/`micromatch` chain comes
  from ESLint tooling, is not bundled, and has no patched release yet.

## 10. Imported data and validation

The one-time import contains approximately:

| Entity | Count |
|--------|------:|
| Products | 185 |
| Clients | 557 |
| Sales | 18,182 |
| Installment rows | 17,971 |
| Inventory movements | 1,629 |
| Expenses | 110 |
| MDO days | 730 |
| Sales months | 46 |

- The ETL validation compares generated data against the workbook's own totals:
  **100/100 checks pass** across 25 months.
- Where the workbook formulas were wrong or stale, the database holds the
  corrected figure; details are in `etl/validation_report.md`.
- The imported expenses cover only July 2023; later months are entered in the
  app.
- The workbook contains **no Herbalife statement**, so royalty/FX/bonus must be
  entered before a month can be considered final.
- Of the imported installments, **3,422 remain open with a due date, totalling
  R$ 197.885,33**. This is the historical reconciliation backlog.

## 11. Current state

### Completed

- PostgreSQL schema, RLS, views, RPCs and idempotent migrations through
  `20261112000003_credits.sql`.
- ETL, seeds, schema checker and workbook-total validation.
- Auth gate, role-aware shell, and all staff screens listed in scope.
- Client self-registration, PIN login, confirmation page and member credits
  area.
- Client self-purchase with staff approval, plus manual staff issuance.
- Cash/P&L integration for approved credits.
- Card purchases pending until confirmation; catalog-only stock KPIs.
- Soft month close with snapshot and audit trail.
- Historical receivables reconciliation with preview.
- Price-sheet import and price history.

### Verified

| Check | Result |
|-------|--------|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run build` | pass |
| RLS suite | **77/77 PASS** |
| Schema parity | **54/54 relations available** |
| ETL workbook validation | **100/100 checks** |

The RLS and parity checks were last run against a clean local PostgreSQL 18
database with the full seed. The live project parity check reports 54/54.

### Still open before cutover

- Reconcile the 3,422 imported open installments (R$ 197.885,33) in bulk.
- Backfill business expenses for months after July 2023.
- Enter Herbalife statements (royalty, bonus, FX) for each closed month.
- Perform a physical stock count and align the imported opening balance.
- Configure the production Supabase Auth Site URL and the
  `https://<domain>/auth/confirm` redirect allowlist; set
  `NEXT_PUBLIC_SITE_URL` if the request host is not reliable.
- Complete authenticated browser validation on the deployed domain.
- Freeze the workbook only after the first full monthly close succeeds in the
  app.

### Known risks

- Historical cash is incomplete until receivables and missing expenses are
  reconciled.
- Historical sales are not backfilled into inventory movements; stock accuracy
  depends on the count.
- Preview deployments can expose production data if Deployment Protection is
  not enabled.
- The tracked seeds make repository privacy a hard operational requirement.

## 12. Operating commands

```bash
npm install
npm run dev            # local app
npm run typecheck
npm run lint
npm run build

npm run db:rls         # RLS suite, needs DATABASE_URL
npm run db:report      # read-only pre-cutover report, needs DATABASE_URL
npm run db:parity      # every relation/function the code calls exists
npm run test:prices    # spreadsheet price parser
npm run repo:visibility
npm run smoke:url -- https://<domain>
```

Database deployment:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
# never pass --include-seed on an existing database
```

## 13. Related documents

- `README.md` — setup, feature detail and deployment quick start.
- `docs/phase-0-setup.md` — Supabase project and first admin.
- `docs/cutover-runbook.md` — production readiness and 5B data checklist.
- `docs/design-system.md` — Balcão visual language and UI rules.
- `docs/performance-playbook.md` — query and RLS performance guidance.
- `etl/validation_report.md` — workbook-to-database reconciliation.
- `supabase/tests/rls_test.sql` — the 77-check security suite.
- `supabase/ops/pre_cutover_checks.sql` — read-only readiness report.
