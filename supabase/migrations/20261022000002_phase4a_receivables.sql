-- ============================================================================
-- Phase 4a — receivables, partial receipts and historical reconciliation
--
-- sale_payments remains the installment schedule (amount, due date). Every
-- settlement is recorded as an append-only event:
--   receipt   money actually received
--   write_off balance considered unrecoverable
--
-- The open balance is always derived from the events, so partial receipts never
-- overwrite each other. The legacy received_on/received_amount columns are kept
-- for history and are migrated into events once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Business date helper (the database may run in UTC)
-- ---------------------------------------------------------------------------

create or replace function public.business_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
    select (now() at time zone 'America/Sao_Paulo')::date;
$$;

comment on function public.business_today() is
    'Today in the business time zone (America/Sao_Paulo).';

revoke all on function public.business_today() from public;
grant execute on function public.business_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Settlement events
-- ---------------------------------------------------------------------------

create table if not exists public.sale_payment_events (
    id              uuid primary key default gen_random_uuid(),
    sale_payment_id uuid not null references public.sale_payments(id) on delete cascade,
    kind            text not null check (kind in ('receipt','write_off')),
    occurred_on     date not null,
    amount          numeric(12,2) not null check (amount > 0),
    note            text,
    created_by      uuid references auth.users(id) on delete set null default auth.uid(),
    created_at      timestamptz not null default now()
);

create index if not exists idx_sale_payment_events_payment
    on public.sale_payment_events (sale_payment_id, occurred_on desc);

create index if not exists idx_sale_payment_events_kind_date
    on public.sale_payment_events (kind, occurred_on);

comment on table public.sale_payment_events is
    'Append-only receipts and write-offs for sale installments. The open balance is amount minus all events.';

comment on column public.sale_payments.received_on is
    'Legacy import column. New settlements are stored in sale_payment_events.';

comment on column public.sale_payments.received_amount is
    'Legacy import column. New settlements are stored in sale_payment_events.';

alter table public.sale_payment_events enable row level security;

drop policy if exists admin_all on public.sale_payment_events;
create policy admin_all on public.sale_payment_events
    for all
    using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

drop policy if exists operator_sale_payment_events_read on public.sale_payment_events;
create policy operator_sale_payment_events_read on public.sale_payment_events
    for select
    using (current_user_role() = 'operator');

drop policy if exists operator_sale_payment_events_insert on public.sale_payment_events;
create policy operator_sale_payment_events_insert on public.sale_payment_events
    for insert
    with check (
        current_user_role() = 'operator'
        and kind = 'receipt'
    );

grant select, insert, update, delete
    on public.sale_payment_events
    to authenticated;

-- ---------------------------------------------------------------------------
-- Guard: an event can never consume more than the installment's open balance.
-- The row lock serialises two receipts being entered at the same time.
-- ---------------------------------------------------------------------------

create or replace function public.fn_validate_sale_payment_event()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_amount numeric;
    v_used numeric;
begin
    select sp.amount
      into v_amount
      from public.sale_payments sp
     where sp.id = new.sale_payment_id
       for update;

    if not found then
        raise exception 'Parcela não encontrada.' using errcode = 'P0002';
    end if;

    select coalesce(sum(e.amount), 0)
      into v_used
      from public.sale_payment_events e
     where e.sale_payment_id = new.sale_payment_id;

    if new.amount > v_amount - v_used then
        raise exception 'O valor informado supera o saldo em aberto da parcela.'
            using errcode = '22023';
    end if;

    return new;
end;
$$;

revoke all on function public.fn_validate_sale_payment_event() from public;

drop trigger if exists trg_validate_sale_payment_event
    on public.sale_payment_events;
create trigger trg_validate_sale_payment_event
before insert on public.sale_payment_events
for each row execute function public.fn_validate_sale_payment_event();

-- ---------------------------------------------------------------------------
-- Audit trail for receipts and write-offs (including bulk reconciliation).
-- ---------------------------------------------------------------------------

create or replace function public.fn_audit_sale_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.audit_log (
        table_name, row_id, action, old_data, new_data, changed_by
    )
    values (
        'sale_payment_events',
        coalesce(new.id, old.id),
        lower(tg_op),
        to_jsonb(old),
        to_jsonb(new),
        auth.uid()
    );

    return coalesce(new, old);
end;
$$;

revoke all on function public.fn_audit_sale_payment_event() from public;

drop trigger if exists trg_audit_sale_payment_event
    on public.sale_payment_events;
create trigger trg_audit_sale_payment_event
after insert or update or delete on public.sale_payment_events
for each row execute function public.fn_audit_sale_payment_event();

-- ---------------------------------------------------------------------------
-- One-time migration of legacy received_on/received_amount values.
-- New rows do not use those columns.
-- ---------------------------------------------------------------------------

insert into public.sale_payment_events (
    sale_payment_id, kind, occurred_on, amount, note
)
select
    sp.id,
    'receipt',
    coalesce(sp.received_on, sp.due_on, public.business_today()),
    least(
        coalesce(sp.received_amount, sp.amount),
        sp.amount
    ),
    'Baixa migrada do histórico da planilha'
from public.sale_payments sp
where (sp.received_on is not null or coalesce(sp.received_amount, 0) > 0)
  and least(coalesce(sp.received_amount, sp.amount), sp.amount) > 0
  and not exists (
      select 1
      from public.sale_payment_events e
      where e.sale_payment_id = sp.id
  );

-- ---------------------------------------------------------------------------
-- Balanced installment view: amount, received, written off and open balance.
-- ---------------------------------------------------------------------------

create or replace view public.v_sale_payment_balances
with (security_invoker = true)
as
with totals as (
    select
        e.sale_payment_id,
        coalesce(sum(e.amount) filter (where e.kind = 'receipt'), 0)::numeric(12,2)
            as received_amount,
        coalesce(sum(e.amount) filter (where e.kind = 'write_off'), 0)::numeric(12,2)
            as written_off_amount,
        max(e.occurred_on) filter (where e.kind = 'receipt') as last_received_on,
        max(e.occurred_on) filter (where e.kind = 'write_off') as written_off_on
    from public.sale_payment_events e
    group by e.sale_payment_id
)
select
    sp.id,
    sp.sale_id,
    sp.installment,
    sp.due_on,
    sp.amount,
    sp.method_code,
    sp.fee_pct,
    coalesce(t.received_amount, 0)::numeric(12,2) as received_amount,
    coalesce(t.written_off_amount, 0)::numeric(12,2) as written_off_amount,
    greatest(
        sp.amount
        - coalesce(t.received_amount, 0)
        - coalesce(t.written_off_amount, 0),
        0
    )::numeric(12,2) as open_amount,
    t.last_received_on,
    t.written_off_on,
    case
        when sp.amount
             - coalesce(t.received_amount, 0)
             - coalesce(t.written_off_amount, 0) <= 0
             and coalesce(t.written_off_amount, 0) > 0 then 'baixado'
        when sp.amount
             - coalesce(t.received_amount, 0)
             - coalesce(t.written_off_amount, 0) <= 0
             and coalesce(t.received_amount, 0) > 0 then 'recebido'
        when sp.amount
             - coalesce(t.received_amount, 0)
             - coalesce(t.written_off_amount, 0) <= 0 then 'sem_valor'
        when sp.due_on is null then 'sem_vencimento'
        when sp.due_on < public.business_today() then 'vencido'
        when sp.due_on = public.business_today() then 'vence_hoje'
        else 'a_vencer'
    end as status
from public.sale_payments sp
left join totals t on t.sale_payment_id = sp.id;

comment on view public.v_sale_payment_balances is
    'Installment schedule with receipt/write-off totals and the current open balance.';

grant select on public.v_sale_payment_balances to authenticated;

create or replace view public.v_receivables_detail
with (security_invoker = true)
as
select
    b.id,
    b.sale_id,
    b.installment,
    b.due_on,
    b.amount,
    b.received_amount,
    b.written_off_amount,
    b.open_amount,
    b.status,
    b.last_received_on,
    b.written_off_on,
    s.sold_on,
    s.client_id,
    coalesce(c.name, nullif(btrim(s.client_name_raw), ''), 'Balcão') as client_name,
    s.client_name_raw,
    s.product_name_raw,
    s.deal_type_code,
    s.payment_method_code,
    pm.label as method_label,
    s.amount_received as sale_amount,
    s.origin
from public.v_sale_payment_balances b
join public.sales s on s.id = b.sale_id
left join public.clients c on c.id = s.client_id
left join public.payment_methods pm
       on pm.code = coalesce(b.method_code, s.payment_method_code);

comment on view public.v_receivables_detail is
    'Receivable installment joined to its sale, client and payment method for the finance UI.';

grant select on public.v_receivables_detail to authenticated;

-- Keep the old schedule view semantics, now net of receipts and write-offs.
create or replace view public.v_receivables_schedule
with (security_invoker = true)
as
select
    b.due_on,
    sum(b.open_amount) as amount_due,
    count(*) as installments
from public.v_sale_payment_balances b
where b.open_amount > 0
  and b.due_on is not null
group by b.due_on
order by b.due_on;

grant select on public.v_receivables_schedule to authenticated;

-- ---------------------------------------------------------------------------
-- Summary for the receivables page and Painel.
-- ---------------------------------------------------------------------------

create or replace function public.open_receivables_total()
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    select coalesce(sum(b.open_amount), 0)::numeric
    from public.v_sale_payment_balances b
    where b.open_amount > 0
      and b.due_on is not null;
$$;

comment on function public.open_receivables_total() is
    'Sum of open installment balances that have a due date.';

revoke all on function public.open_receivables_total() from public;
grant execute on function public.open_receivables_total() to authenticated;

create or replace function public.open_receivables_summary()
returns table (
    open_total numeric,
    overdue_total numeric,
    due_today_total numeric,
    next7_total numeric,
    open_count bigint,
    overdue_count bigint,
    received_month_total numeric,
    written_off_month_total numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with bounds as (
        select
            public.business_today() as today,
            date_trunc('month', public.business_today())::date as month_start,
            (date_trunc('month', public.business_today()) + interval '1 month')::date
                as month_end
    ),
    open_balances as (
        select
            b.open_amount,
            b.due_on,
            bd.today
        from public.v_sale_payment_balances b
        cross join bounds bd
        where b.open_amount > 0
          and b.due_on is not null
    )
    select
        coalesce(sum(ob.open_amount), 0)::numeric as open_total,
        coalesce(sum(ob.open_amount) filter (where ob.due_on < ob.today), 0)::numeric
            as overdue_total,
        coalesce(sum(ob.open_amount) filter (where ob.due_on = ob.today), 0)::numeric
            as due_today_total,
        coalesce(sum(ob.open_amount) filter (
            where ob.due_on > ob.today and ob.due_on <= ob.today + 7
        ), 0)::numeric as next7_total,
        count(*)::bigint as open_count,
        (count(*) filter (where ob.due_on < ob.today))::bigint as overdue_count,
        coalesce((
            select sum(e.amount)
            from public.sale_payment_events e
            cross join bounds b
            where e.kind = 'receipt'
              and e.occurred_on >= b.month_start
              and e.occurred_on < b.month_end
        ), 0)::numeric as received_month_total,
        coalesce((
            select sum(e.amount)
            from public.sale_payment_events e
            cross join bounds b
            where e.kind = 'write_off'
              and e.occurred_on >= b.month_start
              and e.occurred_on < b.month_end
        ), 0)::numeric as written_off_month_total
    from open_balances ob;
$$;

comment on function public.open_receivables_summary() is
    'Open, overdue, due-today and next-seven-day balances plus this month''s receipts and write-offs.';

revoke all on function public.open_receivables_summary() from public;
grant execute on function public.open_receivables_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Settle one installment (full or partial). Operators and admins may receive.
-- ---------------------------------------------------------------------------

create or replace function public.receive_sale_payment(
    p_sale_payment_id uuid,
    p_amount numeric,
    p_received_on date,
    p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_event_id uuid;
begin
    if current_user_role() not in ('admin','operator') then
        raise exception 'Sua conta não tem permissão para registrar recebimentos.'
            using errcode = '42501';
    end if;

    if p_sale_payment_id is null then
        raise exception 'Parcela inválida.' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'Informe um valor maior que zero.' using errcode = '22023';
    end if;
    if p_received_on is null then
        raise exception 'Informe a data do recebimento.' using errcode = '22023';
    end if;
    if p_received_on > public.business_today() then
        raise exception 'A data do recebimento não pode estar no futuro.'
            using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_note, ''))) > 500 then
        raise exception 'A observação deve ter no máximo 500 caracteres.'
            using errcode = '22023';
    end if;

    insert into public.sale_payment_events (
        sale_payment_id, kind, occurred_on, amount, note, created_by
    )
    values (
        p_sale_payment_id,
        'receipt',
        p_received_on,
        round(p_amount, 2),
        nullif(btrim(coalesce(p_note, '')), ''),
        auth.uid()
    )
    returning id into v_event_id;

    return v_event_id;
end;
$$;

comment on function public.receive_sale_payment(uuid, numeric, date, text) is
    'Records a full or partial receipt and returns the settlement event id.';

revoke all on function public.receive_sale_payment(uuid, numeric, date, text) from public;
grant execute on function public.receive_sale_payment(uuid, numeric, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Write off the remaining balance. Admin-only: it changes the expected result.
-- ---------------------------------------------------------------------------

create or replace function public.write_off_sale_payment(
    p_sale_payment_id uuid,
    p_written_off_on date,
    p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_open numeric;
    v_event_id uuid;
begin
    if current_user_role() <> 'admin' then
        raise exception 'Apenas administradores podem baixar um saldo sem recebimento.'
            using errcode = '42501';
    end if;

    if p_sale_payment_id is null then
        raise exception 'Parcela inválida.' using errcode = '22023';
    end if;
    if p_written_off_on is null then
        raise exception 'Informe a data da baixa.' using errcode = '22023';
    end if;
    if p_written_off_on > public.business_today() then
        raise exception 'A data da baixa não pode estar no futuro.'
            using errcode = '22023';
    end if;
    if p_reason is null or char_length(btrim(p_reason)) < 3 then
        raise exception 'Informe o motivo da baixa.' using errcode = '22023';
    end if;
    if char_length(btrim(p_reason)) > 500 then
        raise exception 'O motivo deve ter no máximo 500 caracteres.'
            using errcode = '22023';
    end if;

    perform 1
       from public.sale_payments sp
      where sp.id = p_sale_payment_id
        for update;

    if not found then
        raise exception 'Parcela não encontrada.' using errcode = 'P0002';
    end if;

    select greatest(
        sp.amount - coalesce(sum(e.amount), 0),
        0
    )
      into v_open
      from public.sale_payments sp
      left join public.sale_payment_events e
             on e.sale_payment_id = sp.id
     where sp.id = p_sale_payment_id
     group by sp.id, sp.amount;

    if coalesce(v_open, 0) <= 0 then
        raise exception 'Esta parcela não tem saldo em aberto.' using errcode = '22023';
    end if;

    insert into public.sale_payment_events (
        sale_payment_id, kind, occurred_on, amount, note, created_by
    )
    values (
        p_sale_payment_id,
        'write_off',
        p_written_off_on,
        v_open,
        btrim(p_reason),
        auth.uid()
    )
    returning id into v_event_id;

    return v_event_id;
end;
$$;

comment on function public.write_off_sale_payment(uuid, date, text) is
    'Writes off the remaining balance of one installment and returns the event id.';

revoke all on function public.write_off_sale_payment(uuid, date, text) from public;
grant execute on function public.write_off_sale_payment(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Historical reconciliation: settle every open installment due on/before a
-- cutoff. Admin-only and intentionally explicit.
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_sale_payments_before(
    p_cutoff date,
    p_mode text,
    p_note text default null
)
returns table (reconciled_count bigint, reconciled_total numeric)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_count bigint := 0;
    v_total numeric := 0;
    v_open numeric;
    v_event_id uuid;
    v_default_note text;
    rec record;
begin
    if current_user_role() <> 'admin' then
        raise exception 'Apenas administradores podem reconciliar recebíveis em lote.'
            using errcode = '42501';
    end if;

    if p_cutoff is null then
        raise exception 'Informe a data de corte.' using errcode = '22023';
    end if;
    if p_cutoff > public.business_today() then
        raise exception 'A data de corte não pode estar no futuro.'
            using errcode = '22023';
    end if;
    if p_mode not in ('receipt','write_off') then
        raise exception 'Modo de reconciliação inválido.' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_note, ''))) > 500 then
        raise exception 'A observação deve ter no máximo 500 caracteres.'
            using errcode = '22023';
    end if;

    v_default_note := case
        when p_mode = 'receipt' then 'Baixa histórica em lote'
        else 'Baixa histórica em lote sem recebimento'
    end;

    for rec in
        select sp.id, sp.due_on
        from public.sale_payments sp
        where sp.due_on is not null
          and sp.due_on <= p_cutoff
        order by sp.due_on, sp.id
        for update
    loop
        select greatest(
            sp.amount - coalesce(sum(e.amount), 0),
            0
        )
          into v_open
          from public.sale_payments sp
          left join public.sale_payment_events e
                 on e.sale_payment_id = sp.id
         where sp.id = rec.id
         group by sp.id, sp.amount;

        if coalesce(v_open, 0) > 0 then
            insert into public.sale_payment_events (
                sale_payment_id, kind, occurred_on, amount, note, created_by
            )
            values (
                rec.id,
                p_mode,
                case when p_mode = 'receipt' then rec.due_on else p_cutoff end,
                v_open,
                coalesce(nullif(btrim(coalesce(p_note, '')), ''), v_default_note),
                auth.uid()
            )
            returning id into v_event_id;

            v_count := v_count + 1;
            v_total := v_total + v_open;
        end if;
    end loop;

    return query
        select v_count, v_total::numeric;
end;
$$;

comment on function public.reconcile_sale_payments_before(date, text, text) is
    'Admin bulk settlement of installments due on/before a cutoff, as receipts or write-offs.';

revoke all on function public.reconcile_sale_payments_before(date, text, text) from public;
grant execute on function public.reconcile_sale_payments_before(date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Client aggregates now use the event-derived open balance.
-- ---------------------------------------------------------------------------

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
    select
        c.id,
        coalesce(s.sales_count, 0)::bigint,
        coalesce(s.total_spent, 0)::numeric,
        s.last_purchase_on,
        coalesce(p.open_amount, 0)::numeric
    from public.clients c
    left join lateral (
        select
            count(*) as sales_count,
            sum(coalesce(sa.amount_received, 0)) as total_spent,
            max(sa.sold_on) as last_purchase_on
        from public.sales sa
        where sa.client_id = c.id
    ) s on true
    left join lateral (
        select
            sum(b.open_amount) as open_amount
        from public.v_sale_payment_balances b
        join public.sales sx on sx.id = b.sale_id
        where sx.client_id = c.id
          and b.open_amount > 0
    ) p on true
    where c.id = any(p_ids);
$$;

comment on function public.client_overview_for_ids(uuid[]) is
    'Sales totals and open receivables for the supplied client IDs only.';

revoke all on function public.client_overview_for_ids(uuid[]) from public;
grant execute on function public.client_overview_for_ids(uuid[]) to authenticated;

create or replace view public.v_client_overview
with (security_invoker = true)
as
select
    c.id,
    c.name,
    c.name_normalized,
    c.phone,
    c.whatsapp,
    c.phone_normalized,
    c.whatsapp_normalized,
    c.notes,
    c.created_at,
    c.updated_at,
    coalesce(s.sales_count, 0)::bigint as sales_count,
    coalesce(s.total_spent, 0)::numeric as total_spent,
    s.last_purchase_on,
    coalesce(p.open_amount, 0)::numeric as open_amount
from public.clients c
left join (
    select
        client_id,
        count(*) as sales_count,
        sum(coalesce(amount_received, 0)) as total_spent,
        max(sold_on) as last_purchase_on
    from public.sales
    where client_id is not null
    group by client_id
) s on s.client_id = c.id
left join (
    select
        sx.client_id,
        sum(b.open_amount) as open_amount
    from public.v_sale_payment_balances b
    join public.sales sx on sx.id = b.sale_id
    where b.open_amount > 0
      and sx.client_id is not null
    group by sx.client_id
) p on p.client_id = c.id;

comment on view public.v_client_overview is
    'Client list/detail aggregates: sales count, total spent, last purchase and open receivables.';

grant select on public.v_client_overview to authenticated;

notify pgrst, 'reload schema';
