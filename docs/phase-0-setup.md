# BioAvalia — Phase 0 setup (Supabase + seeds)

Everything below is done **once**, on your machine, against your own Supabase
project. The repo already contains migrations, the generated seed, and tests —
no SQL needs to be written by hand.

```
supabase/
├── migrations/                             # timestamped schema, RLS and phase migrations
├── ops/pre_cutover_checks.sql              # read-only production readiness report
├── seed.sql                                # combined seeds 001..007 (~41k inserts)
├── seeds/                                  # same data, one file per step (for review)
└── tests/rls_test.sql                      # RLS smoke test (self-cleaning)
```

---

## 0. Prerequisites

| Tool | Why | Install |
|------|-----|---------|
| Node.js 20+ | runs the Supabase CLI (and Next.js later) | `nvm install 22` or nodejs.org |
| Supabase CLI | apply migrations + seed | already in `package.json` as a dev dependency → use `npx supabase …` (or `npm install -g supabase` for a global `supabase` command) |
| psql *(optional)* | run the RLS test, manual queries | `sudo apt install postgresql-client` / `brew install libpq` |

Check (from the repo root): `npx supabase --version` — should print v2.x.

## 1. Create the Supabase project

1. supabase.com → **New project**.
2. Region: choose the region closest to your users **and** your Vercel function
   region. The linked production project is in `us-east-2`; its Vercel functions
   use `cle1` (Cleveland, same AWS region). A project in South America would use
   `sa-east-1` with Vercel `gru1`.
3. Save the **database password** somewhere safe.
4. Note the **project ref** (in the dashboard URL: `supabase.com/dashboard/project/<ref>`).

## 2. Create your admin user *before* loading seeds

Dashboard → **Authentication → Users → Add user** → your e-mail + password
(enable "Auto Confirm User").

> Doing this first means every seed row gets `created_by` = your admin user
> automatically. If you load the seeds first, the field stays NULL — see §6.

## 3. Link the repo

From the repo root (`BioAvalia/`):

```bash
npx supabase init          # creates supabase/config.toml, keeps existing files
npx supabase login
npx supabase link --project-ref <project-ref>
```

`supabase init` may ask about generating VS Code settings — either answer is fine.
If `config.toml` is created fresh, leave its default `[db.seed] sql_paths = ['./seed.sql']`
(it matches the file we generated).

## 4. Push schema + load the seed (one command)

```bash
npx supabase db push --include-seed
```

What happens: the migrations run in filename order and create the schema, RLS,
views and RPCs → `supabase/seed.sql` loads ~41,000 inserts (takes a minute or
two). The latest migration is
`20261024000001_phase5_monthly_pnl_view.sql`.

> ⚠️ **Do not run the seed twice.** Ledger rows (sales, installments,
> movements, expenses, MDO days) have no natural unique key, so a second run
> duplicates them. In contrast, reference data / products / clients use
> `on conflict` and are safe.

<details>
<summary>Fallback without the CLI</summary>

Dashboard → SQL editor, paste each migration in filename order, then the seed.
The SQL editor will struggle with `seeds/004_sales.sql` (13 MB) — prefer the
CLI, or use psql:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
# DATABASE_URL = Dashboard → Connect → Session pooler connection string
```
</details>

## 5. Register your profile as admin

Dashboard → SQL editor:

```sql
insert into public.profiles (id, name, role)
select id, 'Jun', 'admin' from auth.users where email = 'SEU_EMAIL_AQUI'
on conflict (id) do update set role = 'admin';
```

## 6. Verify the load

```sql
select
  (select count(*) from products)           as produtos,     -- 160
  (select count(*) from product_prices)     as precos,       -- 959
  (select count(*) from clients)            as clientes,     -- 557
  (select count(*) from sales)              as vendas,       -- 18182
  (select count(*) from sale_payments)      as parcelas,     -- 17971
  (select count(*) from inventory_movements) as movimentos,  -- 1629
  (select count(*) from expenses)           as despesas,     -- 110
  (select count(*) from daily_kpis)         as dias_mdo;     -- 730
```

And a spot check of the recomputed P&L:

```sql
select * from v_monthly_pnl order by month desc limit 6;
```

If `created_by` ended up NULL (seeds loaded before you created the user):

```sql
update public.sales                set created_by = (select id from public.profiles where role = 'admin' limit 1) where created_by is null;
update public.expenses             set created_by = (select id from public.profiles where role = 'admin' limit 1) where created_by is null;
update public.inventory_movements  set created_by = (select id from public.profiles where role = 'admin' limit 1) where created_by is null;
update public.daily_kpis           set created_by = (select id from public.profiles where role = 'admin' limit 1) where created_by is null;
```

## 7. RLS smoke test (recommended, ~5 seconds)

Paste the whole of `supabase/tests/rls_test.sql` into the SQL editor
(or `psql "$DATABASE_URL" -f supabase/tests/rls_test.sql`).

It creates throwaway users, checks 61 access, settlement, cash, month-close and
price-import rules
rules (admin sees everything; operator never sees personal expenses / royalties /
audit / closings; member sees only the catalog and its own reservation rows) and
**rolls everything back**.

Expected: 61 rows, all `PASS`, including `v_monthly_pnl`.

## 8. After cutover

For the full single-environment deployment and data-reconciliation sequence, use
[`cutover-runbook.md`](cutover-runbook.md). The short version:

- The workbook becomes **read-only** once the app is live; BioAvalia is the
  source of truth.
- Regenerating seeds (only needed if the workbook changes before cutover):
  `python3 etl/extract.py` → `python3 etl/check_seed_schema.py` →
  `python3 etl/validate.py`.

## Troubleshooting

| Symptom | What to do |
|---------|------------|
| `supabase: command not found` | `npm config get prefix` → ensure its `bin` is in your `PATH`. |
| `db push` stops near 004_sales | Seed was partially applied. **Tell me before re-running** — ledger rows would duplicate. We'll clean and reload. |
| SQL editor times out | Use the CLI or psql; the editor is not meant for 13 MB files. |
| Migration filename warnings | Files use `20261018000001_…`/`…0002_…` — CLI-valid `<timestamp>_<name>.sql`. |
