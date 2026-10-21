-- ============================================================================
-- Phase 5 — read-only pre-cutover checks
--
-- Run against the production database after every migration is applied and
-- before the legacy spreadsheet is frozen. The transaction is read-only so a
-- copy/paste mistake cannot change production data.
--
--   psql "$DATABASE_URL" -f supabase/ops/pre_cutover_checks.sql
--
-- The Supabase SQL editor shows only the last result. If you use the editor,
-- run one section at a time, without the begin/commit lines.
-- ============================================================================

begin transaction read only;

-- ---------------------------------------------------------------------------
-- 1. Schema gate
-- All four values must be true. If one is false, apply the missing migration
-- before continuing. The latest migration is
-- 20261023000001_phase4b_cash_flow_month_close.sql.
-- ---------------------------------------------------------------------------
select
    to_regclass('public.sale_payment_events') is not null as phase4a_receivables,
    to_regclass('public.month_closings') is not null as phase4b_month_close,
    to_regclass('public.v_cash_flow_entries') is not null as phase4b_cash_flow,
    to_regprocedure('public.month_close_summary(date)') is not null
        as month_close_summary,
    to_regprocedure('public.close_month(date,text)') is not null
        as close_month,
    to_regprocedure('public.reopen_month(date,text)') is not null
        as reopen_month;

-- ---------------------------------------------------------------------------
-- 2. RLS gate
-- These three results must be empty. Any row is a security issue to fix before
-- exposing the app to operators or members.
-- ---------------------------------------------------------------------------
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by 1;

select c.relname as table_with_rls_but_no_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relrowsecurity
  and not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = c.relname
  )
order by 1;

select c.relname as sensitive_view_without_security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in (
      'v_sale_payment_balances',
      'v_receivables_detail',
      'v_receivables_schedule',
      'v_cash_flow_entries',
      'v_monthly_pnl',
      'v_stock_on_hand',
      'v_stock_product_totals'
  )
  and not coalesce('security_invoker=true' = any(c.reloptions), false)
order by 1;

-- ---------------------------------------------------------------------------
-- 3. Data freshness
-- Confirms the import reached the end of the workbook and that the live tables
-- are the ones the team expects.
-- ---------------------------------------------------------------------------
select
    (select max(sold_on) from public.sales) as last_sale,
    (select max(incurred_on) from public.expenses) as last_expense,
    (select max(purchased_on) from public.purchases) as last_purchase,
    (select max(occurred_on) from public.sale_payment_events) as last_receipt_event,
    (select max(month) from public.herbalife_statements) as last_statement_month,
    (select max(kpi_date) from public.daily_kpis) as last_kpi;

-- ---------------------------------------------------------------------------
-- 4. Open receivables
-- The imported schedule starts fully open. Before cutover, settle or write off
-- everything due before the cutover date (with documented exceptions) so the
-- open balance reflects real money still owed.
-- ---------------------------------------------------------------------------
with open_balances as (
    select b.*
    from public.v_sale_payment_balances b
    where b.open_amount > 0
)
select
    count(*) as open_installments,
    count(*) filter (where due_on is null) as without_due_date,
    count(*) filter (where due_on < public.business_today()) as overdue,
    count(*) filter (
        where due_on >= public.business_today()
          and due_on <= public.business_today() + 7
    ) as due_next_7_days,
    coalesce(sum(open_amount), 0) as open_total,
    coalesce(sum(open_amount) filter (
        where due_on < public.business_today()
    ), 0) as overdue_total,
    min(due_on) as oldest_due_on,
    max(due_on) as newest_due_on
from open_balances;

with buckets as (
    select
        case
            when due_on is null then 'sem vencimento'
            when due_on < public.business_today() - 365 then 'vencido > 12 meses'
            when due_on < public.business_today() - 180 then 'vencido 6-12 meses'
            when due_on < public.business_today() - 90 then 'vencido 3-6 meses'
            when due_on < public.business_today() - 30 then 'vencido 1-3 meses'
            when due_on < public.business_today() then 'vencido 0-30 dias'
            when due_on <= public.business_today() + 30 then 'a vencer 0-30 dias'
            else 'a vencer > 30 dias'
        end as bucket,
        case
            when due_on is null then 1
            when due_on < public.business_today() - 365 then 2
            when due_on < public.business_today() - 180 then 3
            when due_on < public.business_today() - 90 then 4
            when due_on < public.business_today() - 30 then 5
            when due_on < public.business_today() then 6
            when due_on <= public.business_today() + 30 then 7
            else 8
        end as sort_order,
        open_amount
    from public.v_sale_payment_balances
    where open_amount > 0
)
select
    bucket,
    count(*) as installments,
    sum(open_amount) as open_total
from buckets
group by bucket, sort_order
order by sort_order;

-- Installments with an amount but no due date never appear in the open total.
-- Decide case by case whether they are historical noise or a missing date.
select
    count(*) as installments_without_due_date,
    coalesce(sum(amount), 0) as amount
from public.sale_payments
where due_on is null
  and amount > 0;

-- ---------------------------------------------------------------------------
-- 5. Sales without a receivable schedule
-- A cash sale may legitimately have no installments. An installment sale with
-- no schedule is a reconciliation gap. Review the count and the latest rows.
-- ---------------------------------------------------------------------------
select
    count(*) as sales_without_installments,
    min(sold_on) as first_sale,
    max(sold_on) as last_sale,
    coalesce(sum(amount_received), 0) as amount
from public.sales s
where not exists (
    select 1
    from public.sale_payments sp
    where sp.sale_id = s.id
);

select
    s.id,
    s.sold_on,
    coalesce(c.name, nullif(btrim(s.client_name_raw), ''), 'Balcão') as client,
    s.product_name_raw,
    s.amount_received,
    s.payment_method_code
from public.sales s
left join public.clients c on c.id = s.client_id
where not exists (
    select 1
    from public.sale_payments sp
    where sp.sale_id = s.id
)
order by s.sold_on desc
limit 100;

-- ---------------------------------------------------------------------------
-- 6. Month completeness
-- For every month touched by sales, expenses, statements or receipt events,
-- show the data that feeds Resultado, Caixa and Fechamento. A month with zero
-- business expenses is incomplete, not a zero-cost profit.
-- ---------------------------------------------------------------------------
with months as (
    select date_trunc('month', sold_on)::date as month from public.sales
    union
    select date_trunc('month', incurred_on)::date from public.expenses
    union
    select month from public.herbalife_statements
    union
    select date_trunc('month', occurred_on)::date
    from public.sale_payment_events
),
sales_m as (
    select
        date_trunc('month', sold_on)::date as month,
        count(*) as sales_count,
        sum(profit) as sales_profit
    from public.sales
    group by 1
),
expenses_m as (
    select
        date_trunc('month', incurred_on)::date as month,
        count(*) filter (
            where scope in ('negocio_fixo', 'negocio_variavel')
        ) as business_count,
        sum(amount) filter (
            where scope in ('negocio_fixo', 'negocio_variavel')
        ) as business_total,
        count(*) filter (where scope = 'pessoal') as personal_count
    from public.expenses
    group by 1
),
receipts_m as (
    select
        date_trunc('month', occurred_on)::date as month,
        count(*) as receipt_count,
        sum(amount) as receipt_total
    from public.sale_payment_events
    where kind = 'receipt'
    group by 1
),
open_m as (
    select
        date_trunc('month', due_on)::date as month,
        count(*) as open_count,
        sum(open_amount) as open_total
    from public.v_sale_payment_balances
    where open_amount > 0
      and due_on is not null
    group by 1
),
statement_m as (
    select month, true as statement_present
    from public.herbalife_statements
)
select
    m.month,
    coalesce(s.sales_count, 0) as sales_count,
    coalesce(round(s.sales_profit, 2), 0) as sales_profit,
    coalesce(r.receipt_count, 0) as receipts_count,
    coalesce(round(r.receipt_total, 2), 0) as receipts_total,
    coalesce(e.business_count, 0) as business_expense_count,
    coalesce(round(e.business_total, 2), 0) as business_expense_total,
    coalesce(e.personal_count, 0) as personal_expense_count,
    coalesce(o.open_count, 0) as open_installments_now,
    coalesce(round(o.open_total, 2), 0) as open_total_now,
    coalesce(st.statement_present, false) as statement_present,
    coalesce(
        nullif(
            concat_ws(
                ' · ',
                case
                    when coalesce(e.business_count, 0) = 0
                        then 'sem despesas de negócio'
                end,
                case
                    when st.month is null
                        then 'sem extrato Herbalife'
                end
            ),
            ''
        ),
        'ok'
    ) as gaps
from months m
left join sales_m s on s.month = m.month
left join expenses_m e on e.month = m.month
left join receipts_m r on r.month = m.month
left join open_m o on o.month = m.month
left join statement_m st on st.month = m.month
where m.month <= date_trunc('month', public.business_today())::date
order by m.month desc;

-- ---------------------------------------------------------------------------
-- 7. Month-close state
-- Soft closes are not a lock. Review the notes and the latest snapshots before
-- treating a month as final.
-- ---------------------------------------------------------------------------
select
    count(*) filter (where status = 'closed') as closed_months,
    count(*) filter (where status = 'open') as reopened_months,
    count(*) as total_snapshots,
    max(month) filter (where status = 'closed') as latest_closed_month
from public.month_closings;

select
    mc.month,
    mc.status,
    mc.closed_at,
    closer.name as closed_by,
    mc.close_note,
    mc.reopened_at,
    reopener.name as reopened_by,
    mc.reopen_note
from public.month_closings mc
left join public.profiles closer on closer.id = mc.closed_by
left join public.profiles reopener on reopener.id = mc.reopened_by
order by mc.month desc;

-- ---------------------------------------------------------------------------
-- 8. Catalog gaps
-- Unmatched sale names and sold products without a current Ouro price are the
-- two gaps that most affect historical margin and stock value. The known
-- examples from the workbook are `bcu` and `#241K`.
-- The Phase 5 catalog migration (20261025000001) closes them; this section
-- verifies the result.
-- ---------------------------------------------------------------------------
select
    count(*) filter (where s.product_id is null) as sales_without_product,
    count(*) filter (where s.product_name_raw is null) as sales_without_readable_name,
    (select count(*) from public.products where not is_active) as inactive_products
from public.sales s;

select
    coalesce(nullif(btrim(s.product_name_raw), ''), '(sem nome)')
        as product_name_raw,
    count(*) as sales_count,
    min(s.sold_on) as first_sale,
    max(s.sold_on) as last_sale,
    coalesce(sum(s.amount_received), 0) as amount
from public.sales s
left join public.products p on p.id = s.product_id
where s.product_id is null
group by 1
order by sales_count desc, product_name_raw;

-- Suggested product for each unmatched name: same key as a product SKU or name,
-- or one key is a prefix of the other. This is a review list, not an update —
-- the mapping is applied on purpose.
with unmatched as (
    select
        regexp_replace(lower(btrim(s.product_name_raw)), '[^a-z0-9]+', '', 'g')
            as raw_key,
        count(*) as sales_count
    from public.sales s
    where s.product_id is null
      and nullif(btrim(s.product_name_raw), '') is not null
    group by 1
),
catalog as (
    select
        p.id,
        p.sku,
        p.name,
        regexp_replace(lower(btrim(p.sku)), '[^a-z0-9]+', '', 'g') as sku_key,
        regexp_replace(lower(btrim(p.name)), '[^a-z0-9]+', '', 'g') as name_key
    from public.products p
)
select
    u.raw_key,
    u.sales_count,
    m.product_id,
    m.sku,
    m.name,
    m.match_type
from unmatched u
left join lateral (
    select
        c.id as product_id,
        c.sku,
        c.name,
        case
            when c.sku_key = u.raw_key then 1
            when c.name_key = u.raw_key then 2
            when c.sku_key like u.raw_key || '%'
                or u.raw_key like c.sku_key || '%' then 3
            else 4
        end as match_rank,
        case
            when c.sku_key = u.raw_key then 'sku exato'
            when c.name_key = u.raw_key then 'nome exato'
            when c.sku_key like u.raw_key || '%'
                or u.raw_key like c.sku_key || '%' then 'prefixo do sku'
            else 'prefixo do nome'
        end as match_type
    from catalog c
    where c.sku_key = u.raw_key
       or c.name_key = u.raw_key
       or c.sku_key like u.raw_key || '%'
       or u.raw_key like c.sku_key || '%'
       or c.name_key like u.raw_key || '%'
       or u.raw_key like c.name_key || '%'
    order by match_rank, c.sku
    limit 1
) m on true
order by u.sales_count desc, u.raw_key;

select
    p.sku,
    p.name,
    p.kind,
    count(s.id) as sales_count
from public.products p
join public.sales s on s.product_id = p.id
where p.is_active
  and not exists (
      select 1
      from public.product_prices pp
      where pp.product_id = p.id
        and pp.tier_code = 'ouro'
        and pp.valid_from <= public.business_today()
        and (pp.valid_to is null or pp.valid_to >= public.business_today())
  )
group by p.id, p.sku, p.name, p.kind
order by sales_count desc, p.sku;

-- ---------------------------------------------------------------------------
-- 9. Expense and purchase quality
-- Missing accounts/categories are not always errors, but they should be a
-- deliberate decision before the data is used for cash reports.
-- ---------------------------------------------------------------------------
select
    count(*) filter (where account_id is null) as without_account,
    count(*) filter (where category_id is null) as without_category,
    count(*) filter (where scope is null) as without_scope,
    count(*) filter (where amount <= 0) as non_positive_amount
from public.expenses;

select
    count(*) filter (where account_id is null) as without_account,
    count(*) filter (where supplier_id is null) as without_supplier
from public.purchases;

-- ---------------------------------------------------------------------------
-- 10. Inventory
-- Negative balances are allowed only when they are a known import artifact.
-- Take a physical count on the cutover date so the app starts from reality.
-- ---------------------------------------------------------------------------
select
    p.sku,
    p.name,
    s.location,
    s.qty_on_hand
from public.v_stock_on_hand s
join public.products p on p.id = s.product_id
where s.qty_on_hand < 0
order by s.qty_on_hand asc, p.sku
limit 100;

select
    count(*) as stock_counts,
    max(counted_on) as last_count
from public.stock_counts;

select * from public.inventory_summary();

-- ---------------------------------------------------------------------------
-- 11. Profiles and roles
-- Every member needs a price tier; every auth user needs a profile. There must
-- be at least one admin.
-- ---------------------------------------------------------------------------
select
    role,
    count(*) as profiles,
    count(*) filter (where price_tier is not null) as with_price_tier
from public.profiles
group by role
order by role;

select p.id, p.name, u.email
from public.profiles p
left join auth.users u on u.id = p.id
where p.role = 'member'
  and p.price_tier is null;

select count(*) as auth_users_without_profile
from auth.users u
where not exists (
    select 1
    from public.profiles p
    where p.id = u.id
);

select count(*) as admin_profiles
from public.profiles
where role = 'admin';

-- ---------------------------------------------------------------------------
-- 12. Database size and largest tables
-- Record this before cutover so growth is measurable later.
-- ---------------------------------------------------------------------------
select pg_size_pretty(pg_database_size(current_database())) as database_size;

select
    relname,
    n_live_tup,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc
limit 15;

-- ---------------------------------------------------------------------------
-- 13. App parity spot checks
-- These are the same functions/views the screens call. Compare the figures with
-- Painel, Recebíveis, Caixa, Fechamento and Resultado.
-- ---------------------------------------------------------------------------
select * from public.open_receivables_summary();

select *
from public.cash_flow_summary(
    date_trunc('month', public.business_today())::date
);

select *
from public.month_close_summary(
    date_trunc('month', public.business_today())::date
);

select *
from public.monthly_pnl(
    date_trunc('month', public.business_today())::date
);

-- v_monthly_pnl is kept for reporting/backwards compatibility. It is not used by
-- the current Resultado screen, but the RLS suite checks it.
select *
from public.v_monthly_pnl
order by month desc
limit 6;

commit;
