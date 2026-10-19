-- ---------------------------------------------------------------------------
-- Open receivables total — Painel KPI.
--
-- PostgREST aggregate selectors (e.g. `select=amount_due.sum()`) are disabled
-- on the project, so the total is computed here instead. SECURITY INVOKER
-- keeps the caller's RLS in effect through the security_invoker view.
-- ---------------------------------------------------------------------------
create or replace function open_receivables_total()
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    select coalesce(sum(amount_due), 0)::numeric
    from public.v_receivables_schedule;
$$;

revoke all on function open_receivables_total() from public;
grant execute on function open_receivables_total() to authenticated;
