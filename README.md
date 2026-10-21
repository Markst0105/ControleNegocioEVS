# Controle de Negócio

Web-based control system for a Herbalife distributor (EVS Mooca + CASA), replacing
the `Controle do Negócio` spreadsheet. The workbook is imported once; after cutover
the app is the single source of truth. The interface is pt-BR; code, comments and
database identifiers are in English.

> The repository folder and package ID keep the original `BioAvalia` name; the
> product name in the interface is **Controle de Negócio**.

> [!NOTE]
> **Status: Phase 4a — receivables and historical reconciliation implemented.**
> Login, role-aware app shell, Painel, Vendas, Lançamento de venda, Clientes,
> Estoque, Compras, Fornecedores, Preços, MDO, Recebíveis, Despesas, Resultado
> and the member catalog are in the code. Clientes includes search/pagination, name +
> phone/WhatsApp deduplication and an admin-only merge. Estoque includes
> purchases, manual movements, stock counts, per-location balances, product
> history and Ouro-tier valuation. Purchases can apply any price tier and keep
> the chosen tier on each line. Fornecedores includes create/edit/deactivate and
> the known distributors from the workbook. Preços is a print-friendly counter
> sheet with retail, discount tiers and PV; the sale form prefills the retail
> amount from the selected product. MDO imports 730 days of activity KPIs and
> offers a last-seven-days view plus a customisable monthly range with period,
> month and daily breakdowns. Despesas separates business and personal costs;
> Resultado turns sales, business expenses and the Herbalife statement into a
> monthly P&L. Recebíveis tracks partial receipts, write-offs and an admin-only
> historical reconciliation of the installments imported from the spreadsheet.
> Members sign in to a dedicated catalog only, with prices resolved from their
> tier. The visual identity follows the **Balcão** direction: desktop
> side column, mobile top bar with a leaf-triggered panel, month masthead and an
> editorial serif for section titles.
>
> Reservations were removed from the application and navigation. The Phase 3
> reservation tables and SQL remain in the database for history and
> reversibility, but no app route exposes them.
>
> Apply the migrations through
> `supabase/migrations/20261022000002_phase4a_receivables.sql` before deploying.
> That migration adds the receipt/write-off event ledger, partial-balance views
> and the admin bulk reconciliation used by Recebíveis. It also updates Painel
> and Clientes so “A receber” is net of partial receipts and write-offs. The
> previous Phase 2c migration adds operator write policies for business expenses
> and converts Herbalife statement USD amounts with their FX rate in the P&L.
> The Phase 3 migration adds member tier pricing to the safe catalog and a
> profile guard that prevents members from changing their own role or price
> tier. New sales write a stock movement from cutover onward; historical sales
> are not backfilled. Imported installments start open; an admin can settle the
> historical backlog in bulk from Recebíveis.

## What it covers

| Area | Details |
|------|---------|
| Sales | Per-sale ledger: deal types (consignment, gifts, negotiated prices…), discounts, PV and profit per sale |
| Clients | CRM with phone/WhatsApp fields and aliases for de-duplicated names |
| Inventory | Purchases, manual movements and counts, with per-location balances and Ouro-tier valuation |
| Prices | Counter sheet with retail, discount tiers, membership tiers and print layout |
| Expenses & P&L | Business costs (fixed/variable) kept apart from personal expenses; royalties and bonus from Herbalife statements; monthly P&L with category breakdown |
| Receivables | Open installments with partial receipts, write-offs, filters and admin bulk reconciliation of imported history |
| MDO | Daily activity KPIs plus week and month views with access, sales and profit breakdowns |

Three roles, enforced in the database with Row-Level Security:

- **admin** — owner: full access, including personal expenses and Herbalife statements;
- **operator** — day-to-day operations and business expenses; no access to personal expenses, royalties or the audit log;
- **member** — product catalog only, with prices resolved from their tier.

## Stack

| Layer | Choice |
|-------|--------|
| Web app | Next.js 16 (App Router) + TypeScript + `@supabase/ssr` |
| UI | Tailwind CSS v4 + shadcn/ui, Bricolage Grotesque + Instrument Serif + IBM Plex Sans/Mono, pt-BR |
| Database | Supabase (PostgreSQL) — SQL schema, RLS, reporting views |
| ETL | Python 3 (standard library only) |
| Deploy | Vercel |

## Repository layout

```
src/            Next.js app (App Router, components, lib)
  app/          routes: (auth)/login, (app)/painel, (app)/vendas, (app)/clientes,
                (app)/precos, (app)/estoque, (app)/compras, (app)/fornecedores,
                (app)/mdo, (app)/financeiro/recebiveis, (app)/despesas,
                (app)/resultado, (member)/membro
  components/   ui (shadcn) + app (shell, nav, combobox, badges…)
  lib/          Supabase clients, auth, formatting, nav
docs/           phase-0-setup.md, design-system.md, design/ (identity study)
etl/            workbook → SQL seeds (extract.py), schema checker, validation
supabase/
  migrations/   schema + RLS/views (idempotent)
  seeds/        generated data, one file per step
  seed.sql      combined seed used by `db push --include-seed` / `db reset`
  tests/        RLS smoke test (self-rolling-back)
```

## Getting started

Prerequisites: Node.js 20+, a Supabase project (the free tier works), and
Python 3.10+ only if you need to re-run the ETL.

1. Follow **[docs/phase-0-setup.md](docs/phase-0-setup.md)** — create the project,
   register your admin user in Auth, then:

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push --include-seed
   ```

2. *(Optional)* Run `supabase/tests/rls_test.sql` in the Supabase SQL editor to
   verify the security policies — 46/46 checks should pass, and nothing is left
   behind (the test rolls back).

> [!WARNING]
> Load the seed **once**. Ledger rows (sales, installments, inventory movements,
> expenses, MDO days) have no natural unique key, so running the seed twice
> duplicates them. Migrations, in contrast, are idempotent and safe to re-apply.

## Running the web app

Prerequisites: Node.js 20.9+ and the Supabase project loaded as above.

```bash
npm install

# Supabase → Project Settings → API keys
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the legacy anon key also works)

npm run dev          # http://localhost:3000
```

Sign in with the admin user created in
[`docs/phase-0-setup.md`](docs/phase-0-setup.md). To add an operator, create the
user in Supabase Auth and insert their profile:

```sql
insert into public.profiles (id, name, role)
select id, 'Nome', 'operator' from auth.users where email = 'email@exemplo.com'
on conflict (id) do update set name = excluded.name, role = excluded.role;
```

To open the member area, create the user in Supabase Auth and give them a
`member` profile with a price tier (`retail`, `t0.25`, `t0.35`, `t0.42`,
`t0.5`, `bronze`, `prata` or `ouro`):

```sql
insert into public.profiles (id, name, role, price_tier)
select id, 'Nome', 'member', 'retail' from auth.users where email = 'membro@exemplo.com'
on conflict (id) do update
  set name = excluded.name,
      role = excluded.role,
      price_tier = excluded.price_tier;
```

Members cannot change their own role or price tier; only an admin can update
those columns.

Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`,
`npm run typecheck`, and `npm run db:types` (regenerate
`src/lib/supabase/database.types.ts` from the Supabase project; requires
`SUPABASE_PROJECT_ID` and a logged-in Supabase CLI).

> [!NOTE]
> PostgREST aggregate selectors are disabled on this Supabase project, so sums
> shown in the UI come from SQL functions/views — e.g. `open_receivables_total()`
> and `v_client_overview`. Re-apply migrations after pulling (`supabase db push`,
> or paste the new files into the SQL editor) so they exist.

What this milestone includes:

- cookie-based Supabase session (proxy refreshes tokens and gates every route);
- role-aware shell: desktop side column, mobile top bar + leaf-triggered panel, bottom nav;
- **Painel** — month masthead, monthly P&L KPIs, open receivables, latest sales;
- **Vendas** — month filter, text search, pagination;
- **Lançar venda** — client/product comboboxes, payment method with up to three
  installments, discount handling, costs, PV, observation;
- **Clientes** — search and pagination, create/edit with phone/WhatsApp
  normalization, duplicate detection, purchase history/open balance and an
  admin-only transactional merge;
- **Estoque** — product balances, per-location chips, low/out-of-stock filters,
  Ouro-tier unit value, stock value and product movement history;
- **Compras** — purchase entry with supplier, account, destination, invoice,
  multiple line items, a price-tier picker that prefills unit cost, and totals;
  the chosen tier is stored on each line and shown in the purchase detail;
- **Fornecedores** — supplier directory with search, create/edit, active status,
  purchase totals and the known workbook distributors pre-seeded;
- **Preços** — searchable, print-friendly counter sheet with retail, 25–50%
  tiers, Bronze/Prata/Ouro and PV; values use the spreadsheet’s whole-reais
  rounding while the database keeps exact cents;
- **Movimentações** — transfers, adjustments, loans and returns with validation;
- **Contagens** — physical counts that store expected/counted values and post
  the difference as a stock movement;
- **MDO** — two views: the last seven days with today’s MDO, and a month view
  with a customisable date range, period summary, month summary for every month
  touched by the range and the daily breakdown; a daily editor keeps the 22
  spreadsheet KPIs;
- **Recebíveis** — open installments with overdue/today/next-seven-day,
  partial, settled and month filters; full or partial receipt form; write-off
  with reason (admin only); event history with admin reversal; and a guarded
  bulk reconciliation for the historical spreadsheet backlog;
- **Despesas** — monthly ledger with month/type/category/search filters,
  totals for fixed, variable and personal costs, and create/edit/delete;
  operators may write business expenses only, while personal expenses stay
  admin-only;
- **Resultado** — monthly P&L with sales profit, Herbalife royalties/bonus
  converted by the statement FX rate, business costs, personal expenses shown
  separately, expense breakdown by category and a clear warning when a month has
  no expenses recorded;
- **Área do membro** — dedicated catalog with the member price, search and
  pagination; members cannot change prices.

New sales with a stock-affecting deal type write an inventory movement in the
same request; a failed movement rolls the sale back. Expense changes revalidate
the monthly P&L. The visual language is documented in
[`docs/design-system.md`](docs/design-system.md).

## ETL (workbook → seeds)

The ETL converts the source workbook into the SQL seeds under `supabase/seeds/`,
using no third-party libraries:

```bash
python3 etl/extract.py            # regenerate supabase/seeds/*.sql + supabase/seed.sql
python3 etl/check_seed_schema.py  # fast static check: columns, arity, references
python3 etl/validate.py           # compare generated data against the workbook's own totals
```

The workbook (`*.xlsx`) is deliberately **not** committed — it contains private
business data. Keep it in the repo root locally when running the ETL. It is
frozen: after cutover the app is the source of truth.

Product prices use **Novos Preços HLF** as the exact source. Composed/access
items that only exist in **Tabela de Preços** take their retail and tier values
from columns E–L there, with SKU matching case-insensitive (the workbook mixes
`#497K` and `#497k`). Supplies, packaging and financial placeholders do not get
a shelf price. For databases seeded before this fix,
`20261020000003_price_backfill.sql` applies the same rows idempotently and
deactivates the empty `#497K` duplicate created by the old case-sensitive match.

## Data integrity

- The generated seed was validated against the workbook's contemporaneous totals:
  **100/100 checks pass** across 25 months (consignment, gifts, negotiated deals,
  sales), via [`etl/validate.py`](etl/validate.py).
- Where the workbook's own formulas were wrong or stale (e.g. discounted sales
  omitted from its `SUMIFS` totals), the database holds the corrected figure —
  details in [`etl/validation_report.md`](etl/validation_report.md).
- Spreadsheet “derived” sheets are not imported — they are recomputed as SQL
  views (`v_monthly_pnl`, `v_stock_on_hand`, `v_monthly_kpis`, …).
- Imported history: 160 products, 557 clients, 18,182 sales, 17,971 installments,
  1,629 inventory movements, 110 expenses, 730 MDO days. The imported expenses
  cover July 2023 only; later months are entered in the app, so Resultado warns
  when a month has no business expenses.
- Legacy inventory rows are signed quantities with `location_to` set. The new
  `v_stock_on_hand` also understands explicit `location_from` / `location_to`
  pairs, so new purchases, sales, transfers and counts can be applied on top of
  the imported opening balance. Historical sales are not backfilled; run a
  stock count if the imported balance does not match the physical count.

## Security notes

`npm audit` reports five high-severity advisories, all from one development-only
chain: `braces@3.0.3` ← `micromatch` ← `fast-glob` ← `@next/eslint-plugin-next`
← `eslint-config-next`. They do not affect the deployed app
(`npm audit --omit=dev` reports zero), are never bundled by `next build`, and
require attacker-controlled glob patterns to exploit.

There is no patched `braces` release yet — 3.0.3 is the latest — and npm's
suggested "fix" downgrades `eslint-config-next` to v14, which would break the
Next 16 lint setup. The advisories are accepted and should be revisited when a
new `braces`/`micromatch` release ships.

## Roadmap

- [x] **Phase 0** — PostgreSQL schema, RLS, ETL, seeds and validation
- [x] **Phase 1** — Next.js app: auth gate, pt-BR app shell, Painel, Vendas and
      Lançamento de Vendas
- [x] **Phase 2a** — Clientes: CRUD, phone/WhatsApp, dedupe and merge
- [x] **Phase 2b** — Estoque, compras, fornecedores, preços, movimentações e contagens
- [x] **Phase 2c** — Despesas e Resultado (P&L), com lançamento de despesas do negócio e extrato Herbalife
- [x] **Phase 3** — MDO diário e área do membro (reservas removidas da interface)
- [x] **Phase 4a** — Recebíveis: recebimentos parciais, baixas e reconciliação
      histórica em lote
