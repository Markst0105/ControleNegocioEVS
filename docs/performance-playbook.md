# Performance playbook — Painel & Clientes

Status: the code changes from §4.2–§4.5 are implemented in the working tree,
including `supabase/migrations/20261019000002_page_queries.sql`. The migration
has **not** been applied to the live database yet; `/clientes` and `/painel`
require it because their RPCs do not exist until it is pushed.

Last updated: 2026-10-19.

Scope: the authenticated `GET /painel` and `GET /clientes` routes. The same
techniques apply to `/clientes/[id]`, `/vendas` and the sale form, but those are
not the first target.

## 0. Context

Initial measurements:

| Route | Time |
|-------|------|
| `/painel` | 2.6 s |
| `/clientes` | 3.6 s |

### Measurement results — 2026-10-19

| Route | Cold start | Warm median |
|-------|-----------|-------------|
| `/clientes` | 4.5 s | 4.2 s |
| `/painel` | 3.2 s | 3.0 s |
| `/vendas` | — | < 1 s |

Other observations:

- **Vendas is the control.** It uses the same proxy, layout and auth shell as
  the other two pages, but it is under one second.
- **TTFB is fast; content download is slow.** Next.js streams the shell and
  loading state early, then keeps the response open while the page resolves.
  “Content Download” here is mostly server-side page work, not network
  bandwidth.
- **Warm and cold are nearly the same.** Cold start is not the main problem.
- **No `current_user_role()` appears in the plans.** The per-row RLS helper is
  not confirmed as a cause.
- **Indexes are present.** Missing indexes are not the main problem.
- **The database is small for Postgres:** ~18k sales, ~18k installments,
  557 clients and 160 products.
- Plain select queries are fast. The page-specific aggregate views and exact
  count are the queries that need to be timed separately.

### Updated diagnosis

Vendas sharing the same shell effectively rules out proxy/auth/layout overhead
as the 2–3 second difference. The remaining work is page-specific:

1. `/clientes` uses `v_client_overview` over all sales/payments plus an exact
   count. This is the first target.
2. `/painel` uses full-history aggregate queries (`v_monthly_pnl`,
   `open_receivables_total`) plus several smaller queries. This is the second
   target.
3. RLS initplan, missing indexes and cold start are **not** the primary fixes
   based on these measurements. Keep the recipes in this document for future
   regressions, but do not apply them first.

The fast Vendas page shows that the target is achievable without changing the
auth/shell architecture.

---

## 1. Baseline before changing anything

Measure in production mode, not `next dev`:

```bash
npm run build
npm start
```

`next dev` compiles routes on demand and includes development overhead. Record
three full document loads per route, with the browser cache disabled, after the
server is warm. Use the median, not the first load.

Record:

| Route | Load 1 | Load 2 | Load 3 | Median | Notes |
|-------|--------|--------|--------|--------|-------|
| `/painel` | | | | | cold/warm |
| `/clientes` | | | | | cold/warm |

Also record the current values for the business checks:

```sql
select *
from public.v_monthly_pnl
where month = date_trunc('month', current_date)::date;

select public.open_receivables_total();

select count(*) from public.v_client_overview;
```

Keep these results; they are the correctness baseline for the changes in §4.

---

## 2. How to check each layer

### 2.1 Browser: TTFB vs total time

In Chrome or Firefox DevTools → Network:

1. Open `/painel` with a hard reload.
2. Select the document request.
3. Open **Timing**.
4. Read **Waiting for server response** (TTFB) and **Content Download**.

Interpretation:

| Observation | Meaning |
|-------------|---------|
| TTFB is ~2–3 s | Server, auth or Supabase query time |
| TTFB is fast, total is slow | Server-streamed page work, JS, hydration, fonts or content |
| First load slow, later loads fast | Cold start, route compilation or DB wake-up |

For App Router client navigations, the RSC request may appear as a `?_rsc=…`
request instead of a document request. Measure the initial document load for
the clearest baseline.

Next.js can send the layout/loading shell before the page's async work
finishes. In that case “Waiting for server response” is fast, but “Content
Download” stays open until the final streamed chunk. For a page response that
is only tens of KB, a multi-second content-download time is usually server
render/data time, not bandwidth.

### 2.2 Temporary server instrumentation

Add this only for measurement. Remove it before committing.

#### Supabase HTTP calls

Every `.from()`, `.rpc()` and auth call made by the server client is an HTTP
request. Wrap `fetch` in the server client and log the path and duration.

In `src/lib/supabase/server.ts`, temporarily add:

```ts
const timedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const path = new URL(rawUrl).pathname;

  try {
    const response = await fetch(input, init);
    const duration = Math.round(performance.now() - started);
    console.log(
      `[perf:supabase] ${init?.method ?? "GET"} ${path} ${duration}ms ${response.status}`,
    );
    return response;
  } catch (error) {
    const duration = Math.round(performance.now() - started);
    console.error(`[perf:supabase] ${path} failed after ${duration}ms`);
    throw error;
  }
};
```

Pass it to the client:

```ts
return createServerClient<Database>(supabaseUrl(), supabaseKey(), {
  global: { fetch: timedFetch },
  cookies: {
    // existing cookie handlers
  },
});
```

Do the same in `src/lib/supabase/proxy.ts` if you want to measure auth on the
proxy request. The proxy has its own `createServerClient` instance.

Log only `pathname`, never the query string: client search terms and phone
numbers can appear in the URL.

#### Route phases

Add temporary timers around the work you want to separate:

```ts
const t0 = performance.now();
const session = await getSession();
console.log(`[perf:layout] session ${Math.round(performance.now() - t0)}ms`);
```

```ts
const t0 = performance.now();
const [pnlResult, countResult, receivablesResult, recentResult, dealTypesResult] =
  await Promise.all([/* existing queries */]);
console.log(`[perf:painel] queries ${Math.round(performance.now() - t0)}ms`);
```

Do the same for `/clientes`. Use one timer around the session and one around
`Promise.all`. The difference between the route total and the query timers is
auth/rendering/network overhead.

### 2.3 Supabase: database time

Use **Dashboard → Reports → Query Performance** (or Logs Explorer) and compare
database execution time with the browser TTFB.

If `pg_stat_statements` is available:

```sql
select
  calls,
  round(total_exec_time::numeric, 1) as total_ms,
  round(mean_exec_time::numeric, 1) as mean_ms,
  round(max_exec_time::numeric, 1) as max_ms,
  left(query, 180) as query
from pg_stat_statements
where query ilike '%v_client_overview%'
   or query ilike '%v_monthly_pnl%'
   or query ilike '%sale_payments%'
   or query ilike '%current_user_role%'
order by total_exec_time desc
limit 20;
```

If the view is expanded in the recorded query, search for `clients`, `sales`
and `sale_payments` instead.

Interpretation:

- **A single query is ~3 s** → focus on §4.1 and §4.2/§4.3.
- **All queries total < 300 ms but TTFB is 3 s** → focus on §4.5 and §4.7.
- **Queries are fast when run as `postgres` but slow in the app** → RLS is the
  difference. See §2.4.

### 2.4 Query plans with RLS enabled

The Supabase SQL editor connects as `postgres`, which bypasses RLS. A plan from
the SQL editor can look fast and still not represent the app.

Simulate an authenticated user in a transaction:

```sql
begin;

select set_config(
  'request.jwt.claim.sub',
  '<USER_UUID>',
  true
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<USER_UUID>',
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

explain (analyze, buffers)
select *
from public.v_client_overview
order by name
limit 25;

rollback;
```

Also run the count and the other page queries:

```sql
begin;

select set_config('request.jwt.claim.sub', '<USER_UUID>', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<USER_UUID>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- exact count used by /clientes
explain (analyze, buffers)
select count(*) from public.v_client_overview;

-- current-month P&L used by /painel
explain (analyze, buffers)
select *
from public.v_monthly_pnl
where month = date_trunc('month', current_date)::date;

-- receivables used by /painel
explain (analyze, buffers)
select public.open_receivables_total();

rollback;
```

Use an admin UUID and, separately, an operator UUID. They exercise different
policies.

Look for:

- `current_user_role()` appearing inside a per-row `Filter`
- high `loops` on a scan (for example `loops=18182`)
- `Seq Scan` on `sales` or `sale_payments` where an index should apply
- the exact count re-evaluating the whole aggregate view

### 2.5 Indexes and table sizes

Check that the pending client indexes are actually present:

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('clients', 'sales', 'sale_payments')
order by tablename, indexname;
```

Expected from `20261019000001_clients.sql`:

- `idx_clients_phone_normalized`
- `idx_clients_whatsapp_normalized`
- `idx_sales_client_sold_on`
- `idx_sale_payments_sale`
- `idx_sale_payments_open`

Also check approximate row counts and sizes:

```sql
select
  relname,
  n_live_tup,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
where relname in ('clients', 'sales', 'sale_payments')
order by relname;
```

If statistics are stale after the seed/import:

```sql
analyze public.clients;
analyze public.sales;
analyze public.sale_payments;
```

### 2.6 Warm vs cold and region

1. Load the page, wait 30 seconds, load it again.
2. If the second load is much faster, investigate cold start and DB wake-up
   before changing queries.
3. In Supabase: **Project Settings → General → Region**.
4. In Vercel: **Project Settings → Functions → Region**.

The app’s Supabase setup is documented for São Paulo (`sa-east-1`). Vercel’s
São Paulo region is `gru1`. If the function runs in `iad1` while the database is
in South America, every Supabase round trip crosses the continent.

Do not change the region until the timings show that network latency is a
meaningful fraction of the total.

### 2.7 Is `getClaims()` local or remote?

With asymmetric JWT signing keys, `getClaims()` can verify the JWT locally.
With the legacy symmetric secret it may call Supabase Auth. The timed `fetch`
logs from §2.2 show which case applies:

- `/auth/v1/user` on every navigation → Auth network call
- only `/rest/v1/profiles` and page queries → local verification (or cached
  JWKS)

If Auth is the bottleneck, that is a project-level auth configuration change,
not a query change. Treat it separately and test session invalidation carefully.

---

## 3. Decision table

| What the measurements show | Likely cause | Go to |
|---|---|---|
| One aggregate view query takes seconds; plan shows per-row `current_user_role()` | RLS initplan/function overhead | §4.1 |
| Client view is fast but exact count adds ~1 s | Counting the aggregate view | §4.2 and §4.4 |
| Every page has ~1–2 s before page queries start | Auth/profile duplication or region | §4.5 and §4.7 |
| First load slow, repeated loads fast | Cold start/DB wake-up | §2.6 |
| TTFB fast, total load slow | Hydration/assets | §4.8 |
| Search gets slower as data grows | Leading-wildcard search | §4.6 |
| All DB work is already < 100 ms and TTFB is still high | Network/region | §4.7 |

---

## 4. Fix recipes

Apply one fix at a time and re-measure. Do not combine them into one migration
or one commit; if a fix regresses, you need to know which one.

### 4.1 RLS: evaluate the role helper once per statement

> Current status: **not indicated** by the 2026-10-19 measurements. The plans
> did not show `current_user_role()` per row. Keep this recipe for a future
> regression; do not apply it before the client/Painel query fixes.

#### What to check

Run the authenticated plan from §2.4. If the plan contains a per-row filter like:

```text
Filter: (current_user_role() = 'admin'::text)
```

or shows the role function under a scan with high `loops`, the helper is being
invoked for rows rather than once for the statement.

`current_user_role()` is a `SECURITY DEFINER` function that reads `profiles`.
The policies are permissive and many tables have both an `admin_all` policy and
an `operator_*` policy. For an admin, both expressions can be evaluated.

#### Fix pattern

Wrap the function in a scalar subquery:

```sql
(select public.current_user_role())
```

This is the standard way to encourage PostgreSQL to evaluate it once as an
InitPlan. The same applies to `auth.uid()`:

```sql
(select auth.uid())
```

Only make this change where the plan shows a problem. RLS is security-sensitive;
do not broaden access while optimizing it.

#### Minimal migration for Painel/Clientes

Create a new migration:

```bash
npx supabase migration new rls_initplan
```

The generated file is under `supabase/migrations/`. Paste the definitions for
the tables used by these routes. This preserves the existing policy names and
semantics; it only changes how the stable helpers are evaluated.

```sql
-- clients
drop policy if exists admin_all on public.clients;
create policy admin_all on public.clients
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists operator_clients_all on public.clients;
create policy operator_clients_all on public.clients
  for all
  using ((select public.current_user_role()) = 'operator')
  with check ((select public.current_user_role()) = 'operator');

-- sales
drop policy if exists admin_all on public.sales;
create policy admin_all on public.sales
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists operator_sales_all on public.sales;
create policy operator_sales_all on public.sales
  for all
  using ((select public.current_user_role()) = 'operator')
  with check ((select public.current_user_role()) = 'operator');

-- sale_payments
drop policy if exists admin_all on public.sale_payments;
create policy admin_all on public.sale_payments
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists operator_sale_payments_all on public.sale_payments;
create policy operator_sale_payments_all on public.sale_payments
  for all
  using ((select public.current_user_role()) = 'operator')
  with check ((select public.current_user_role()) = 'operator');

-- deal_types (read by both pages)
drop policy if exists admin_all on public.deal_types;
create policy admin_all on public.deal_types
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists operator_read on public.deal_types;
create policy operator_read on public.deal_types
  for select
  using ((select public.current_user_role()) = 'operator');

-- expenses (Painel P&L)
drop policy if exists admin_all on public.expenses;
create policy admin_all on public.expenses
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists operator_expenses_negocio on public.expenses;
create policy operator_expenses_negocio on public.expenses
  for select
  using (
    (select public.current_user_role()) = 'operator'
    and scope in ('negocio_fixo', 'negocio_variavel')
  );

-- herbalife_statements (Painel royalties/bonus)
drop policy if exists admin_all on public.herbalife_statements;
create policy admin_all on public.herbalife_statements
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

-- profiles (session lookup and own profile)
drop policy if exists admin_all on public.profiles;
create policy admin_all on public.profiles
  for all
  using ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists own_profile_read on public.profiles;
create policy own_profile_read on public.profiles
  for select
  using (id = (select auth.uid()));

drop policy if exists own_profile_update on public.profiles;
create policy own_profile_update on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists operator_read_members on public.profiles;
create policy operator_read_members on public.profiles
  for select
  using (
    (select public.current_user_role()) = 'operator'
    and role = 'member'
  );
```

Do not add an explicit `begin;`/`commit;` if the Supabase CLI already runs the
migration in a transaction. If you apply the SQL manually in the SQL editor,
wrap it in a transaction.

Repeat for other tables if their plans show the same per-row pattern. Do not
rewrite every policy at once.

#### Apply and verify

```bash
npx supabase db push
```

Run the existing RLS test:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
```

Then verify as admin and operator:

- Painel loads and shows the correct `Ganho líquido`, `A receber` and sales.
- Clientes list, detail, create, edit and merge still work.
- Operator cannot see personal expenses or royalties.
- Member still has no business access.
- Re-run the authenticated plans from §2.4 and check that the role expression is
  now an InitPlan or at least no longer appears per row.

If the plan does not change, revert this fix; do not keep a security-sensitive
change that provides no benefit.

### 4.2 Clientes: stop aggregating every client for a 25-row page

`v_client_overview` aggregates every client's sales and open installments. The
list then filters and limits to 25 rows, and the exact count can evaluate the
whole view again.

#### Better shape

1. Query the `clients` table directly for search, count, order and pagination.
2. Fetch aggregates only for the 25 returned IDs.

Create this function in the same migration or a second one:

```sql
create or replace function public.client_overview_for_ids(p_ids uuid[])
returns table (
  id uuid,
  sales_count bigint,
  total_spent numeric,
  last_purchase_on date,
  open_amount numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id,
    coalesce(s.sales_count, 0)::bigint,
    coalesce(s.total_spent, 0)::numeric,
    s.last_purchase_on,
    coalesce(p.open_amount, 0)::numeric
  from public.clients c
  left join lateral (
    select
      count(*) as sales_count,
      sum(coalesce(sa.amount_received, 0)) as total_spent,
      max(sa.sold_on) as last_purchase_on
    from public.sales sa
    where sa.client_id = c.id
  ) s on true
  left join lateral (
    select
      sum(
        greatest(
          coalesce(sp.amount, 0) - coalesce(sp.received_amount, 0),
          0
        )
      ) as open_amount
    from public.sale_payments sp
    join public.sales sx on sx.id = sp.sale_id
    where sx.client_id = c.id
      and sp.received_on is null
  ) p on true
  where c.id = any(p_ids);
$$;

revoke all on function public.client_overview_for_ids(uuid[]) from public;
grant execute on function public.client_overview_for_ids(uuid[]) to authenticated;
```

`security invoker` keeps RLS in effect. The function returns only the requested
clients. The pending indexes on `sales(client_id, sold_on)` and
`sale_payments(sale_id)` make each lateral lookup cheap.

#### List query

In `src/app/(app)/clientes/page.tsx`, change the base query from
`v_client_overview` to `clients`:

```ts
let query = supabase
  .from("clients")
  .select("id, name, phone, whatsapp", { count: "exact" })
  .order("name")
  .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
```

Keep the existing search filters, but point them at the `clients` columns:

```ts
const filters = [
  `name.ilike."%${search}%"`,
  `phone.ilike."%${search}%"`,
  `whatsapp.ilike."%${search}%"`,
];

if (digits.length >= 3) {
  filters.push(
    `phone_normalized.ilike."%${digits}%"`,
    `whatsapp_normalized.ilike."%${digits}%"`,
  );
}

query = query.or(filters.join(","));
```

After the page query:

```ts
const { data, count, error } = await query;
if (error) throw new Error(error.message);

const rows = data ?? [];
const ids = rows.map((row) => row.id);

const statsResult =
  ids.length > 0
    ? await supabase.rpc("client_overview_for_ids", { p_ids: ids })
    : { data: [], error: null };

if (statsResult.error) throw new Error(statsResult.error.message);

const statsById = new Map(
  (statsResult.data ?? []).map((row) => [row.id, row]),
);

const clients = rows.map((row) => ({
  ...row,
  ...(statsById.get(row.id) ?? {
    sales_count: 0,
    total_spent: 0,
    last_purchase_on: null,
    open_amount: 0,
  }),
}));
```

If `rows.length === 0`, skip the RPC and render the existing empty state.

The count now runs against 557 client rows, not against the aggregate view. At
this size `count: "exact"` is fine. If the client table grows into tens of
thousands, consider `count: "estimated"` and an explicit “approximately N”
label, or a cached total.

#### Detail and merge pages

Use `clients` for the base row and the same RPC for one ID:

```ts
const [clientResult, statsResult, salesResult, aliasesResult, dealTypesResult, session] =
  await Promise.all([
    supabase
      .from("clients")
      .select("id, name, phone, whatsapp, notes, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .rpc("client_overview_for_ids", { p_ids: [id] })
      .maybeSingle(),
    // existing sales, aliases, deal_types and session queries
  ]);

const client = clientResult.data;
if (!client) notFound();

const overview = {
  ...client,
  ...(statsResult.data ?? {
    sales_count: 0,
    total_spent: 0,
    last_purchase_on: null,
    open_amount: 0,
  }),
};
```

For `mesclar/page.tsx`, replace the source's `v_client_overview` query with a
`clients` row plus the same one-ID RPC.

Keep `v_client_overview` in the database during the transition. Drop it only
after every caller has moved.

Add the RPC signature to `src/lib/supabase/database.types.ts`, or regenerate and
review the diff:

```bash
npm run db:types
```

### 4.3 Painel: aggregate only the requested month

`v_monthly_pnl` groups the full sales and expenses history, then the page filters
to one month. Replace the Painel query with a month-scoped function.

```sql
create or replace function public.monthly_pnl(p_month date)
returns table (
  month date,
  ganho_vendas numeric,
  royalties numeric,
  bonus numeric,
  ganho_bruto numeric,
  custos_fixos numeric,
  investimentos_promocoes numeric,
  ganho_liquido numeric,
  despesas_pessoais numeric,
  pv_total numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month')::date as month_end
  ),
  sales_m as (
    select
      coalesce(sum(s.profit), 0) as gain_sales,
      coalesce(sum(s.pv), 0) as pv_total
    from public.sales s, bounds b
    where s.sold_on >= b.month_start
      and s.sold_on < b.month_end
  ),
  exp_m as (
    select
      coalesce(sum(e.amount) filter (where e.scope = 'negocio_fixo'), 0) as custos_fixos,
      coalesce(sum(e.amount) filter (where e.scope = 'negocio_variavel'), 0) as custos_variaveis,
      coalesce(sum(e.amount) filter (where e.scope = 'pessoal'), 0) as despesas_pessoais
    from public.expenses e, bounds b
    where e.incurred_on >= b.month_start
      and e.incurred_on < b.month_end
  ),
  stmt as (
    select
      coalesce(max(h.royalty_usd), 0) as royalty_usd,
      coalesce(max(h.bonus_usd), 0) as bonus_usd
    from public.herbalife_statements h, bounds b
    where h.month = b.month_start
  )
  select
    b.month_start,
    s.gain_sales,
    st.royalty_usd,
    st.bonus_usd,
    s.gain_sales + st.royalty_usd + st.bonus_usd,
    e.custos_fixos,
    e.custos_variaveis,
    s.gain_sales + st.royalty_usd + st.bonus_usd
      - e.custos_fixos - e.custos_variaveis,
    e.despesas_pessoais,
    s.pv_total
  from bounds b
  cross join sales_m s
  cross join exp_m e
  cross join stmt st;
$$;

revoke all on function public.monthly_pnl(date) from public;
grant execute on function public.monthly_pnl(date) to authenticated;
```

Add `monthly_pnl` (and, if changed, `open_receivables_total`) to
`src/lib/supabase/database.types.ts` or regenerate the types with
`npm run db:types`.

Then in `src/app/(app)/painel/page.tsx`:

```ts
supabase.rpc("monthly_pnl", { p_month: from }).maybeSingle()
```

Use the existing `from` (`monthFirstDay(month)`) value. The rest of the page
keeps the same field names.

`open_receivables_total()` can avoid grouping the whole schedule by due date and
sum the open installments directly. This preserves the current semantics: the
existing view sums `sp.amount` for rows where `received_on is null`.

```sql
create or replace function public.open_receivables_total()
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(sp.amount), 0)::numeric
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  where sp.received_on is null
    and sp.due_on is not null;
$$;

revoke all on function public.open_receivables_total() from public;
grant execute on function public.open_receivables_total() to authenticated;
```

If the business rule should be “amount minus partial received amount,” change
the `v_receivables_schedule` definition and this function together and verify
totals. Do not change only one of them.

Verify against the old view for several months:

```sql
select *
from public.v_monthly_pnl
where month = date_trunc('month', current_date)::date;

select *
from public.monthly_pnl(date_trunc('month', current_date)::date);

select public.open_receivables_total();
select sum(amount_due) from public.v_receivables_schedule;
```

### 4.4 Exact counts

`count: "exact"` forces the database to determine the full result size. It is
not free, especially on an aggregate view.

- Keep exact counts on base tables with small result sets (`clients`).
- Do not request exact counts on `v_client_overview`.
- For a large table where an approximate total is acceptable:

```ts
.select("id", { count: "estimated" })
```

Check `supabase-js`/PostgREST support in the installed version before using
`estimated`; totals are approximate and may make the last page imprecise.

For Painel's sales count, an exact count over one month on `sales(sold_on)` is
reasonable. If it shows up as a large cost, combine it into the monthly RPC
instead of issuing a separate query.

### 4.5 Session and profile per request

The layout calls `getSession()`, and the client detail/merge pages call it
again. React request caching can deduplicate that work.

In `src/lib/auth.ts`:

```ts
import { cache } from "react";
```

Wrap both functions:

```ts
export const getSessionUser = cache(
  async (): Promise<SessionUser | null> => {
    // existing body
  },
);

export const getSession = cache(
  async (): Promise<{ user: SessionUser; profile: Profile | null } | null> => {
    // existing body
  },
);
```

React `cache()` is request-scoped. Do **not** replace it with a module-level
variable or a global cache: that would mix users and bypass RLS expectations.

Leave the proxy's `getClaims()` call in place. If §2.7 shows that it is making a
network request on every navigation, handle that as a separate auth/region
change.

### 4.6 Indexes and search

#### Verify the pending client migration first

If the indexes from `20261019000001_clients.sql` are missing:

```bash
npx supabase db push
```

Do not apply the seed again. `db push` applies pending migrations; it does not
re-run the seed.

#### Add search indexes only if search is actually slow

The client search and Vendas search use `%term%`. B-tree indexes cannot help
with the leading wildcard. If `ILIKE` is a measured cost as the data grows:

```sql
create extension if not exists pg_trgm;

create index if not exists idx_clients_name_trgm
  on public.clients using gin (name gin_trgm_ops);

create index if not exists idx_clients_phone_normalized_trgm
  on public.clients using gin (phone_normalized gin_trgm_ops);

create index if not exists idx_clients_whatsapp_normalized_trgm
  on public.clients using gin (whatsapp_normalized gin_trgm_ops);

create index if not exists idx_sales_client_name_trgm
  on public.sales using gin (client_name_raw gin_trgm_ops);

create index if not exists idx_sales_product_name_trgm
  on public.sales using gin (product_name_raw gin_trgm_ops);
```

At 557 clients and 18k sales this is unlikely to be the first bottleneck. Add
it only after the plan shows a search filter scanning the table. For a very
large table, create indexes with `CONCURRENTLY` outside a transaction; the
current dataset is small enough for a normal `CREATE INDEX`.

#### Sales ordering

Only add this if the Vendas plan shows a sort after the month filter:

```sql
create index if not exists idx_sales_sold_on_created_at
  on public.sales (sold_on desc, created_at desc);
```

### 4.7 Region and cold start

Compare the Supabase project region with the Vercel function region (§2.6).

If they differ and network time is significant:

- Set the Vercel function region to São Paulo (`gru1`), or the closest region
  to the Supabase project and the users.
- In Next.js, a route segment can export `preferredRegion`; verify the current
  Vercel/Next 16 behavior before applying it globally.
- Keep the database in `sa-east-1` unless you have a reason to move it.

Do not move a production database as a performance experiment. Measure first.

### 4.8 Rendering and perceived time (optional, after queries are fast)

The page functions currently await all data before returning JSX. `loading.tsx`
shows a spinner, but the content cannot stream until every query finishes.

After the database work is under control:

- Keep the page shell stable.
- If one section remains slow (for example `A receber`), put that section in a
  `Suspense` boundary with a stable placeholder.
- Do not add entrance animations or staggered page-load choreography.

This changes perceived time, not the server total.

### 4.9 Cross-request caching (optional, security-sensitive)

Do not put RLS-filtered rows in a global cache keyed only by route. An admin and
an operator can see different data.

Safe candidates:

- Reference labels that are identical for every authenticated user.
- A summary cache keyed by both month and role/permission scope.
- A materialized summary refreshed by a trusted job, exposed through a
  `security_invoker` view or a function that re-applies access rules.

Invalidate caches after sales, expenses, client merges and other writes. The
existing server actions already call `revalidatePath`; if you introduce
tag-based caching, also call `revalidateTag`.

For the current dataset, the database fixes above should come first.

---

## 5. Verification checklist

After each fix:

```bash
npm run typecheck
npm run lint
npm run build
```

Run the app in production mode and re-measure:

```bash
npm start
```

Functional smoke tests:

- [ ] Login as admin.
- [ ] `/painel` renders monthly KPIs, latest sales and `A receber`.
- [ ] `/clientes` lists, searches by name, phone and WhatsApp.
- [ ] Pagination and total count are correct.
- [ ] Client detail shows purchases, aliases and open amount.
- [ ] Create/edit a client; duplicate phone warning still works.
- [ ] Admin merge still moves sales/aliases and deletes the source.
- [ ] `/vendas` lists sales and links to client detail.
- [ ] One real sale can be created end to end.
- [ ] Operator sees only permitted data.
- [ ] Member has no business access.

RLS smoke test:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
```

Query-plan check:

- [ ] Re-run the authenticated plans from §2.4.
- [ ] No per-row `current_user_role()` filter on the heavy scans.
- [ ] Client list count no longer scans `v_client_overview`.
- [ ] Painel P&L scans only the selected month.
- [ ] Open receivables no longer groups by due date for the total.

Business correctness:

- [ ] `monthly_pnl` matches `v_monthly_pnl` for at least six months.
- [ ] `open_receivables_total` matches `sum(amount_due)` from
      `v_receivables_schedule`.
- [ ] `client_overview_for_ids` matches `v_client_overview` for a sample of
      clients.

Performance record:

| Route | Before | After | Median | Notes |
|-------|--------|-------|--------|-------|
| `/painel` | 2.6 s | | | |
| `/clientes` | 3.6 s | | | |

A reasonable target is a warm production load under ~1 s for both routes, with
the database portion in the low hundreds of milliseconds. The exact target
depends on the Supabase/Vercel regions.

---

## 6. Recommended rollout order

1. **Measure and record the baseline** (§1–§2). The 2026-10-19 results are
   already recorded above.
2. **Apply `20261019000001_clients.sql` if it is still pending.** Verify the
   indexes from §2.5.
3. **Skip the RLS initplan migration for now.** The measured plans do not show
   `current_user_role()` per row. Keep §4.1 for a future regression, but do not
   apply it without evidence.
4. **Apply `20261019000002_page_queries.sql`.** It contains the client RPC,
   month-scoped P&L and direct receivables total used by the code changes in
   §4.2–§4.3. The app expects this migration to be live.
5. **Verify correctness before measuring** (§5): compare the new RPCs with the
   existing views for several months/clients, then smoke-test CRUD and merge.
6. **Measure again.** The client list/detail RPC and base-table count are the
   first target because Clientes is the slowest route. The Painel RPC and the
   session/profile request cache (§4.5) are included; the cache is a small
   fixed win, not the main cause.
7. **Only then:** search indexes, region changes, cross-request caching, or
   streaming (§4.6–§4.9).

Suggested commits for the current diagnosis:

```text
perf(clientes): avoid full aggregate view for client lists
perf(painel): scope monthly pnl and receivables queries
perf(auth): dedupe session lookup per request
perf(db): add search indexes when measurements justify them
chore(deploy): align app and database regions
```

---

## 7. Risks and rollback

### RLS

Highest risk. A policy mistake can expose or hide data. Test admin, operator and
member. Run `supabase/tests/rls_test.sql`. If a plan does not improve, revert the
migration instead of keeping unnecessary policy complexity.

### Monthly P&L

A calculation mistake is a business-reporting bug. Compare the function output
with `v_monthly_pnl` for multiple months and with the spreadsheet's known
values before switching the page.

### Open receivables

The current view uses gross `amount` for rows with `received_on is null`. The
optimized function in §4.3 preserves that. If you switch to net-of-partial
amounts, update `v_receivables_schedule` and the function together.

### Exact counts

Approximate counts can make pagination show an extra/empty last page. Keep
exact counts where the total is part of the UI contract.

### Indexes

`CREATE INDEX` locks writes briefly. The current tables are small, but run
schema changes outside peak hours. `CONCURRENTLY` cannot run inside a
transaction.

### Region

Moving the Vercel function region affects every function. Test authentication,
cookies and Supabase latency after the change.

### Production query plans

`EXPLAIN ANALYZE` executes the query. Use a read-only transaction, low-traffic
time, or a staging copy. Do not run heavy plans against production during the
day.

### Instrumentation

The timed `fetch` and console timers are temporary. Remove them before merging.
Do not log query strings, phone numbers, client names or JWTs.

---

## Appendix A: quick file map

| File | Role |
|------|------|
| `src/lib/supabase/server.ts` | Server Supabase client (instrumentation point) |
| `src/lib/supabase/proxy.ts` | Proxy auth refresh (`getClaims`) |
| `src/lib/auth.ts` | Session/profile lookup (`cache()` target) |
| `src/app/(app)/layout.tsx` | Auth gate for every app route |
| `src/app/(app)/painel/page.tsx` | Dashboard queries |
| `src/app/(app)/clientes/page.tsx` | Client list/search/count |
| `src/app/(app)/clientes/[id]/page.tsx` | Client detail |
| `src/app/(app)/clientes/[id]/mesclar/page.tsx` | Admin merge source lookup |
| `supabase/migrations/20261018000002_rls.sql` | Original RLS policies |
| `supabase/migrations/20261019000001_clients.sql` | Client view, indexes and merge RPC |
| `supabase/tests/rls_test.sql` | RLS access smoke test |
| `src/lib/supabase/database.types.ts` | Hand-maintained database/RPC types |

## Appendix B: commands

```bash
# baseline / verification
npm run typecheck
npm run lint
npm run build
npm start

# new migration
npx supabase migration new rls_initplan
npx supabase db push

# RLS smoke test
psql "$DATABASE_URL" -f supabase/tests/rls_test.sql

# regenerate types after adding RPCs
npm run db:types
```
