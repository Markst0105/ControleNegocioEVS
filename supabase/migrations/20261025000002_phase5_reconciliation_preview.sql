-- ============================================================================
-- Phase 5 — preview of the historical reconciliation
--
-- The bulk reconciliation settles every open installment due on/before the
-- cutoff. Before an admin runs it over thousands of rows, the Recebíveis
-- screen shows how many installments and how much money the chosen cutoff
-- would touch.
--
-- The aggregate lives in SQL because PostgREST aggregate selectors are
-- disabled on this project.
-- ============================================================================

create or replace function public.reconciliation_preview(p_cutoff date)
returns table (
    installment_count bigint,
    open_total numeric,
    oldest_due_on date,
    newest_due_on date
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    select
        count(*)::bigint,
        coalesce(sum(b.open_amount), 0)::numeric,
        min(b.due_on),
        max(b.due_on)
    from public.v_sale_payment_balances b
    where b.open_amount > 0
      and b.due_on is not null
      and b.due_on <= p_cutoff;
$$;

comment on function public.reconciliation_preview(date) is
    'How many open installments and how much money a bulk reconciliation up to the cutoff would settle.';

revoke all on function public.reconciliation_preview(date) from public;
grant execute on function public.reconciliation_preview(date) to authenticated;

notify pgrst, 'reload schema';
