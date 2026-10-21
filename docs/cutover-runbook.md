# Phase 5 — Production readiness and cutover

This runbook combines **5A (deployment readiness)** and **5B (data and
operations readiness)** for a single production environment. There is no
separate staging Supabase project.

> [!WARNING]
> Preview deployments are not a staging database. If a Vercel preview points at
> production, enable Deployment Protection and never run migrations, bulk
> reconciliation or destructive tests from a preview. The safest setup is to
> configure Supabase environment variables for **Production only**.

## Environment

| Item | Current value |
|------|---------------|
| Supabase project | `ControleNegocioEVS` (linked locally) |
| Supabase region | `us-east-2` (AWS Ohio, from the project pooler) |
| Vercel function region | `cle1` (Cleveland, also `us-east-2`), set in `vercel.json` |
| App framework | Next.js 16 on Vercel |
| Latest migration | `20261024000001_phase5_monthly_pnl_view.sql` |
| RLS suite | 59 checks, all passing in the local PostgreSQL-compatible harness |

`cle1` and the database are in the same AWS region. Do **not** use `gru1` unless
the Supabase project is recreated in `sa-east-1`; changing the database region
means creating a new project and restoring into it.

## Repo changes already in place

- `.vercelignore` keeps the 15 MB `supabase/seed.sql`, generated seeds, ETL
  source, spreadsheets and local tooling out of Vercel uploads.
- `vercel.json` pins Vercel Functions to `cle1`.
- `supabase/ops/pre_cutover_checks.sql` is a read-only report for schema, RLS,
  receivables, month completeness, catalog gaps, stock and profile checks.
- `scripts/db-rls.sh` and `scripts/db-report.sh` wrap the RLS suite and the
  report behind `DATABASE_URL`; `scripts/check-schema-parity.mjs` probes every
  table, view and function the code calls; `scripts/check-repo-visibility.sh`
  fails when the GitHub repository is public while the seed is tracked.
- `scripts/smoke-url.sh` runs the public-surface smoke test against a
  deployment.
- `GET /api/health` is a public readiness endpoint: it checks the Supabase
  env values, the Auth service, the publishable key, the Phase 4b table and the
  Phase 5 reporting view. It returns `200` with `{"status":"ok"}` only when
  everything is in place, and `503` with a reason otherwise.
- `20261024000001_phase5_monthly_pnl_view.sql` rewrites `v_monthly_pnl` without
  the FULL JOIN that some planners reject. The RLS check for the view now runs
  for real instead of being stubbed.
- `20261025000001_phase5_catalog_gaps.sql` creates the 25 products that only
  the ledger references, links the 756 affected sales and backfills
  `sales.product_name_raw`, so no imported sale shows an empty product.
- The RLS suite remains self-rolling-back and must pass 59/59 on production.

## Confirmed on the live database

Checked against the linked production project through PostgREST:

- `month_closings` (Phase 4b) and `sale_payment_events` (Phase 4a) exist, so
  those migrations are already applied.
- `v_monthly_pnl` answered with
  `FULL JOIN is only supported with merge-joinable or hash-joinable join
  conditions` (HTTP 400) and now answers `200` after the Phase 5 migration.
- Every table, view and function the code calls is exposed: **47/47** in
  `npm run db:parity`.
- The catalog gaps are still open until
  `20261025000001_phase5_catalog_gaps.sql` is applied: 756 sales have no
  product and every imported sale has an empty product name.

Go-live blocker: apply `20261025000001_phase5_catalog_gaps.sql` (step A5) and
re-run the health check and the pre-cutover report.

## 5A — Deployment readiness

### A1. Access and prerequisites

- [ ] Supabase owner/admin access and a CLI access token (`npx supabase login`).
- [ ] The production database password, or a `DATABASE_URL` for `psql`.
- [ ] Vercel account with permission to create/link the project and read
      environment variables.
- [ ] GitHub push access to `main`.
- [ ] A domain name (or the `*.vercel.app` URL) for Supabase Auth.
- [ ] The legacy workbook is available read-only for reference until cutover.

The current workspace is linked to the Supabase project but is **not**
authenticated to the Supabase or Vercel CLIs. Run the login steps interactively
before continuing.

### A2. Pre-flight

- [ ] `main` contains Phase 4b and the Phase 5 view fix.
- [ ] Working tree contains nothing unintended.
- [ ] The app builds locally with the production environment shape.

```bash
git fetch origin
git status --short
git log -1 --oneline
npm ci
npm run typecheck
npm run lint
npm run build
```

- [ ] The build passes.
- [ ] `.env.local` has only the two public Supabase values. Never add a service
      role key to a `NEXT_PUBLIC_*` variable or to Vercel.

### A3. Repository visibility — blocker while the seed is tracked

`supabase/seed.sql` and `supabase/seeds/*` are tracked in git, and they contain
client names, sales, installments, expenses and prices. If the repository is
public, that data is published to the internet.

```bash
npm run repo:visibility
```

- [ ] The check reports that the repository is **not** publicly readable, i.e.
      GitHub → Settings → General → Danger Zone → **Change visibility →
      Private**.

While the repository is public, treat the client names, sales history and
expense descriptions as exposed. If the repository has to stay public, the seed
has to leave the repository *and* its history (`git filter-repo` or BFG), and
the seed is regenerated locally from the workbook with `python3 etl/extract.py`.
Deleting the file from the latest commit is not enough — the history still
contains it.

`.vercelignore` already keeps the seed out of Vercel uploads; it does not
protect the GitHub repository.

### A4. Back up before touching the database

- [ ] Confirm the backup policy in Supabase → **Database → Backups**.
- [ ] If the plan has no recoverable backup, take a logical dump first:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="prod-before-phase5-$(date +%F).dump"
```

- [ ] Store the dump outside the repository.
- [ ] Record the current row counts for `sales`, `sale_payments`, `expenses`,
      `inventory_movements` and `audit_log`.

### A5. Apply migrations

Use the CLI. Do **not** pass `--include-seed`; the seed has already been loaded
and running it again duplicates ledger rows.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push
```

- [ ] The migration list is empty after the push (no pending files).
- [ ] `20261023000001_phase4b_cash_flow_month_close.sql` is applied.
- [ ] `20261024000001_phase5_monthly_pnl_view.sql` is applied.
- [ ] `20261025000001_phase5_catalog_gaps.sql` is applied.
- [ ] PostgREST reloaded its schema. The Phase 4b and Phase 5 migrations issue
      `notify pgrst, 'reload schema'`; if the API still returns 404 for
      `month_closings`, wait a few seconds or run:
      `select pg_notify('pgrst', 'reload schema');`

If the CLI is unavailable, run the migration files in filename order in the
Supabase SQL editor. Never run `seed.sql` this way.

### A6. Verify the database

- [ ] Run the RLS suite against production. It rolls back and leaves no test
      users or rows.

```bash
DATABASE_URL="postgresql://..." npm run db:rls
# equivalent: psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
```

Expected: 59 rows, every one `PASS`, including `v_monthly_pnl`. The script
exits non-zero on any failure or if the number of checks is not 59.

- [ ] Run the read-only cutover report and save the output:

```bash
DATABASE_URL="postgresql://..." npm run db:report > "cutover-report-$(date +%F).log"
# equivalent: psql "$DATABASE_URL" -f supabase/ops/pre_cutover_checks.sql
```

Expected: schema and RLS gates are clean; the data sections are reviewed in 5B.

- [ ] Confirm the view is queryable:

```sql
select * from public.v_monthly_pnl order by month desc limit 6;
```

- [ ] Confirm the app-facing RPCs are callable:

```sql
select * from public.open_receivables_summary();
select * from public.cash_flow_summary(date_trunc('month', public.business_today())::date);
select * from public.month_close_summary(date_trunc('month', public.business_today())::date);
```

- [ ] The readiness endpoint is green. It checks the env values, the Auth
      service, the publishable key, `month_closings` and `v_monthly_pnl`:

```bash
curl -s https://<production-domain>/api/health | python3 -m json.tool
```

Expected: `"status": "ok"` and HTTP 200.

- [ ] Every relation the code calls exists in the project:

```bash
npm run db:parity
```

Expected: `Schema parity: 47/47 relations available.` The check only reads: it
probes each table and function through PostgREST and never runs a mutating
function.

### A7. Configure Vercel

Create or link one Vercel project for `main`. There is no staging project.

```bash
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel env ls production
npx vercel --prod
```

- [ ] Both `NEXT_PUBLIC_*` values are set for **Production**.
- [ ] The values are present **before the build**: Next.js inlines
      `NEXT_PUBLIC_*` into the bundle at build time, so a deployment built
      without them starts with an empty Supabase URL and every request fails.
      A preview build without them fails at runtime, which is the desired
      isolation from production data.
- [ ] Preview variables are either unset or the preview is protected and uses a
      non-destructive test plan. Do not point an unprotected preview at
      production data.
- [ ] `vercel.json` is present and the project region shows `cle1`
      (Settings → Functions → Region). Hobby can select one region.
- [ ] Deployment Protection is enabled for Preview deployments.
- [ ] The production deployment build succeeds.
- [ ] Note the deployment URL and commit SHA.

### A8. Configure Supabase Auth

- [ ] Authentication → URL Configuration → **Site URL**:
      `https://<production-domain>`
- [ ] Redirect URLs:
      `https://<production-domain>/**` and `http://localhost:3000/**`
- [ ] Email/password sign-in works for a real admin.
- [ ] If email confirmation or password recovery is enabled, the redirect URL
      above is the one Supabase will use.

### A9. Production smoke test

Use a real admin, a real operator and a real member (or dedicated test accounts
that are removed afterwards).

- [ ] Run the automated public-surface check first:

```bash
bash scripts/smoke-url.sh https://<production-domain>
# with Deployment Protection: VERCEL_BYPASS_TOKEN=… bash scripts/smoke-url.sh <url>
```

It checks the login page, `/api/health` and that `/painel`, `/vendas`,
`/membro` and `/reservas` send anonymous visitors to `/login`.

- [ ] Anonymous visit redirects to `/login`.
- [ ] Admin signs in and lands on `/painel`.
- [ ] Operator signs in and lands on `/painel`.
- [ ] Member signs in and lands on `/membro`.
- [ ] Member sees only the catalog and cannot open `/painel`, `/vendas`,
      `/financeiro/recebiveis`, `/financeiro/fechamento` or `/reservas`.
- [ ] Operator does not see Fechamento, personal expenses, Herbalife statements
      or the audit log.
- [ ] Admin sees Fechamento, personal expenses and Herbalife statements.
- [ ] Desktop side column is visible; on a phone the leaf control opens the
      panel.
- [ ] The bottom nav has exactly **Painel, Vendas, Lançar, Clientes**.
- [ ] Painel month figures match `month_close_summary()`.
- [ ] Recebíveis open total matches `open_receivables_summary()`.
- [ ] Caixa month totals match `cash_flow_summary()`.
- [ ] Resultado shows the incomplete-month warning when business expenses are
      missing.
- [ ] Preços prints in whole reais; the screen keeps exact cents.
- [ ] Estoque shows `—` and zero value for products without a current Ouro
      price.
- [ ] New sale, sale with installments, partial receipt, expense, purchase and
      stock movement all complete without an error.
- [ ] `/reservas` returns 404.

## 5B — Data and operations readiness

Run `supabase/ops/pre_cutover_checks.sql` first and keep the output with the
cutover record. The gates below are decisions, not automatic scores.

### B1. Choose the cutover date and freeze the workbook

- [ ] Choose the first day the app is the source of truth.
- [ ] Stop entering new rows in the spreadsheet.
- [ ] Keep the workbook read-only for at least 90 days. Do not delete it.
- [ ] Record who has admin/operator/member access and who approved go-live.

### B2. Reconcile imported receivables

The import starts with roughly 17,971 open installments. Before cutover, settle
or write off everything that belongs to the historical period.

- [ ] Open `/financeiro/recebiveis` as an admin.
- [ ] Set **Vencidos até** to the last day before the cutover date.
- [ ] For installments with bank/cash evidence, use **Marcar como recebidas**.
      Bulk receipts use each installment’s `due_on`, so they land in the
      correct historical month.
- [ ] For installments without evidence, use **Baixar sem recebimento** with a
      clear reason such as `Saldo histórico sem comprovação`. Write-offs are not
      cash movements.
- [ ] For a receipt that actually arrived on a different date, use the individual
      receipt form instead of the bulk action.
- [ ] Never bulk-settle installments due on or after the cutover date.
- [ ] Re-run the open receivables section of the report.

Gate:

- [ ] No unexpected open installment has `due_on` before the cutover date.
- [ ] Every exception is listed with why it remains open.
- [ ] `open_receivables_summary()` matches the Recebíveis screen.

### B3. Backfill business expenses

The imported expenses cover July 2023 only. Later months are entered in the app,
so a month with no business expenses is incomplete.

- [ ] Backfill the current fiscal year from bank statements, card statements and
      receipts.
- [ ] Backfill any earlier month that will be reported as final.
- [ ] Use `negocio_fixo` and `negocio_variavel` for business costs; keep
      `pessoal` separate.
- [ ] Check expenses without an account or category in the report.
- [ ] Do not invent a zero expense month. Leave the warning visible or document
      the gap.

Gate:

- [ ] Every month that will be presented as final has business expenses, or a
      close note explaining why the data is unavailable.
- [ ] Personal expenses are not mixed into business totals.

### B4. Enter Herbalife statements

- [ ] Enter royalty, FX, bonus and bonus FX for every month that will be
      reported as final.
- [ ] Confirm the currency conversion: `royalty_usd × royalty_fx` and
      `bonus_usd × bonus_fx`.
- [ ] Do not enter a USD amount with a blank FX rate.

Gate:

- [ ] `month_close_summary()` returns `statement_present = true` for final
      months, or the month is explicitly marked incomplete.

### B5. Close catalog gaps

The Phase 5 migration creates the 25 products that the ledger references but
the price sheets do not contain (756 sales) and links them. They are created
**inactive and without a price**, because they are history, not sellable stock.

- [ ] Apply `20261025000001_phase5_catalog_gaps.sql` and re-run the report:
      `sales_without_product` must be 4 and `sales_without_readable_name` must
      be 1. Those rows are empty in the workbook itself.
- [ ] Review the three old SKUs that are probably current products with an old
      number. Nothing was guessed; the sales keep their historical SKU:
      - `#0146` Shake Cookies → `#295K` Shake Cookies & Cream 550g
      - `#1522` and `#174K` Shake Banana → `#326K` Shake Banana Caramelizada 550g
      - `#0009` (one sale) Shake Doce de Leite → `#0940` Shake Doce de Leite 550g
- [ ] The EVS unit items (`bcu` Barra Citrus Unitária, `bvu` Barra Vanilla
      Unitária, `bcr` Barra Crunch Unitária, `ssf`/`ssg` Sachê Sopa, `wld`
      Waffle Duplo) are the per-unit versions of items that already exist in
      the catalog (`bpu`, `ssl`, `wdd`/`wds`). Decide whether the new rows stay
      separate or are replaced by the existing products.
- [ ] If an item is still sold, give it a price and activate it; the new rows
      have no Ouro price, so their stock value is `—` and contributes zero.
- [ ] Review sold products with no current Ouro price in the report. Missing
      prices contribute zero to stock value by design, but a sold product with
      no price is a review item.
- [ ] Confirm the printed price sheet and the stored exact-cent prices still
      match the current supplier table.

Gate:

- [ ] No sale shows an empty product in Vendas, Painel, Clientes or Recebíveis.
- [ ] Every product that should carry stock has a current Ouro price.

### B6. Count stock

- [ ] Count the physical stock on the cutover date.
- [ ] Record the count in `/estoque/contagens/nova`, one location at a time.
- [ ] Review negative balances. Fix import artifacts before the count if needed.
- [ ] Confirm `inventory_summary()` stock value uses `qty_on_hand × current
      exact Ouro price`.

Gate:

- [ ] The count is recorded and the expected/counted differences are understood.
- [ ] No unexplained negative balance remains.

### B7. Review accounts and purchases

- [ ] Make sure expenses and purchases point to the correct account when the
      information exists.
- [ ] Check purchases without a supplier or account in the report.
- [ ] Confirm there are no duplicate purchases or duplicate ledger rows from a
      previous partial seed.

### B8. Close the historical months

- [ ] Open `/financeiro/fechamento` as admin, month by month.
- [ ] Read every warning. A warning is not a blocker to a soft close, but it must
      be understood.
- [ ] For months with unavailable historical data, close with a note such as
      `Histórico incompleto — não usar como resultado final`.
- [ ] Do not close future months.
- [ ] If a month is reopened, write the reason; the action is audited.

Gate:

- [ ] The last month before cutover is closed with a note.
- [ ] No month is presented as final without expenses and a statement, unless
      the note says it is incomplete.
- [ ] Reopen/close produces an audit row and preserves the previous snapshot.

### B9. Monitoring and operations

- [ ] Supabase backups are enabled and the restore procedure is known.
- [ ] Vercel deployment logs and Supabase logs are accessible to the owner.
- [ ] A simple uptime check is configured for `/api/health` (or the production
      domain), if available. The endpoint answers `503` when the database or
      the schema is not ready.
- [ ] The admin knows how to rotate the database password and the publishable
      key.
- [ ] The team knows that PostgREST aggregate selectors are disabled and that
      totals come from SQL functions/views.
- [ ] The 90-day spreadsheet retention decision is recorded.

## 5C — Cutover day

1. Take the final backup.
2. Confirm the migration list is empty.
3. Confirm the RLS suite is 59/59 and `npm run db:parity` is 47/47.
4. Confirm the cutover report has no unexplained gate failure.
5. Deploy the production build.
6. Run the A9 smoke test.
7. Record opening balances: open receivables, stock value, cash accounts.
8. Announce that the app is the source of truth and the workbook is read-only.
9. Keep the previous Vercel deployment and the pre-cutover database backup
   available for 30 days.

## Rollback

- **App:** Vercel → Deployments → previous successful deployment → **Promote to
  Production**. The Phase 4b/5 migrations are additive, so the previous app
  version does not depend on the new tables.
- **Database:** do not write down-migrations. Restore the pre-cutover dump or
  the Supabase backup if a migration or reconciliation damages data.
- **Receivable mistakes:** use the admin event reversal in Recebíveis; do not
  delete ledger rows directly.
- **Month-close mistakes:** reopen the month with a note; the snapshot and audit
  trail are preserved.
- **Never re-run `seed.sql`** against a database that already has ledger rows.

## Final go/no-go

Go only when all of these are true:

- [ ] Migrations applied and PostgREST sees the new schema.
- [ ] `npm run db:parity` reports 47/47 and `GET /api/health` is green.
- [ ] The GitHub repository is private, or the seed is out of the repository and
      its history.
- [ ] RLS 59/59 on production.
- [ ] No unexpected open installment before the cutover date.
- [ ] Final months have expenses and statements, or an explicit incomplete note.
- [ ] Unmatched catalog names and negative stock are resolved or documented.
- [ ] Physical stock count recorded.
- [ ] Admin, operator and member smoke tests passed.
- [ ] Backup and rollback path verified.
- [ ] Workbook frozen and retained.
