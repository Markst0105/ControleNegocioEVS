-- ============================================================================
-- Phase 5 — client list aggregates without the per-client view scan
--
-- `client_overview_for_ids` used to left-join `v_sale_payment_balances`
-- laterally, once per client on the page. The view aggregates every
-- `sale_payment_events` row before the client filter can apply, so the planner
-- repeated that whole aggregation 25 times. With the imported ledger it grew
-- past the API statement timeout, which made the Clientes tab fail with a
-- server-side render error.
--
-- The rewrite aggregates in a single pass, restricted to the sales of the
-- requested clients. Same columns, same values — only the plan changes.
-- ============================================================================

create or replace function public.client_overview_for_ids(p_ids uuid[])
returns table (
    id uuid,
    sales_count bigint,
    total_spent numeric,
    last_purchase_on date,
    open_amount numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with target_sales as (
        select
            s.id,
            s.client_id,
            s.amount_received,
            s.sold_on
        from public.sales s
        where s.client_id = any(p_ids)
    ),
    sales_totals as (
        select
            ts.client_id,
            count(*) as sales_count,
            coalesce(sum(coalesce(ts.amount_received, 0)), 0) as total_spent,
            max(ts.sold_on) as last_purchase_on
        from target_sales ts
        group by ts.client_id
    ),
    payment_balances as (
        select
            sp.sale_id,
            greatest(
                sp.amount
                - coalesce(sum(e.amount) filter (where e.kind = 'receipt'), 0)
                - coalesce(sum(e.amount) filter (where e.kind = 'write_off'), 0),
                0
            )::numeric(12,2) as open_amount
        from public.sale_payments sp
        join target_sales ts on ts.id = sp.sale_id
        left join public.sale_payment_events e
            on e.sale_payment_id = sp.id
        group by sp.id, sp.sale_id, sp.amount
    ),
    open_totals as (
        select
            ts.client_id,
            sum(pb.open_amount) as open_amount
        from payment_balances pb
        join target_sales ts on ts.id = pb.sale_id
        where pb.open_amount > 0
        group by ts.client_id
    )
    select
        c.id,
        coalesce(st.sales_count, 0)::bigint,
        coalesce(st.total_spent, 0)::numeric,
        st.last_purchase_on,
        coalesce(ot.open_amount, 0)::numeric
    from public.clients c
    left join sales_totals st on st.client_id = c.id
    left join open_totals ot on ot.client_id = c.id
    where c.id = any(p_ids);
$$;

comment on function public.client_overview_for_ids(uuid[]) is
    'Sales totals and open receivables for the supplied client IDs only, aggregated in one pass.';

revoke all on function public.client_overview_for_ids(uuid[]) from public;
grant execute on function public.client_overview_for_ids(uuid[]) to authenticated;

notify pgrst, 'reload schema';
