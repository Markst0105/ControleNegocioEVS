-- ============================================================================
-- BioAvalia — Row Level Security
-- Roles: admin / operator / member (stored in profiles.role)
-- ============================================================================

alter table profiles enable row level security;
alter table payment_methods enable row level security;
alter table deal_types enable row level security;
alter table item_classes enable row level security;
alter table expense_categories enable row level security;
alter table accounts enable row level security;
alter table locations enable row level security;
alter table counterparties enable row level security;
alter table products enable row level security;
alter table product_prices enable row level security;
alter table product_components enable row level security;
alter table clients enable row level security;
alter table client_aliases enable row level security;
alter table sales enable row level security;
alter table sale_payments enable row level security;
alter table reservations enable row level security;
alter table reservation_items enable row level security;
alter table expenses enable row level security;
alter table inventory_movements enable row level security;
alter table stock_counts enable row level security;
alter table daily_kpis enable row level security;
alter table herbalife_statements enable row level security;
alter table audit_log enable row level security;

-- helper: current user's role
create or replace function current_user_role()
returns text
language plpgsql
stable
as $$
declare
    v_role text;
begin
    select role into v_role
    from profiles
    where id = auth.uid();
    return coalesce(v_role,'member');
end;
$$;

-- ---------- admin: everything ----------
create policy admin_all on profiles
    for all using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

do $$
declare t text;
begin
    for t in (
        select tablename from pg_tables where schemaname='public'
          and tablename <> 'profiles'
    ) loop
        execute format($f$
            create policy admin_all_%I on public.%I
            for all using (current_user_role() = 'admin')
            with check (current_user_role() = 'admin')
        $f$, t, t);
    end loop;
end $$;

-- ---------- operator ----------
-- catalog: read
create policy operator_catalog_read on products for select using (current_user_role() = 'operator');
create policy operator_catalog_read on product_prices for select using (current_user_role() = 'operator');
create policy operator_catalog_read on product_components for select using (current_user_role() = 'operator');
create policy operator_catalog_read on payment_methods for select using (current_user_role() = 'operator');
create policy operator_catalog_read on deal_types for select using (current_user_role() = 'operator');
create policy operator_catalog_read on item_classes for select using (current_user_role() = 'operator');
create policy operator_catalog_read on expense_categories for select using (current_user_role() = 'operator');
create policy operator_catalog_read on accounts for select using (current_user_role() = 'operator');
create policy operator_catalog_read on locations for select using (current_user_role() = 'operator');
create policy operator_catalog_read on counterparties for select using (current_user_role() = 'operator');

-- clients: full
create policy operator_clients_all on clients for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

-- sales: full (floor staff enters everything)
create policy operator_sales_all on sales for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');
create policy operator_sale_payments_all on sale_payments for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

-- inventory + MDO: full
create policy operator_inventory_all on inventory_movements for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');
create policy operator_stock_counts_all on stock_counts for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');
create policy operator_daily_kpis_all on daily_kpis for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

-- reservations: full (operator converts member reservations)
create policy operator_reservations_all on reservations for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');
create policy operator_reservation_items_all on reservation_items for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

-- NO operator access to: expenses (scope-based below), herbalife_statements, audit_log, profiles (own only)

-- expenses: operator sees only negocio scope; never pessoal
create policy operator_expenses_negocio on expenses
    for select using (current_user_role() = 'operator' and scope in ('negocio_fixo','negocio_variavel'));

-- ---------- member ----------
-- own profile read/update
create policy member_own_profile on profiles
    for select using (id = auth.uid());
create policy member_update_own_profile on profiles
    for update using (id = auth.uid())
    with check (id = auth.uid());

-- catalog: read via view is enforced at the view level; base tables restricted
create policy member_products_read on products for select using (current_user_role() = 'member' and is_active = true);
create policy member_prices_read on product_prices for select using (current_user_role() = 'member');
create policy member_components_read on product_components for select using (current_user_role() = 'member');

-- clients: read names only (needed for reservations)
create policy member_clients_read on clients for select using (current_user_role() = 'member');

-- reservations: member creates own, reads own
create policy member_reservations_own on reservations
    for all using (member_id = auth.uid() and current_user_role() = 'member')
    with check (member_id = auth.uid() and current_user_role() = 'member');
create policy member_reservation_items_own on reservation_items
    for all using (
        exists (select 1 from reservations r where r.id = reservation_items.reservation_id and r.member_id = auth.uid())
        and current_user_role() = 'member'
    )
    with check (
        exists (select 1 from reservations r where r.id = reservation_items.reservation_id and r.member_id = auth.uid())
        and current_user_role() = 'member'
    );

-- sales: member sees only sales they created (rare) — mainly informational
create policy member_own_sales on sales
    for select using (created_by = auth.uid() and current_user_role() = 'member');

-- member: no access to expenses / payments / inventory / statements / audit

-- ==== Member-facing catalog view (no cost/margin columns) ====================

create view v_catalog_member as
select
    p.id,
    p.sku,
    p.name,
    p.kind,
    p.portions_per_pack,
    p.portion_label,
    pp.price as retail_price,
    p.pv,
    p.is_active,
    p.print_name
from products p
join product_prices pp on pp.product_id = p.id
     and pp.tier_code = 'retail'
     and pp.valid_from = (
         select max(valid_from) from product_prices pp2
         where pp2.product_id = p.id and pp2.tier_code = 'retail'
     )
where p.is_active = true;

alter view v_catalog_member owner to postgres;
grant select on v_catalog_member to authenticated;

-- ==== Derived views (security_invoker so RLS applies through them) ============

create or replace view v_stock_on_hand
security_invoker = true
as
select
    p.id as product_id,
    p.sku,
    p.name,
    im.location_to as location,
    coalesce(sum(im.qty),0) as qty_on_hand
from products p
left join inventory_movements im on im.product_id = p.id
group by p.id, p.sku, p.name, im.location_to;

create or replace view v_receivables_schedule
security_invoker = true
as
select
    sp.due_on,
    sum(sp.amount) as amount_due,
    count(*) as installments
from sale_payments sp
join sales s on s.id = sp.sale_id
where sp.received_on is null
group by sp.due_on
order by sp.due_on;

create or replace view v_monthly_sales_by_deal_type
security_invoker = true
as
select
    date_trunc('month', s.sold_on)::date as month,
    s.deal_type_code,
    dt.label as deal_label,
    count(*) as lines,
    sum(s.amount_received) as revenue,
    sum(s.product_cost) as product_cost,
    sum(s.financial_cost) as financial_cost,
    sum(s.profit) as profit,
    sum(s.pv) as pv
from sales s
left join deal_types dt on dt.code = s.deal_type_code
group by 1,2,3
order by 1 desc, 2;

create or replace view v_monthly_expenses_by_category
security_invoker = true
as
select
    date_trunc('month', e.incurred_on)::date as month,
    ec.name as category,
    ec.scope,
    sum(e.amount) as amount
from expenses e
left join expense_categories ec on ec.id = e.category_id
group by 1,2,3
order by 1 desc, 2;

create or replace view v_monthly_kpis
security_invoker = true
as
select
    date_trunc('month', d.kpi_date)::date as month,
    sum(d.contatos) as contatos,
    sum(d.cliente_novo) as clientes_novos,
    sum(d.cliente_repetidor) as clientes_repetidores,
    sum(d.acesso_total) as acessos,
    sum(d.cartelas) as cartelas,
    sum(d.cortesias) as cortesias,
    sum(d.consumo_proprio) as consumo_proprio,
    sum(d.novos_supervisores) as novos_supervisores
from daily_kpis d
group by 1
order by 1 desc;

create or replace view v_monthly_pnl
security_invoker = true
as
with sales_m as (
    select date_trunc('month', sold_on)::date as month,
           sum(profit) as gain_sales,
           sum(pv) as pv_total
    from sales group by 1
),
exp_m as (
    select date_trunc('month', incurred_on)::date as month,
           sum(amount) filter (where scope='negocio_fixo') as custos_fixos,
           sum(amount) filter (where scope='negocio_variavel') as custos_variaveis,
           sum(amount) filter (where scope='pessoal') as despesas_pessoais
    from expenses group by 1
),
stmt as (
    select month,
           royalty_usd, bonus_usd
    from herbalife_statements
)
select
    coalesce(s.month, e.month, st.month) as month,
    coalesce(s.gain_sales,0) as ganho_vendas,
    coalesce(st.royalty_usd,0) as royalties,
    coalesce(st.bonus_usd,0) as bonus,
    (coalesce(s.gain_sales,0) + coalesce(st.royalty_usd,0) + coalesce(st.bonus_usd,0)) as ganho_bruto,
    coalesce(e.custos_fixos,0) as custos_fixos,
    coalesce(e.custos_variaveis,0) as investimentos_promocoes,
    (coalesce(s.gain_sales,0) + coalesce(st.royalty_usd,0) + coalesce(st.bonus_usd,0)
     - coalesce(e.custos_fixos,0) - coalesce(e.custos_variaveis,0)) as ganho_liquido,
    coalesce(e.despesas_pessoais,0) as despesas_pessoais,
    s.pv_total
from sales_m s
full outer join exp_m e on e.month = s.month
full outer join stmt st on st.month = coalesce(s.month, e.month)
order by 1 desc;

grant select on v_stock_on_hand, v_receivables_schedule, v_monthly_sales_by_deal_type,
             v_monthly_expenses_by_category, v_monthly_kpis, v_monthly_pnl
to authenticated;
