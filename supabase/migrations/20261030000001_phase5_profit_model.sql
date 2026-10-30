-- ============================================================================
-- Phase 5 — profit model aligned with the owner's ledger
--
-- 1. Only client sales count in the monthly P&L (`ganho_vendas`). Consumo
--    próprio, negócio, brinde, empréstimo and troca lines move stock and carry
--    cost, but they are not revenue; the workbook's Consolidado excludes them
--    the same way (SUMIFS on column P = "C.*"). Keeping them in the P&L made
--    every month look like a loss.
-- 2. A cartela sale is a full-profit item: the amount the client paid for the
--    credits counts as profit, and the cost of the products is recognised on
--    each access line (payment TK/NTT, zero cash). The workbook used to park
--    the cartela value in `Custo Produto` (column J = column I) to zero the
--    line; that parking cost is removed so the sale keeps its value.
-- 3. Access lines paid with a ticket keep zero cash and their product cost, so
--    each access shows the loss the owner expects; the cartela sale that paid
--    for it already carries the matching profit.
--
-- `pv_total` still sums every sale, matching the Consolidado's "PV Total",
-- which includes personal consumption and investment.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cartela lines: no product cost on the sale itself.
-- ---------------------------------------------------------------------------

update public.sales s
set product_cost = 0
from public.products p
where p.id = s.product_id
  and p.item_class = 'E.AC'
  and coalesce(s.product_cost, 0) <> 0;

-- ---------------------------------------------------------------------------
-- Monthly P&L: profit from client sales only.
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
            coalesce(
                sum(s.profit) filter (
                    where dt.kind in ('sale', 'discount', 'financial')
                       or s.deal_type_code is null
                ),
                0
            ) as gain_sales,
            coalesce(sum(s.pv), 0) as pv_total
        from public.sales s
        left join public.deal_types dt on dt.code = s.deal_type_code
        cross join bounds b
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
    'Monthly P&L for one month. Sales profit counts client sales only; personal consumption, business transfers, gifts, loans and returns are stock movements, not revenue. Statement USD amounts are converted with their FX rate.';

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
        date_trunc('month', s.sold_on)::date as month,
        sum(s.profit) filter (
            where dt.kind in ('sale', 'discount', 'financial')
               or s.deal_type_code is null
        ) as gain_sales,
        sum(s.pv) as pv_total
    from public.sales s
    left join public.deal_types dt on dt.code = s.deal_type_code
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
    'Monthly P&L for every month touched by sales, expenses or a Herbalife statement. Sales profit counts client sales only.';

grant select on public.v_monthly_pnl to authenticated;

notify pgrst, 'reload schema';
