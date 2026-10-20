-- ============================================================================
-- Controle de Negócio — price catalog
-- One row per product with the current price for each counter tier. Used by
-- the printed price sheet and to prefill the sale amount from the selected
-- product. The base tables remain the source of truth; this view only pivots
-- the latest `product_prices` row per tier.
-- ============================================================================

create or replace view v_price_catalog
with (security_invoker = true)
as
with latest_prices as (
    select distinct on (product_id, tier_code)
        product_id,
        tier_code,
        price
    from product_prices
    where valid_from <= current_date
      and (valid_to is null or valid_to >= current_date)
    order by product_id, tier_code, valid_from desc
)
select
    p.id,
    p.sku,
    p.name,
    p.kind,
    p.item_class,
    p.pv,
    p.portions_per_pack,
    p.portion_label,
    p.is_active,
    p.print_name,
    max(lp.price) filter (where lp.tier_code = 'retail') as retail_price,
    max(lp.price) filter (where lp.tier_code = 't0.25') as price_25,
    max(lp.price) filter (where lp.tier_code = 't0.35') as price_35,
    max(lp.price) filter (where lp.tier_code = 't0.42') as price_42,
    max(lp.price) filter (where lp.tier_code = 't0.5') as price_50,
    max(lp.price) filter (where lp.tier_code = 'bronze') as price_bronze,
    max(lp.price) filter (where lp.tier_code = 'prata') as price_prata,
    max(lp.price) filter (where lp.tier_code = 'ouro') as price_ouro
from products p
left join latest_prices lp on lp.product_id = p.id
group by
    p.id,
    p.sku,
    p.name,
    p.kind,
    p.item_class,
    p.pv,
    p.portions_per_pack,
    p.portion_label,
    p.is_active,
    p.print_name;

comment on view v_price_catalog is
    'Latest current price per product and counter tier (retail, 25%, 35%, 42%, 50%, Bronze, Prata, Ouro).';

grant select on v_price_catalog to authenticated;

notify pgrst, 'reload schema';
