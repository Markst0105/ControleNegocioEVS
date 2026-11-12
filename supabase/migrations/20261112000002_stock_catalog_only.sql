-- ---------------------------------------------------------------------------
-- Estoque shows catalog products only.
--
-- Catalog products carry a `#` SKU (e.g. `#0009`). Access, supply and other
-- support items have short SKUs without `#`; they keep their stock history and
-- product pages, but they are no longer part of the Estoque overview or its
-- KPIs. Purchases and product/stock views are unchanged.
-- ---------------------------------------------------------------------------

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
        where p.sku like '#%'
          and (
              coalesce(p_search, '') = ''
              or p.name ilike '%' || p_search || '%'
              or p.sku ilike '%' || p_search || '%'
          )
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
    'Inventory KPIs for catalog products (SKU starting with #) and the current search. Low stock means 1–3 units; out of stock means 0 or less.';

revoke all on function public.inventory_summary(text) from public;
grant execute on function public.inventory_summary(text) to authenticated;

notify pgrst, 'reload schema';
