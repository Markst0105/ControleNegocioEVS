# BioAvalia

Web-based control system for a Herbalife distributor (EVS Mooca + CASA), replacing
the `Controle do Negócio` spreadsheet. The workbook is imported once; after cutover
the app is the single source of truth. The interface is pt-BR; code, comments and
database identifiers are in English.

> [!NOTE]
> **Status: Phase 0 complete.** Database schema, RLS, ETL and the full import are
> built and verified end-to-end (19/19 RLS checks, 100/100 workbook-validation
> checks, seed loaded against a real PostgreSQL instance). Phase 1 — the Next.js
> web app — is next.

## What it covers

| Area | Details |
|------|---------|
| Sales | Per-sale ledger: deal types (consignment, gifts, negotiated prices…), discounts, PV and profit per sale |
| Clients | CRM with phone/WhatsApp fields and aliases for de-duplicated names |
| Inventory | Purchases, sales and transfers between EVS Mooca and CASA; stock on hand |
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
| Web app | Next.js (App Router) + TypeScript — *Phase 1* |
| UI | Tailwind CSS + shadcn/ui, pt-BR |
| Database | Supabase (PostgreSQL) — SQL schema, RLS, reporting views |
| ETL | Python 3 (standard library only) |
| Deploy | Vercel |

## Repository layout

```
docs/          phase-0-setup.md — step-by-step Supabase setup
etl/           workbook → SQL seeds (extract.py), schema checker, validation
supabase/
  migrations/  schema + RLS/views (idempotent)
  seeds/       generated data, one file per step
  seed.sql     combined seed used by `db push --include-seed` / `db reset`
  tests/       RLS smoke test (self-rolling-back)
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

## Roadmap

- [x] **Phase 0** — PostgreSQL schema, RLS, ETL, seeds and validation
- [ ] **Phase 1** — Next.js app: auth gate, pt-BR app shell and “Lançamento de Vendas”
- [ ] **Phase 2+** — remaining modules: inventory, expenses & P&L, dashboards, reservations
