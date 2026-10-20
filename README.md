# Controle de Negócio

Web-based control system for a Herbalife distributor (EVS Mooca + CASA), replacing
the `Controle do Negócio` spreadsheet. The workbook is imported once; after cutover
the app is the single source of truth. The interface is pt-BR; code, comments and
database identifiers are in English.

> The repository folder and package ID keep the original `BioAvalia` name; the
> product name in the interface is **Controle de Negócio**.

> [!NOTE]
> **Status: Phase 2b — Estoque & Compras implemented.** Login, role-aware app
> shell, Painel, Vendas, Lançamento de venda, Clientes, Estoque and Compras are
> in the code. Clientes includes search/pagination, name + phone/WhatsApp
> deduplication and an admin-only merge. Estoque includes purchases, manual
> movements, stock counts, per-location balances and product history. The visual
> identity follows the **Balcão** direction: desktop side column, mobile top bar
> with a leaf-triggered panel, month masthead and an editorial serif for section
> titles. Expenses, MDO and reservations come next.
>
> Apply `supabase/migrations/20261019000002_page_queries.sql` and then
> `supabase/migrations/20261019000003_inventory_purchases.sql` before deploying
> the new Estoque/Compras pages. New sales now write a stock movement from
> cutover onward; historical sales are not backfilled.

## What it covers

| Area | Details |
|------|---------|
| Sales | Per-sale ledger: deal types (consignment, gifts, negotiated prices…), discounts, PV and profit per sale |
| Clients | CRM with phone/WhatsApp fields and aliases for de-duplicated names |
| Inventory | Purchases, manual movements and counts, with per-location balances and latest cost |
| Expenses & P&L | Business costs (fixed/variable) kept apart from personal expenses; royalties and bonus from Herbalife statements; monthly P&L |
| MDO | Daily activity KPIs for 730 days of history |
| Reservations | Client pre-orders — members see only their own |

Three roles, enforced in the database with Row-Level Security:

- **admin** — owner: full access;
- **operator** — day-to-day operations, but no access to personal expenses, royalties or the audit log;
- **member** — product catalog and own reservations only.

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
                (app)/estoque, (app)/compras
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
   verify the security policies — 19/19 checks should pass, and nothing is left
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
  latest purchase cost, stock value and product movement history;
- **Compras** — purchase entry with supplier, account, destination, invoice,
  multiple line items, unit cost and totals;
- **Movimentações** — transfers, adjustments, loans and returns with validation;
- **Contagens** — physical counts that store expected/counted values and post
  the difference as a stock movement.

New sales with a stock-affecting deal type write an inventory movement in the
same request; a failed movement rolls the sale back. Expenses, MDO and
reservations are the next milestones. The visual language is documented in
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

## Data integrity

- The generated seed was validated against the workbook's contemporaneous totals:
  **100/100 checks pass** across 25 months (consignment, gifts, negotiated deals,
  sales), via [`etl/validate.py`](etl/validate.py).
- Where the workbook's own formulas were wrong or stale (e.g. discounted sales
  omitted from its `SUMIFS` totals), the database holds the corrected figure —
  details in [`etl/validation_report.md`](etl/validation_report.md).
- Spreadsheet “derived” sheets are not imported — they are recomputed as SQL
  views (`v_monthly_pnl`, `v_stock_on_hand`, `v_monthly_kpis`, …).
- Imported history: 161 products, 557 clients, 18,182 sales, 17,971 installments,
  1,629 inventory movements, 110 expenses, 730 MDO days.
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
- [x] **Phase 2b** — Estoque, compras, movimentações e contagens
- [ ] **Phase 2c** — expenses & P&L screens (pending the expense data gap)
- [ ] **Phase 3** — MDO daily KPIs, reservations and the member area
