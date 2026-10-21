-- ============================================================================
-- Phase 5 — make v_monthly_pnl plannable
--
-- The Phase 2c view used a FULL JOIN whose ON clause referenced a COALESCE
-- across both sides. Some PostgreSQL planners (and PGlite) reject that shape
-- with "FULL JOIN is only supported with merge-joinable or hash-joinable join
-- conditions". Resultado and Painel call monthly_pnl(), not this view, but the
-- reporting view and the RLS suite must still work.
--
-- This rewrite is equivalent: build the union of months first, then LEFT JOIN
-- the three sources. It also keeps Security Invoker so RLS still hides personal
-- expenses and royalties from operators/members.
-- ============================================================================

create or replace view public.v_monthly_pnl
with (security_invoker = true)
as
with months as (
    select date_trunc('month', sold_on)::date as month
    from public.sales
    union
    select date_trunc('month', incurred_on)::date
    from public.expenses
    union
    select month
    from public.herbalife_statements
),
sales_m as (
    select
        date_trunc('month', sold_on)::date as month,
        sum(profit) as gain_sales,
        sum(pv) as pv_total
    from public.sales
    group by 1
),
exp_m as (
    select
        date_trunc('month', incurred_on)::date as month,
        sum(amount) filter (where scope = 'negocio_fixo') as custos_fixos,
        sum(amount) filter (where scope = 'negocio_variavel') as custos_variaveis,
        sum(amount) filter (where scope = 'pessoal') as despesas_pessoais
    from public.expenses
    group by 1
),
stmt as (
    select
        month,
        royalty_usd * coalesce(royalty_fx, 1) as royalty_brl,
        bonus_usd * coalesce(bonus_fx, 1) as bonus_brl
    from public.herbalife_statements
)
select
    m.month,
    coalesce(s.gain_sales, 0) as ganho_vendas,
    coalesce(st.royalty_brl, 0) as royalties,
    coalesce(st.bonus_brl, 0) as bonus,
    (
        coalesce(s.gain_sales, 0)
        + coalesce(st.royalty_brl, 0)
        + coalesce(st.bonus_brl, 0)
    ) as ganho_bruto,
    coalesce(e.custos_fixos, 0) as custos_fixos,
    coalesce(e.custos_variaveis, 0) as investimentos_promocoes,
    (
        coalesce(s.gain_sales, 0)
        + coalesce(st.royalty_brl, 0)
        + coalesce(st.bonus_brl, 0)
        - coalesce(e.custos_fixos, 0)
        - coalesce(e.custos_variaveis, 0)
    ) as ganho_liquido,
    coalesce(e.despesas_pessoais, 0) as despesas_pessoais,
    s.pv_total
from months m
left join sales_m s on s.month = m.month
left join exp_m e on e.month = m.month
left join stmt st on st.month = m.month
order by m.month desc;

comment on view public.v_monthly_pnl is
    'Monthly P&L for every month touched by sales, expenses or a Herbalife statement.';

grant select on public.v_monthly_pnl to authenticated;

notify pgrst, 'reload schema';
