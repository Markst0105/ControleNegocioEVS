-- ============================================================================
-- Price tiers on purchases and Ouro-based stock valuation.
--
-- Purchase lines may store which counter tier supplied the unit cost. Stock is
-- valued at the current Ouro price; purchase cost remains the amount actually
-- paid and is kept in purchase_items.unit_cost / v_purchase_overview.total_cost.
-- ============================================================================

alter table purchase_items add column if not exists price_tier text;

alter table purchase_items
    drop constraint if exists purchase_items_price_tier_check;

alter table purchase_items
    add constraint purchase_items_price_tier_check
    check (
        price_tier is null
        or price_tier in (
            'retail', 't0.25', 't0.35', 't0.42', 't0.5',
            'bronze', 'prata', 'ouro'
        )
    );

comment on column purchase_items.price_tier is
    'Price tier applied to the purchase line, when chosen from the price table.';

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
    pc.price_ouro,
    case
        when pc.price_ouro is not null and coalesce(sum(s.qty_on_hand), 0) > 0
            then coalesce(sum(s.qty_on_hand), 0) * pc.price_ouro
        else 0
    end::numeric as stock_value
from products p
left join v_stock_on_hand s on s.product_id = p.id
left join v_price_catalog pc on pc.id = p.id
left join lateral (
    select pi.unit_cost
    from purchase_items pi
    join purchases pu on pu.id = pi.purchase_id
    where pi.product_id = p.id
    order by pu.purchased_on desc, pi.created_at desc
    limit 1
) latest on true
group by
    p.id, p.sku, p.name, p.kind, p.is_active, latest.unit_cost, pc.price_ouro;

comment on view v_stock_product_totals is
    'One row per product with on-hand quantity valued at the current Ouro price; unit_cost remains the latest purchase cost.';

grant select on v_stock_product_totals to authenticated;

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
    v_price_tier text;
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
        v_price_tier := nullif(trim(coalesce(v_item ->> 'price_tier', '')), '');

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

        if v_price_tier is not null
           and v_price_tier not in (
               'retail', 't0.25', 't0.35', 't0.42', 't0.5',
               'bronze', 'prata', 'ouro'
           ) then
            raise exception 'Faixa de preço inválida.' using errcode = '22023';
        end if;

        insert into public.purchase_items (
            purchase_id, product_id, qty, unit_cost, price_tier
        )
        values (
            v_purchase_id, v_product_id, v_qty, v_unit_cost, v_price_tier
        );

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
    'Creates a purchase, its lines and one purchase movement per line atomically, including the optional price tier.';

notify pgrst, 'reload schema';
