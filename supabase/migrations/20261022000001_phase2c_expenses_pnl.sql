-- ============================================================================
-- Phase 2c — expenses and P&L
--
-- Operators keep the floor running and may record business expenses, but never
-- personal expenses. P&L converts Herbalife statement USD amounts with the
-- statement FX rate instead of treating the USD figure as BRL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Expense indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_expenses_date_scope
    on public.expenses (incurred_on, scope);

-- ---------------------------------------------------------------------------
-- Operator expense writes: business scopes only.
-- The existing operator_expenses_negocio policy covers reads.
-- ---------------------------------------------------------------------------

drop policy if exists operator_expenses_insert on public.expenses;
create policy operator_expenses_insert on public.expenses
    for insert
    with check (
        current_user_role() = 'operator'
        and scope in ('negocio_fixo','negocio_variavel')
    );

drop policy if exists operator_expenses_update on public.expenses;
create policy operator_expenses_update on public.expenses
    for update
    using (
        current_user_role() = 'operator'
        and scope in ('negocio_fixo','negocio_variavel')
    )
    with check (
        current_user_role() = 'operator'
        and scope in ('negocio_fixo','negocio_variavel')
    );

drop policy if exists operator_expenses_delete on public.expenses;
create policy operator_expenses_delete on public.expenses
    for delete
    using (
        current_user_role() = 'operator'
        and scope in ('negocio_fixo','negocio_variavel')
    );

-- ---------------------------------------------------------------------------
-- Monthly P&L: apply the statement FX rate to USD amounts.
-- A missing FX rate falls back to 1 so old rows without FX stay readable.
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
            coalesce(max(h.royalty_usd * coalesce(h.royalty_fx, 1)), 0) as royalties_brl,
            coalesce(max(h.bonus_usd * coalesce(h.bonus_fx, 1)), 0) as bonus_brl
        from public.herbalife_statements h, bounds b
        where h.month = b.month_start
    )
    select
        b.month_start,
        s.gain_sales,
        st.royalties_brl,
        st.bonus_brl,
        s.gain_sales + st.royalties_brl + st.bonus_brl,
        e.custos_fixos,
        e.custos_variaveis,
        s.gain_sales + st.royalties_brl + st.bonus_brl
            - e.custos_fixos - e.custos_variaveis,
        e.despesas_pessoais,
        s.pv_total
    from bounds b
    cross join sales_m s
    cross join exp_m e
    cross join stmt st;
$$;

comment on function public.monthly_pnl(date) is
    'Monthly P&L for one month. Statement USD amounts are converted with their FX rate.';

create or replace view public.v_monthly_pnl
with (security_invoker = true)
as
with sales_m as (
    select date_trunc('month', sold_on)::date as month,
           sum(profit) as gain_sales,
           sum(pv) as pv_total
    from public.sales group by 1
),
exp_m as (
    select date_trunc('month', incurred_on)::date as month,
           sum(amount) filter (where scope = 'negocio_fixo') as custos_fixos,
           sum(amount) filter (where scope = 'negocio_variavel') as custos_variaveis,
           sum(amount) filter (where scope = 'pessoal') as despesas_pessoais
    from public.expenses group by 1
),
stmt as (
    select month,
           royalty_usd * coalesce(royalty_fx, 1) as royalty_brl,
           bonus_usd * coalesce(bonus_fx, 1) as bonus_brl
    from public.herbalife_statements
)
select
    coalesce(s.month, e.month, st.month) as month,
    coalesce(s.gain_sales, 0) as ganho_vendas,
    coalesce(st.royalty_brl, 0) as royalties,
    coalesce(st.bonus_brl, 0) as bonus,
    (coalesce(s.gain_sales, 0) + coalesce(st.royalty_brl, 0) + coalesce(st.bonus_brl, 0)) as ganho_bruto,
    coalesce(e.custos_fixos, 0) as custos_fixos,
    coalesce(e.custos_variaveis, 0) as investimentos_promocoes,
    (coalesce(s.gain_sales, 0) + coalesce(st.royalty_brl, 0) + coalesce(st.bonus_brl, 0)
     - coalesce(e.custos_fixos, 0) - coalesce(e.custos_variaveis, 0)) as ganho_liquido,
    coalesce(e.despesas_pessoais, 0) as despesas_pessoais,
    s.pv_total
from sales_m s
full outer join exp_m e on e.month = s.month
full outer join stmt st on st.month = coalesce(s.month, e.month, st.month)
order by 1 desc;
