-- ---------------------------------------------------------------------------
-- Inventory & purchases.
--
-- Legacy inventory_movements are signed quantities with location_to set. New
-- rows use the explicit location_from/location_to pair:
--   * purchase: location_to only, positive qty
--   * sale / loan_out: location_from only, positive qty
--   * return / loan_in: location_to only, positive qty
--   * transfer: both locations, positive qty
--   * adjustment / count: one side, positive qty
--
-- The stock view below supports both conventions so the imported ledger stays
-- readable while new movements are unambiguous.
-- ---------------------------------------------------------------------------

create table if not exists purchases (
    id            uuid primary key default gen_random_uuid(),
    purchased_on  date not null,
    supplier_id   uuid references counterparties(id) on delete set null,
    account_id    uuid references accounts(id) on delete set null,
    location_code text not null references locations(code),
    invoice_no    text,
    notes         text,
    created_at    timestamptz default now(),
    updated_at    timestamptz default now(),
    created_by    uuid references auth.users(id)
);

create index if not exists idx_purchases_date on purchases (purchased_on desc);
create index if not exists idx_purchases_supplier on purchases (supplier_id);

create table if not exists purchase_items (
    id          uuid primary key default gen_random_uuid(),
    purchase_id uuid not null references purchases(id) on delete cascade,
    product_id  uuid not null references products(id) on delete restrict,
    qty         numeric(10,4) not null check (qty > 0),
    unit_cost   numeric(12,2) not null default 0 check (unit_cost >= 0),
    created_at  timestamptz default now()
);

create index if not exists idx_purchase_items_purchase on purchase_items (purchase_id);
create index if not exists idx_purchase_items_product on purchase_items (product_id);

alter table inventory_movements add column if not exists purchase_id uuid;
alter table inventory_movements add column if not exists notes text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'inventory_movements_purchase_id_fkey'
    ) then
        alter table inventory_movements
            add constraint inventory_movements_purchase_id_fkey
            foreign key (purchase_id) references purchases(id) on delete cascade;
    end if;
end $$;

-- A sale movement belongs to its sale. Deleting the sale (e.g. the rollback in
-- createSale when installments fail) must also remove its stock row.
do $$
begin
    if exists (
        select 1 from pg_constraint
        where conname = 'inventory_movements_sale_id_fkey'
    ) then
        alter table inventory_movements
            drop constraint inventory_movements_sale_id_fkey;
    end if;
    alter table inventory_movements
        add constraint inventory_movements_sale_id_fkey
        foreign key (sale_id) references sales(id) on delete cascade;
end $$;

create index if not exists idx_inventory_purchase on inventory_movements (purchase_id);

alter table stock_counts add column if not exists notes text;

create table if not exists stock_count_items (
    id             uuid primary key default gen_random_uuid(),
    stock_count_id uuid not null references stock_counts(id) on delete cascade,
    product_id     uuid not null references products(id) on delete restrict,
    expected_qty   numeric(10,4) not null default 0,
    counted_qty    numeric(10,4) not null default 0 check (counted_qty >= 0),
    created_at     timestamptz default now(),
    unique (stock_count_id, product_id)
);

create index if not exists idx_stock_count_items_count on stock_count_items (stock_count_id);
create index if not exists idx_stock_count_items_product on stock_count_items (product_id);

drop trigger if exists trg_purchases_updated_at on purchases;
create trigger trg_purchases_updated_at
before update on purchases
for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: new tables are reachable by admin/operator only.
-- ---------------------------------------------------------------------------

alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table stock_count_items enable row level security;

drop policy if exists admin_all on purchases;
create policy admin_all on purchases
    for all using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

drop policy if exists operator_purchases_all on purchases;
create policy operator_purchases_all on purchases
    for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

drop policy if exists admin_all on purchase_items;
create policy admin_all on purchase_items
    for all using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

drop policy if exists operator_purchase_items_all on purchase_items;
create policy operator_purchase_items_all on purchase_items
    for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

drop policy if exists admin_all on stock_count_items;
create policy admin_all on stock_count_items
    for all using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

drop policy if exists operator_stock_count_items_all on stock_count_items;
create policy operator_stock_count_items_all on stock_count_items
    for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

grant select, insert, update, delete on purchases, purchase_items, stock_count_items
    to authenticated;
grant select, insert, update, delete on stock_counts to authenticated;
revoke all on purchases, purchase_items, stock_count_items from anon;

-- ---------------------------------------------------------------------------
-- Stock views.
-- ---------------------------------------------------------------------------

drop view if exists v_stock_product_totals;
drop view if exists v_stock_on_hand;

create view v_stock_on_hand
with (security_invoker = true)
as
with flows as (
    select im.product_id, im.location_to as location, im.qty as qty
    from inventory_movements im
    where im.location_to is not null
    union all
    select im.product_id, im.location_from as location, -im.qty as qty
    from inventory_movements im
    where im.location_from is not null
)
select
    p.id as product_id,
    p.sku,
    p.name,
    f.location,
    sum(f.qty)::numeric as qty_on_hand
from products p
join flows f on f.product_id = p.id
group by p.id, p.sku, p.name, f.location;

comment on view v_stock_on_hand is
    'Signed stock by product/location. Legacy rows use location_to and signed qty; new rows use location_from/location_to and positive qty.';

grant select on v_stock_on_hand to authenticated;

drop view if exists v_stock_product_totals;

create view v_stock_product_totals
with (security_invoker = true)
as
select
    p.id as product_id,
    p.sku,
    p.name,
    p.kind,
    p.is_active,
    coalesce(sum(s.qty_on_hand), 0)::numeric as qty_on_hand,
    latest.unit_cost,
    case
        when latest.unit_cost is not null and coalesce(sum(s.qty_on_hand), 0) > 0
            then coalesce(sum(s.qty_on_hand), 0) * latest.unit_cost
        else 0
    end::numeric as stock_value
from products p
left join v_stock_on_hand s on s.product_id = p.id
left join lateral (
    select pi.unit_cost
    from purchase_items pi
    join purchases pu on pu.id = pi.purchase_id
    where pi.product_id = p.id
    order by pu.purchased_on desc, pi.created_at desc
    limit 1
) latest on true
group by p.id, p.sku, p.name, p.kind, p.is_active, latest.unit_cost;

comment on view v_stock_product_totals is
    'One row per product with total on-hand quantity and the most recent purchase unit cost.';

grant select on v_stock_product_totals to authenticated;

drop view if exists v_purchase_overview;

create view v_purchase_overview
with (security_invoker = true)
as
select
    pu.id,
    pu.purchased_on,
    pu.supplier_id,
    pu.account_id,
    pu.location_code,
    pu.invoice_no,
    pu.notes,
    pu.created_at,
    c.name as supplier_name,
    a.name as account_name,
    count(pi.id)::bigint as item_count,
    coalesce(sum(pi.qty), 0)::numeric as total_units,
    coalesce(sum(pi.qty * pi.unit_cost), 0)::numeric as total_cost
from purchases pu
left join counterparties c on c.id = pu.supplier_id
left join accounts a on a.id = pu.account_id
left join purchase_items pi on pi.purchase_id = pu.id
group by
    pu.id, pu.purchased_on, pu.supplier_id, pu.account_id, pu.location_code,
    pu.invoice_no, pu.notes, pu.created_at, c.name, a.name;

comment on view v_purchase_overview is
    'Purchase header with supplier/account names, item count and total cost.';

grant select on v_purchase_overview to authenticated;

drop view if exists v_stock_count_overview;

create view v_stock_count_overview
with (security_invoker = true)
as
select
    sc.id,
    sc.location,
    sc.counted_on,
    sc.notes,
    sc.created_at,
    count(sci.id)::bigint as item_count,
    coalesce(sum(abs(sci.counted_qty - sci.expected_qty)), 0)::numeric as total_adjustment
from stock_counts sc
left join stock_count_items sci on sci.stock_count_id = sc.id
group by sc.id, sc.location, sc.counted_on, sc.notes, sc.created_at;

comment on view v_stock_count_overview is
    'Stock count header with the number of counted products and absolute adjustment quantity.';

grant select on v_stock_count_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Bounded helpers used by the inventory pages.
-- ---------------------------------------------------------------------------

create or replace function public.stock_for_products(p_ids uuid[])
returns table (
    product_id uuid,
    location text,
    qty_on_hand numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    select s.product_id, s.location, s.qty_on_hand
    from public.v_stock_on_hand s
    where s.product_id = any(p_ids)
    order by s.product_id, s.location;
$$;

comment on function public.stock_for_products(uuid[]) is
    'Stock by location for the supplied product IDs only.';

revoke all on function public.stock_for_products(uuid[]) from public;
grant execute on function public.stock_for_products(uuid[]) to authenticated;

create or replace function public.inventory_summary(p_search text default null)
returns table (
    total_products bigint,
    total_units numeric,
    low_stock bigint,
    out_of_stock bigint,
    stock_value numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with filtered as (
        select *
        from public.v_stock_product_totals p
        where coalesce(p_search, '') = ''
           or p.name ilike '%' || p_search || '%'
           or p.sku ilike '%' || p_search || '%'
    )
    select
        count(*)::bigint,
        coalesce(sum(qty_on_hand), 0)::numeric,
        count(*) filter (where qty_on_hand > 0 and qty_on_hand <= 3)::bigint,
        count(*) filter (where qty_on_hand <= 0)::bigint,
        coalesce(sum(stock_value), 0)::numeric
    from filtered;
$$;

comment on function public.inventory_summary(text) is
    'Inventory KPIs for the current search. Low stock means 1–3 units; out of stock means 0 or less.';

revoke all on function public.inventory_summary(text) from public;
grant execute on function public.inventory_summary(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Purchase entry (header + lines + stock movements) in one transaction.
-- ---------------------------------------------------------------------------

create or replace function public.create_purchase(
    p_purchased_on date,
    p_supplier_id uuid,
    p_account_id uuid,
    p_location_code text,
    p_invoice_no text,
    p_notes text,
    p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_purchase_id uuid;
    v_location text;
    v_invoice text;
    v_notes text;
    v_item jsonb;
    v_product_id uuid;
    v_qty numeric;
    v_unit_cost numeric;
    v_count int := 0;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para registrar compras.'
            using errcode = '42501';
    end if;

    if p_purchased_on is null then
        raise exception 'Informe a data da compra.' using errcode = '22023';
    end if;

    select code into v_location
    from public.locations
    where code = p_location_code and active = true;

    if v_location is null then
        raise exception 'Local de destino inválido.' using errcode = '22023';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'Adicione pelo menos um produto à compra.' using errcode = '22023';
    end if;

    v_invoice := nullif(trim(coalesce(p_invoice_no, '')), '');
    v_notes := nullif(trim(coalesce(p_notes, '')), '');

    insert into public.purchases (
        purchased_on, supplier_id, account_id, location_code,
        invoice_no, notes, created_by
    ) values (
        p_purchased_on, p_supplier_id, p_account_id, v_location,
        v_invoice, v_notes, auth.uid()
    )
    returning id into v_purchase_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
        v_qty := nullif(trim(v_item ->> 'qty'), '')::numeric;
        v_unit_cost := coalesce(nullif(trim(v_item ->> 'unit_cost'), '')::numeric, 0);

        if v_product_id is null
           or not exists (select 1 from public.products where id = v_product_id) then
            raise exception 'Produto inválido na compra.' using errcode = '22023';
        end if;

        if v_qty is null or v_qty <= 0 then
            raise exception 'Informe uma quantidade maior que zero.' using errcode = '22023';
        end if;

        if v_unit_cost < 0 then
            raise exception 'O custo unitário não pode ser negativo.' using errcode = '22023';
        end if;

        insert into public.purchase_items (purchase_id, product_id, qty, unit_cost)
        values (v_purchase_id, v_product_id, v_qty, v_unit_cost);

        insert into public.inventory_movements (
            product_id, moved_on, type, location_to, qty, event_label,
            purchase_id, notes, created_by
        ) values (
            v_product_id, p_purchased_on, 'purchase', v_location, v_qty,
            coalesce(v_invoice, 'Compra'), v_purchase_id, v_notes, auth.uid()
        );

        v_count := v_count + 1;
    end loop;

    if v_count = 0 then
        raise exception 'Adicione pelo menos um produto à compra.' using errcode = '22023';
    end if;

    return v_purchase_id;
end;
$$;

comment on function public.create_purchase(date, uuid, uuid, text, text, text, jsonb) is
    'Creates a purchase, its lines and one purchase movement per line atomically.';

revoke all on function public.create_purchase(date, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.create_purchase(date, uuid, uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual movements: transfer, adjustment, loan and return.
-- ---------------------------------------------------------------------------

create or replace function public.record_inventory_movement(
    p_type text,
    p_product_id uuid,
    p_moved_on date,
    p_location_from text,
    p_location_to text,
    p_qty numeric,
    p_counterparty_id uuid,
    p_notes text,
    p_event_label text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_notes text;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para movimentar o estoque.'
            using errcode = '42501';
    end if;

    if p_type not in ('transfer', 'adjustment', 'loan_out', 'loan_in', 'return') then
        raise exception 'Tipo de movimentação inválido.' using errcode = '22023';
    end if;

    if p_product_id is null
       or not exists (select 1 from public.products where id = p_product_id) then
        raise exception 'Produto inválido.' using errcode = '22023';
    end if;

    if p_moved_on is null then
        raise exception 'Informe a data da movimentação.' using errcode = '22023';
    end if;

    if p_qty is null or p_qty <= 0 then
        raise exception 'Informe uma quantidade maior que zero.' using errcode = '22023';
    end if;

    if p_type = 'transfer' then
        if p_location_from is null or p_location_to is null
           or p_location_from = p_location_to then
            raise exception 'Escolha locais de origem e destino diferentes.' using errcode = '22023';
        end if;
    elsif p_type = 'adjustment' then
        if (p_location_from is null) = (p_location_to is null) then
            raise exception 'Escolha se o ajuste entra ou sai do estoque.' using errcode = '22023';
        end if;
    elsif p_type = 'loan_out' then
        if p_location_from is null then
            raise exception 'Informe o local de saída.' using errcode = '22023';
        end if;
        p_location_to := null;
    elsif p_type in ('loan_in', 'return') then
        if p_location_to is null then
            raise exception 'Informe o local de entrada.' using errcode = '22023';
        end if;
        p_location_from := null;
    end if;

    if p_location_from is not null
       and not exists (select 1 from public.locations where code = p_location_from and active = true) then
        raise exception 'Local de origem inválido.' using errcode = '22023';
    end if;

    if p_location_to is not null
       and not exists (select 1 from public.locations where code = p_location_to and active = true) then
        raise exception 'Local de destino inválido.' using errcode = '22023';
    end if;

    v_notes := nullif(trim(coalesce(p_notes, '')), '');

    insert into public.inventory_movements (
        product_id, moved_on, type, location_from, location_to, qty,
        counterparty_id, event_label, notes, created_by
    ) values (
        p_product_id, p_moved_on, p_type, p_location_from, p_location_to, p_qty,
        p_counterparty_id, coalesce(nullif(trim(p_event_label), ''), p_type),
        v_notes, auth.uid()
    )
    returning id into v_id;

    return v_id;
end;
$$;

comment on function public.record_inventory_movement(text, uuid, date, text, text, numeric, uuid, text, text) is
    'Records one manual stock movement with location/type validation.';

revoke all on function public.record_inventory_movement(text, uuid, date, text, text, numeric, uuid, text, text) from public;
grant execute on function public.record_inventory_movement(text, uuid, date, text, text, numeric, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock count: store expected/counted values and post the difference.
-- ---------------------------------------------------------------------------

create or replace function public.create_stock_count(
    p_counted_on date,
    p_location_code text,
    p_notes text,
    p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_count_id uuid;
    v_location text;
    v_notes text;
    v_item jsonb;
    v_product_id uuid;
    v_counted numeric;
    v_expected numeric;
    v_diff numeric;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para registrar contagens.'
            using errcode = '42501';
    end if;

    if p_counted_on is null then
        raise exception 'Informe a data da contagem.' using errcode = '22023';
    end if;

    select code into v_location
    from public.locations
    where code = p_location_code and active = true;

    if v_location is null then
        raise exception 'Local da contagem inválido.' using errcode = '22023';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'Adicione pelo menos um produto à contagem.' using errcode = '22023';
    end if;

    v_notes := nullif(trim(coalesce(p_notes, '')), '');

    insert into public.stock_counts (location, counted_on, notes, created_by)
    values (v_location, p_counted_on, v_notes, auth.uid())
    returning id into v_count_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
        v_counted := nullif(trim(v_item ->> 'counted_qty'), '')::numeric;

        if v_product_id is null
           or not exists (select 1 from public.products where id = v_product_id) then
            raise exception 'Produto inválido na contagem.' using errcode = '22023';
        end if;

        if v_counted is null or v_counted < 0 then
            raise exception 'Informe uma quantidade contada válida.' using errcode = '22023';
        end if;

        select coalesce(sum(s.qty_on_hand), 0)
        into v_expected
        from public.v_stock_on_hand s
        where s.product_id = v_product_id
          and s.location = v_location;

        insert into public.stock_count_items (
            stock_count_id, product_id, expected_qty, counted_qty
        ) values (
            v_count_id, v_product_id, v_expected, v_counted
        );

        v_diff := v_counted - v_expected;

        if abs(v_diff) > 0.0001 then
            insert into public.inventory_movements (
                product_id, moved_on, type, location_from, location_to, qty,
                event_label, notes, created_by
            ) values (
                v_product_id,
                p_counted_on,
                'count',
                case when v_diff < 0 then v_location else null end,
                case when v_diff > 0 then v_location else null end,
                abs(v_diff),
                'Contagem',
                v_notes,
                auth.uid()
            );
        end if;
    end loop;

    return v_count_id;
end;
$$;

comment on function public.create_stock_count(date, text, text, jsonb) is
    'Records a stock count and posts one count movement per difference.';

revoke all on function public.create_stock_count(date, text, text, jsonb) from public;
grant execute on function public.create_stock_count(date, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
