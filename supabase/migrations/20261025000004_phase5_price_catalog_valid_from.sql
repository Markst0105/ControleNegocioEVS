-- ============================================================================
-- Phase 5 — show when the price sheet was updated
--
-- The Preços screen says "atualizada em <hoje>", which is not true when the
-- last import was weeks ago. The view now carries the date of the most
-- recent price row behind each product, so the screen can tell the truth.
-- ============================================================================

create or replace view v_price_catalog
with (security_invoker = true)
as
with latest_prices as (
    select distinct on (product_id, tier_code)
        product_id,
        tier_code,
        price,
        valid_from
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
    max(lp.price) filter (where lp.tier_code = 'ouro') as price_ouro,
    max(lp.valid_from) as price_valid_from
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
    'Latest current price per product and counter tier, with the date of the most recent price row.';

grant select on v_price_catalog to authenticated;

notify pgrst, 'reload schema';
