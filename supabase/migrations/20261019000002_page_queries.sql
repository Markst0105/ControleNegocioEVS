-- Page-scoped query helpers for the performance-sensitive routes.
--
-- These replace full-history aggregates with query shapes that can use the
-- existing indexes:
--   /clientes  -> aggregate only the 25 clients on the current page
--   /painel    -> aggregate only the selected month / open installments
--
-- They keep SECURITY INVOKER so RLS applies to the caller.

-- ---------------------------------------------------------------------------
-- Client list/detail aggregates for a bounded set of client IDs.
-- ---------------------------------------------------------------------------

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

comment on function public.client_overview_for_ids(uuid[]) is
    'Sales totals and open receivables for the supplied client IDs only.';

revoke all on function public.client_overview_for_ids(uuid[]) from public;
grant execute on function public.client_overview_for_ids(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Monthly P&L for exactly one month.
-- ---------------------------------------------------------------------------

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

comment on function public.monthly_pnl(date) is
    'Monthly P&L for one month, aggregating only that month.';

revoke all on function public.monthly_pnl(date) from public;
grant execute on function public.monthly_pnl(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Open receivables total without grouping the schedule by due date.
-- Preserves the current semantics: gross amount where received_on is null
-- and due_on is present.
-- ---------------------------------------------------------------------------

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

comment on function public.open_receivables_total() is
    'Sum of open installments that have a due date.';

revoke all on function public.open_receivables_total() from public;
grant execute on function public.open_receivables_total() to authenticated;

notify pgrst, 'reload schema';
