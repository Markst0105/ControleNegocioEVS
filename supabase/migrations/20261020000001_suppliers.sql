-- ---------------------------------------------------------------------------
-- Suppliers directory.
--
-- `counterparties` already stores suppliers (and other external contacts).
-- This migration makes the directory manageable by the business roles and
-- seeds the distributors that supplied the workbook's purchase columns.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.counterparties to authenticated;

comment on column public.counterparties.role_hint is
    'supplier / distributor / other (UI labels: Fornecedor / Distribuidora / Outro)';

-- Operators register purchases on the floor, so they can also maintain the
-- supplier list. Admin access is already covered by `admin_all`. There is no
-- delete policy: purchases reference suppliers, so suppliers are deactivated.
drop policy if exists operator_counterparties_insert on public.counterparties;
create policy operator_counterparties_insert on public.counterparties
    for insert
    with check (current_user_role() = 'operator');

drop policy if exists operator_counterparties_update on public.counterparties;
create policy operator_counterparties_update on public.counterparties
    for update
    using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

-- Distributors with explicit "Compra ..." columns in the legacy stock sheet,
-- plus the Herbalife account itself. Existing rows keep their role hint.
insert into public.counterparties (name, role_hint) values
    ('Herbalife', 'supplier'),
    ('Amanda',    'distributor'),
    ('Paula',     'distributor'),
    ('Sá',        'distributor'),
    ('Geicy',     'distributor'),
    ('Shoudi',    'distributor'),
    ('Yumi',      'distributor')
on conflict (name) do update
    set role_hint = coalesce(counterparties.role_hint, excluded.role_hint);

-- Supplier list/detail aggregates. Security invoker keeps the caller's RLS in
-- force; PostgREST aggregate selectors are disabled, so the sums live here.
drop view if exists public.v_supplier_overview;

create view public.v_supplier_overview
with (security_invoker = true)
as
select
    c.id,
    c.name,
    c.role_hint,
    c.active,
    c.created_at,
    count(distinct p.id)::bigint as purchase_count,
    coalesce(sum(pi.qty * pi.unit_cost), 0)::numeric as total_cost,
    max(p.purchased_on) as last_purchase_on
from public.counterparties c
left join public.purchases p on p.supplier_id = c.id
left join public.purchase_items pi on pi.purchase_id = p.id
group by c.id, c.name, c.role_hint, c.active, c.created_at;

comment on view public.v_supplier_overview is
    'Supplier with purchase count, total cost and last purchase date.';

grant select on public.v_supplier_overview to authenticated;

notify pgrst, 'reload schema';
