-- ---------------------------------------------------------------------------
-- Phase 4b — cash flow and soft month close.
--
-- Cash flow is derived from tracked cash movements:
--   * receivable receipt events (not write-offs);
--   * expenses by incurred_on;
--   * stock purchases by purchased_on.
--
-- The month close is a soft close: it stores a snapshot and later changes are
-- detected by comparing the snapshot with the current aggregates. It does not
-- block edits. Only admins can close or reopen a month.
-- ---------------------------------------------------------------------------

create index if not exists idx_sale_payment_events_occurred
    on public.sale_payment_events (occurred_on, kind);

-- ---------------------------------------------------------------------------
-- Cash ledger: one row per tracked receipt, expense or stock purchase.
-- ---------------------------------------------------------------------------
create or replace view public.v_cash_flow_entries
with (security_invoker = true)
as
with purchase_totals as (
    select
        pu.id,
        pu.purchased_on,
        pu.supplier_id,
        pu.account_id,
        pu.invoice_no,
        pu.notes,
        pu.created_at,
        sum(pi.qty * pi.unit_cost)::numeric(12,2) as amount,
        count(*)::int as item_count
    from public.purchases pu
    join public.purchase_items pi on pi.purchase_id = pu.id
    group by
        pu.id,
        pu.purchased_on,
        pu.supplier_id,
        pu.account_id,
        pu.invoice_no,
        pu.notes,
        pu.created_at
)
select
    e.occurred_on,
    'receipt'::text as entry_kind,
    'in'::text as direction,
    e.amount,
    coalesce(
        nullif(btrim(c.name), ''),
        nullif(btrim(s.client_name_raw), ''),
        'Balcão'
    ) as description,
    concat_ws(
        ' · ',
        'Parcela ' || sp.installment::text,
        pm.label
    ) as detail,
    e.id as reference_id,
    s.id as sale_id,
    c.id as client_id,
    null::uuid as account_id,
    null::text as account_name,
    'Recebimento'::text as category,
    pm.label as method_label,
    null::text as scope,
    e.created_at
from public.sale_payment_events e
join public.sale_payments sp on sp.id = e.sale_payment_id
join public.sales s on s.id = sp.sale_id
left join public.clients c on c.id = s.client_id
left join public.payment_methods pm
    on pm.code = coalesce(sp.method_code, s.payment_method_code)
where e.kind = 'receipt'

union all

select
    x.incurred_on,
    'expense'::text,
    'out'::text,
    x.amount,
    x.description,
    concat_ws(' · ', ec.name, a.name),
    x.id,
    null::uuid,
    null::uuid,
    x.account_id,
    a.name,
    coalesce(ec.name, 'Sem categoria'),
    null::text,
    x.scope,
    x.created_at
from public.expenses x
left join public.expense_categories ec on ec.id = x.category_id
left join public.accounts a on a.id = x.account_id

union all

select
    pt.purchased_on,
    'purchase'::text,
    'out'::text,
    pt.amount,
    coalesce(nullif(btrim(cp.name), ''), 'Compra de estoque'),
    concat_ws(
        ' · ',
        nullif(btrim(pt.invoice_no), ''),
        pt.item_count::text || case when pt.item_count = 1 then ' item' else ' itens' end
    ),
    pt.id,
    null::uuid,
    null::uuid,
    pt.account_id,
    a.name,
    'Estoque'::text,
    null::text,
    null::text,
    pt.created_at
from purchase_totals pt
left join public.counterparties cp on cp.id = pt.supplier_id
left join public.accounts a on a.id = pt.account_id;

comment on view public.v_cash_flow_entries is
    'Derived cash ledger: receipt events, expenses and stock purchases. Write-offs are not cash movements.';

grant select on public.v_cash_flow_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Monthly cash summary. SECURITY INVOKER keeps personal expenses hidden from
-- operators and all cash data hidden from members.
-- ---------------------------------------------------------------------------
create or replace function public.cash_flow_summary(p_month date)
returns table (
    month date,
    cash_in numeric,
    expenses_total numeric,
    business_expenses_total numeric,
    personal_expenses_total numeric,
    purchases_total numeric,
    cash_out_total numeric,
    net_cash numeric,
    receipts_count bigint,
    expenses_count bigint,
    purchases_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with bounds as (
        select
            date_trunc('month', coalesce(p_month, public.business_today()))::date
                as month_start,
            (date_trunc('month', coalesce(p_month, public.business_today()))
                + interval '1 month')::date as month_end
    )
    select
        b.month_start,
        coalesce(sum(v.amount) filter (where v.direction = 'in'), 0)::numeric,
        coalesce(sum(v.amount) filter (where v.entry_kind = 'expense'), 0)::numeric,
        coalesce(sum(v.amount) filter (
            where v.entry_kind = 'expense'
              and v.scope in ('negocio_fixo', 'negocio_variavel')
        ), 0)::numeric,
        coalesce(sum(v.amount) filter (
            where v.entry_kind = 'expense' and v.scope = 'pessoal'
        ), 0)::numeric,
        coalesce(sum(v.amount) filter (where v.entry_kind = 'purchase'), 0)::numeric,
        coalesce(sum(v.amount) filter (where v.direction = 'out'), 0)::numeric,
        coalesce(sum(v.amount) filter (where v.direction = 'in'), 0)::numeric
            - coalesce(sum(v.amount) filter (where v.direction = 'out'), 0)::numeric,
        count(*) filter (where v.entry_kind = 'receipt'),
        count(*) filter (where v.entry_kind = 'expense'),
        count(*) filter (where v.entry_kind = 'purchase')
    from bounds b
    left join public.v_cash_flow_entries v
        on v.occurred_on >= b.month_start
       and v.occurred_on < b.month_end
    group by b.month_start;
$$;

comment on function public.cash_flow_summary(date) is
    'Cash in/out for a month, derived from receipts, expenses and stock purchases.';

revoke all on function public.cash_flow_summary(date) from public;
grant execute on function public.cash_flow_summary(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Receivables as of a date, used by the month-close snapshot. An installment
-- counts only when its due date is on or before the cutoff and its balance was
-- still open after all events up to that date.
-- ---------------------------------------------------------------------------
create or replace function public.open_receivables_as_of(p_date date)
returns table (
    open_total numeric,
    overdue_total numeric,
    open_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with cutoff as (
        select coalesce(p_date, public.business_today()) as as_of
    ),
    balances as (
        select
            sp.id,
            sp.amount,
            sp.due_on,
            coalesce(sum(e.amount) filter (where e.kind = 'receipt'), 0)::numeric
                as received_amount,
            coalesce(sum(e.amount) filter (where e.kind = 'write_off'), 0)::numeric
                as written_off_amount
        from public.sale_payments sp
        cross join cutoff c
        left join public.sale_payment_events e
            on e.sale_payment_id = sp.id
           and e.occurred_on <= c.as_of
        where sp.due_on is not null
          and sp.due_on <= c.as_of
        group by sp.id, sp.amount, sp.due_on
    )
    select
        coalesce(sum(greatest(b.amount - b.received_amount - b.written_off_amount, 0)), 0)::numeric,
        coalesce(sum(greatest(b.amount - b.received_amount - b.written_off_amount, 0))
            filter (where b.due_on < c.as_of), 0)::numeric,
        count(*) filter (
            where greatest(b.amount - b.received_amount - b.written_off_amount, 0) > 0
        )
    from balances b
    cross join cutoff c;
$$;

comment on function public.open_receivables_as_of(date) is
    'Open receivable balance and overdue amount as of the end of a given date.';

revoke all on function public.open_receivables_as_of(date) from public;
grant execute on function public.open_receivables_as_of(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Month-close summary. This is the current truth for a month; the close
-- function stores it as a JSON snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.month_close_summary(p_month date)
returns table (
    month date,
    ganho_vendas numeric,
    royalties numeric,
    bonus numeric,
    ganho_bruto numeric,
    custos_fixos numeric,
    custos_variaveis numeric,
    ganho_liquido numeric,
    despesas_pessoais numeric,
    pv_total numeric,
    cash_in numeric,
    expenses_total numeric,
    business_expenses_total numeric,
    personal_expenses_total numeric,
    purchases_total numeric,
    cash_out_total numeric,
    net_cash numeric,
    receipts_count bigint,
    expenses_count bigint,
    purchases_count bigint,
    open_receivables numeric,
    overdue_receivables numeric,
    open_receivables_count bigint,
    sales_count bigint,
    business_expense_count bigint,
    statement_present boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with bounds as (
        select
            date_trunc('month', coalesce(p_month, public.business_today()))::date
                as month_start,
            (date_trunc('month', coalesce(p_month, public.business_today()))
                + interval '1 month')::date as month_end
    ),
    pnl as (
        select p.*
        from bounds b
        cross join lateral public.monthly_pnl(b.month_start) p
    ),
    cash as (
        select c.*
        from bounds b
        cross join lateral public.cash_flow_summary(b.month_start) c
    ),
    receivables as (
        select r.*
        from bounds b
        cross join lateral public.open_receivables_as_of(b.month_end - 1) r
    ),
    sales_m as (
        select count(*)::bigint as sales_count
        from public.sales s, bounds b
        where s.sold_on >= b.month_start
          and s.sold_on < b.month_end
    ),
    expenses_m as (
        select count(*) filter (
            where e.scope in ('negocio_fixo', 'negocio_variavel')
        )::bigint as business_expense_count
        from public.expenses e, bounds b
        where e.incurred_on >= b.month_start
          and e.incurred_on < b.month_end
    ),
    statement_m as (
        select exists (
            select 1
            from public.herbalife_statements h, bounds b
            where h.month = b.month_start
        ) as statement_present
    )
    select
        b.month_start,
        p.ganho_vendas,
        p.royalties,
        p.bonus,
        p.ganho_bruto,
        p.custos_fixos,
        p.investimentos_promocoes,
        p.ganho_liquido,
        p.despesas_pessoais,
        p.pv_total,
        c.cash_in,
        c.expenses_total,
        c.business_expenses_total,
        c.personal_expenses_total,
        c.purchases_total,
        c.cash_out_total,
        c.net_cash,
        c.receipts_count,
        c.expenses_count,
        c.purchases_count,
        r.open_total,
        r.overdue_total,
        r.open_count,
        s.sales_count,
        e.business_expense_count,
        st.statement_present
    from bounds b
    cross join pnl p
    cross join cash c
    cross join receivables r
    cross join sales_m s
    cross join expenses_m e
    cross join statement_m st;
$$;

comment on function public.month_close_summary(date) is
    'Current P&L, cash, receivable and completeness metrics for a month close.';

revoke all on function public.month_close_summary(date) from public;
grant execute on function public.month_close_summary(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Soft month close record.
-- ---------------------------------------------------------------------------
create table if not exists public.month_closings (
    id           uuid primary key default gen_random_uuid(),
    month        date not null unique,
    status       text not null default 'closed'
                   check (status in ('closed', 'open')),
    closed_at    timestamptz,
    closed_by    uuid references auth.users(id) on delete set null,
    close_note   text check (close_note is null or char_length(close_note) <= 1000),
    snapshot     jsonb not null default '{}'::jsonb,
    reopened_at  timestamptz,
    reopened_by  uuid references auth.users(id) on delete set null,
    reopen_note  text check (reopen_note is null or char_length(reopen_note) <= 1000),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.month_closings is
    'Soft month close. Stores the close snapshot; edits after closing are allowed and detected by comparison.';

drop trigger if exists trg_month_closings_updated_at on public.month_closings;
create trigger trg_month_closings_updated_at
before update on public.month_closings
for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit close/reopen operations, including the snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.fn_audit_month_closing()
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
        'month_closings',
        coalesce(new.id, old.id),
        lower(tg_op),
        to_jsonb(old),
        to_jsonb(new),
        auth.uid()
    );

    return coalesce(new, old);
end;
$$;

revoke all on function public.fn_audit_month_closing() from public;

drop trigger if exists trg_audit_month_closing on public.month_closings;
create trigger trg_audit_month_closing
after insert or update or delete on public.month_closings
for each row execute function public.fn_audit_month_closing();

-- ---------------------------------------------------------------------------
-- RLS: close data is admin-only. Operators see the derived cash ledger through
-- the normal business RLS, but never the close snapshot (which includes
-- personal expenses).
-- ---------------------------------------------------------------------------
alter table public.month_closings enable row level security;

grant select, insert, update, delete on public.month_closings to authenticated;

drop policy if exists admin_all on public.month_closings;
create policy admin_all on public.month_closings
    for all using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Close and reopen RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.close_month(
    p_month date,
    p_note text default null
)
returns setof public.month_closings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_month date;
    v_note text;
    v_snapshot jsonb;
begin
    if current_user_role() <> 'admin' then
        raise exception 'Apenas administradores podem fechar um mês.'
            using errcode = '42501';
    end if;

    if p_month is null then
        raise exception 'Informe o mês do fechamento.' using errcode = '22023';
    end if;

    v_month := date_trunc('month', p_month)::date;

    if v_month > date_trunc('month', public.business_today())::date then
        raise exception 'Não é possível fechar um mês futuro.' using errcode = '22023';
    end if;

    v_note := nullif(btrim(coalesce(p_note, '')), '');
    if v_note is not null and char_length(v_note) > 1000 then
        raise exception 'A observação deve ter no máximo 1000 caracteres.'
            using errcode = '22023';
    end if;

    select jsonb_build_object(
        'month', to_char(s.month, 'YYYY-MM'),
        'generated_at', now(),
        'pnl', jsonb_build_object(
            'ganho_vendas', s.ganho_vendas,
            'royalties', s.royalties,
            'bonus', s.bonus,
            'ganho_bruto', s.ganho_bruto,
            'custos_fixos', s.custos_fixos,
            'custos_variaveis', s.custos_variaveis,
            'ganho_liquido', s.ganho_liquido,
            'despesas_pessoais', s.despesas_pessoais,
            'pv_total', s.pv_total
        ),
        'cash', jsonb_build_object(
            'cash_in', s.cash_in,
            'expenses_total', s.expenses_total,
            'business_expenses_total', s.business_expenses_total,
            'personal_expenses_total', s.personal_expenses_total,
            'purchases_total', s.purchases_total,
            'cash_out_total', s.cash_out_total,
            'net_cash', s.net_cash,
            'receipts_count', s.receipts_count,
            'expenses_count', s.expenses_count,
            'purchases_count', s.purchases_count
        ),
        'receivables', jsonb_build_object(
            'open_total', s.open_receivables,
            'overdue_total', s.overdue_receivables,
            'open_count', s.open_receivables_count
        ),
        'counts', jsonb_build_object(
            'sales_count', s.sales_count,
            'business_expense_count', s.business_expense_count
        ),
        'statement_present', s.statement_present
    )
    into v_snapshot
    from public.month_close_summary(v_month) s;

    insert into public.month_closings (
        month, status, closed_at, closed_by, close_note, snapshot
    ) values (
        v_month, 'closed', now(), auth.uid(), v_note, v_snapshot
    )
    on conflict (month) do update set
        status = 'closed',
        closed_at = excluded.closed_at,
        closed_by = excluded.closed_by,
        close_note = excluded.close_note,
        snapshot = excluded.snapshot,
        reopened_at = null,
        reopened_by = null,
        reopen_note = null;

    return query
        select * from public.month_closings where month = v_month;
end;
$$;

comment on function public.close_month(date, text) is
    'Admin-only soft close: stores the current month summary as a JSON snapshot.';

revoke all on function public.close_month(date, text) from public;
grant execute on function public.close_month(date, text) to authenticated;

create or replace function public.reopen_month(
    p_month date,
    p_note text default null
)
returns setof public.month_closings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_month date;
    v_note text;
begin
    if current_user_role() <> 'admin' then
        raise exception 'Apenas administradores podem reabrir um mês.'
            using errcode = '42501';
    end if;

    if p_month is null then
        raise exception 'Informe o mês do fechamento.' using errcode = '22023';
    end if;

    v_month := date_trunc('month', p_month)::date;

    if v_month > date_trunc('month', public.business_today())::date then
        raise exception 'Não é possível reabrir um mês futuro.' using errcode = '22023';
    end if;

    v_note := nullif(btrim(coalesce(p_note, '')), '');
    if v_note is null then
        raise exception 'Informe o motivo da reabertura.' using errcode = '22023';
    end if;
    if char_length(v_note) > 1000 then
        raise exception 'A observação deve ter no máximo 1000 caracteres.'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.month_closings
        where month = v_month and status = 'closed'
    ) then
        raise exception 'Este mês não está fechado.' using errcode = 'P0002';
    end if;

    update public.month_closings
       set status = 'open',
           reopened_at = now(),
           reopened_by = auth.uid(),
           reopen_note = v_note
     where month = v_month;

    return query
        select * from public.month_closings where month = v_month;
end;
$$;

comment on function public.reopen_month(date, text) is
    'Admin-only soft reopen: keeps the last close snapshot for comparison.';

revoke all on function public.reopen_month(date, text) from public;
grant execute on function public.reopen_month(date, text) to authenticated;

notify pgrst, 'reload schema';
