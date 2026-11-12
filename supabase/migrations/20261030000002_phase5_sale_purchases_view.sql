-- One row per purchase for the Vendas list.
--
-- The imported history stores one row per product line, so a single purchase
-- with three products is three `sales` rows. The app groups them by the natural
-- key of the ledger: sale date + client + payment method. Deal and origin can
-- differ inside the same purchase (for example a LEVOU/TROUXE swap), so they are
-- exposed as arrays instead of being part of the key.
--
-- `security_invoker` keeps the caller's RLS in effect through the view.

create or replace view public.v_sale_purchases
with (security_invoker = true)
as
with line as (
    select
        s.sold_on,
        coalesce(
            s.client_id::text,
            'name:' || lower(btrim(coalesce(s.client_name_raw, '')))
        ) as client_key,
        s.client_id,
        coalesce(
            nullif(btrim(s.client_name_raw), ''),
            c.name,
            'Balcão'
        ) as client_name,
        s.payment_method_code,
        pm.label as payment_label,
        coalesce(nullif(btrim(s.product_name_raw), ''), '—') as product_name,
        s.amount_received,
        s.product_cost,
        s.financial_cost,
        s.profit,
        s.pv,
        s.deal_type_code,
        s.origin,
        s.discount_pct
    from public.sales s
    left join public.clients c on c.id = s.client_id
    left join public.payment_methods pm on pm.code = s.payment_method_code
),
grouped as (
    select
        sold_on,
        client_key,
        payment_method_code,
        (array_agg(client_id) filter (where client_id is not null))[1] as client_id,
        (array_agg(client_name order by client_name))[1] as client_name,
        max(payment_label) as payment_label,
        count(*)::int as item_count,
        round(sum(amount_received)::numeric, 2) as total_amount,
        round(sum(product_cost)::numeric, 2) as total_cost,
        round(sum(financial_cost)::numeric, 2) as total_fee,
        round(sum(profit)::numeric, 2) as total_profit,
        round(sum(pv)::numeric, 2) as total_pv,
        round(max(discount_pct)::numeric, 4) as discount_pct,
        array_agg(distinct origin order by origin)
            filter (where origin is not null) as origins,
        array_agg(distinct deal_type_code order by deal_type_code)
            filter (where deal_type_code is not null) as deal_codes,
        string_agg(product_name, ' ') as products_text
    from line
    group by sold_on, client_key, payment_method_code
),
items as (
    select
        sold_on,
        client_key,
        payment_method_code,
        jsonb_agg(
            jsonb_build_object(
                'name', product_name,
                'qty', qty,
                'amount', amount
            )
            order by product_name
        ) as items
    from (
        select
            sold_on,
            client_key,
            payment_method_code,
            product_name,
            count(*)::int as qty,
            round(sum(amount_received)::numeric, 2) as amount
        from line
        group by sold_on, client_key, payment_method_code, product_name
    ) per_product
    group by sold_on, client_key, payment_method_code
)
select
    md5(
        g.sold_on::text || '|' || g.client_key || '|' ||
        coalesce(g.payment_method_code, '~')
    ) as id,
    g.sold_on,
    g.client_id,
    g.client_name,
    g.payment_method_code,
    g.payment_label,
    g.item_count,
    g.total_amount,
    g.total_cost,
    g.total_fee,
    g.total_profit,
    g.total_pv,
    g.discount_pct,
    g.origins,
    g.deal_codes,
    i.items,
    g.products_text
from grouped g
join items i
    on i.sold_on = g.sold_on
   and i.client_key = g.client_key
   and i.payment_method_code is not distinct from g.payment_method_code;

comment on view public.v_sale_purchases is
    'One row per purchase: sales lines grouped by date, client and payment method. Deal codes and origins stay as arrays because one purchase can mix them.';

grant select on public.v_sale_purchases to authenticated;

notify pgrst, 'reload schema';
