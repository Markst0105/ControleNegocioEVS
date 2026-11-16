-- ---------------------------------------------------------------------------
-- Credits replace the cartela.
--
-- Clients buy credits with a chosen amount instead of a fixed cartela. A
-- purchase made from the future client site lands here as `pending`; staff
-- approve or reject it in the Créditos tab. Staff can also issue an approved
-- credit directly for a registered member.
--
-- Cash and the monthly P&L recognise an approved credit purchase on its
-- purchase date, the same way the old cartela line kept its full value as
-- profit.
--
-- This migration also adds the client sign-in model:
--   * self-registration from the login page creates a member profile;
--   * members sign in with full name/e-mail + a 4–6 digit PIN;
--   * staff keep the e-mail + password form behind the admin switch.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Profiles carry the login e-mail (auth.users is not exposed to the API).
-- ---------------------------------------------------------------------------
alter table public.profiles
    add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

comment on column public.profiles.email is
    'Login e-mail, mirrored from auth.users so the client form can list registered users.';

create index if not exists idx_profiles_login_name
    on public.profiles (lower(btrim(name)));

create index if not exists idx_profiles_email
    on public.profiles (lower(email));

-- Keep profiles.email in sync even for users created by the dashboard or by a
-- seed script that only inserts the profile.
create or replace function public.fn_profiles_sync_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.email is null then
        select u.email into new.email
        from auth.users u
        where u.id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_profiles_sync_email on public.profiles;
create trigger trg_profiles_sync_email
before insert or update on public.profiles
for each row execute function public.fn_profiles_sync_email();

-- Self-registration: signUp({ data: { full_name } }) creates the member profile.
-- Dashboard/seed users without `full_name` metadata keep the old manual flow.
create or replace function public.fn_create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text;
begin
    if tg_op = 'INSERT' then
        v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

        if v_name is not null then
            insert into public.profiles (id, name, email, role, price_tier)
            values (new.id, v_name, new.email, 'member', 'retail')
            on conflict (id) do nothing;
        end if;

        return new;
    end if;

    -- e-mail changes keep the client login lookup current
    update public.profiles
       set email = new.email
     where id = new.id;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.fn_create_member_profile();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.fn_create_member_profile();

-- ---------------------------------------------------------------------------
-- Client login helpers (callable before sign-in).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_identifier(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with matches as (
        select p.email
        from public.profiles p
        where p.role = 'member'
          and p.email is not null
          and (
              lower(btrim(p.name)) = lower(btrim(p_identifier))
              or lower(btrim(p.email)) = lower(btrim(p_identifier))
          )
    )
    select min(email)
    from matches
    having count(*) = 1;
$$;

comment on function public.resolve_login_identifier(text) is
    'Returns the login e-mail for a member name or e-mail. Only members are resolvable; ambiguous names return NULL.';

create or replace function public.login_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select not exists (
        select 1
        from public.profiles
        where role = 'member'
          and lower(btrim(name)) = lower(btrim(p_name))
    );
$$;

comment on function public.login_name_available(text) is
    'True when no member already uses the name as a client login.';

revoke all on function public.resolve_login_identifier(text) from public;
grant execute on function public.resolve_login_identifier(text) to anon, authenticated;

revoke all on function public.login_name_available(text) from public;
grant execute on function public.login_name_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Credit purchases.
-- ---------------------------------------------------------------------------
create table if not exists public.credit_purchases (
    id                  uuid primary key default gen_random_uuid(),
    profile_id          uuid not null references public.profiles(id) on delete cascade,
    amount              numeric(12,2) not null check (amount > 0),
    payment_method_code text not null references public.payment_methods(code),
    purchased_on        date not null,
    status              text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
    source              text not null default 'site'
                          check (source in ('site', 'staff')),
    notes               text check (notes is null or char_length(notes) <= 500),
    requested_at        timestamptz not null default now(),
    reviewed_at         timestamptz,
    reviewed_by         uuid references auth.users(id) on delete set null,
    created_by          uuid references auth.users(id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table public.credit_purchases is
    'Credit bought by a client. Pending rows come from the client site and wait for approval; staff rows are approved on creation.';

create index if not exists idx_credit_purchases_profile
    on public.credit_purchases (profile_id, purchased_on desc);

create index if not exists idx_credit_purchases_status
    on public.credit_purchases (status, requested_at);

drop trigger if exists trg_credit_purchases_updated_at on public.credit_purchases;
create trigger trg_credit_purchases_updated_at
before update on public.credit_purchases
for each row execute function public.fn_set_updated_at();

alter table public.credit_purchases enable row level security;

drop policy if exists credit_admin_all on public.credit_purchases;
create policy credit_admin_all on public.credit_purchases
    for all using (current_user_role() = 'admin')
    with check (current_user_role() = 'admin');

drop policy if exists credit_operator_all on public.credit_purchases;
create policy credit_operator_all on public.credit_purchases
    for all using (current_user_role() = 'operator')
    with check (current_user_role() = 'operator');

drop policy if exists credit_member_read_own on public.credit_purchases;
create policy credit_member_read_own on public.credit_purchases
    for select using (
        current_user_role() = 'member'
        and profile_id = auth.uid()
    );

-- The future client site may create a pending request for the signed-in member.
drop policy if exists credit_member_request_own on public.credit_purchases;
create policy credit_member_request_own on public.credit_purchases
    for insert with check (
        current_user_role() = 'member'
        and profile_id = auth.uid()
        and status = 'pending'
        and source = 'site'
        and reviewed_at is null
        and reviewed_by is null
    );

grant select, insert, update on public.credit_purchases to authenticated;

-- Members need the payment-method label used by the credits views. The table is
-- reference data (Dinheiro, PIX, Crédito…), no client information.
drop policy if exists member_read_payment_methods on public.payment_methods;
create policy member_read_payment_methods on public.payment_methods
    for select using (current_user_role() = 'member');

-- ---------------------------------------------------------------------------
-- Credit views. Security invoker: RLS applies through them.
-- ---------------------------------------------------------------------------
create or replace view public.v_credit_purchases
with (security_invoker = true)
as
select
    c.id,
    c.profile_id,
    p.name as profile_name,
    p.email as profile_email,
    c.amount,
    c.payment_method_code,
    pm.label as payment_method_label,
    c.purchased_on,
    c.status,
    c.source,
    c.notes,
    c.requested_at,
    c.reviewed_at,
    c.created_at
from public.credit_purchases c
join public.profiles p on p.id = c.profile_id
join public.payment_methods pm on pm.code = c.payment_method_code;

comment on view public.v_credit_purchases is
    'Credit purchases with the member name/e-mail and the payment-method label.';

grant select on public.v_credit_purchases to authenticated;

create or replace view public.v_credit_balances
with (security_invoker = true)
as
select
    p.id as profile_id,
    p.name,
    p.email,
    coalesce(
        sum(c.amount) filter (where c.status = 'approved'),
        0
    )::numeric(12,2) as balance,
    coalesce(
        sum(c.amount) filter (where c.status = 'pending'),
        0
    )::numeric(12,2) as pending_amount,
    count(c.id) filter (where c.status = 'approved')::bigint as approved_count,
    max(c.purchased_on) filter (where c.status = 'approved') as last_purchase_on
from public.profiles p
left join public.credit_purchases c on c.profile_id = p.id
where p.role = 'member'
group by p.id, p.name, p.email;

comment on view public.v_credit_balances is
    'One row per member with the approved credit balance, pending requests and last purchase date.';

grant select on public.v_credit_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Business rules.
-- ---------------------------------------------------------------------------
create or replace function public.issue_credit(
    p_profile_id uuid,
    p_amount numeric,
    p_payment_method_code text,
    p_purchased_on date,
    p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_notes text;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para lançar créditos.'
            using errcode = '42501';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'Informe um valor maior que zero.' using errcode = '22023';
    end if;

    if p_amount > 1000000 then
        raise exception 'O valor informado é alto demais.' using errcode = '22023';
    end if;

    if p_purchased_on is null or p_purchased_on > current_date then
        raise exception 'Informe uma data de compra válida.' using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = p_profile_id and role = 'member'
    ) then
        raise exception 'Selecione um usuário cadastrado.' using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.payment_methods
        where code = p_payment_method_code
          and active = true
          and kind in ('cash', 'pix', 'debit', 'credit', 'voucher')
    ) then
        raise exception 'Selecione uma forma de pagamento válida.' using errcode = '22023';
    end if;

    v_notes := nullif(btrim(coalesce(p_notes, '')), '');

    if v_notes is not null and char_length(v_notes) > 500 then
        raise exception 'A observação deve ter no máximo 500 caracteres.'
            using errcode = '22023';
    end if;

    insert into public.credit_purchases (
        profile_id, amount, payment_method_code, purchased_on,
        status, source, notes, reviewed_at, reviewed_by, created_by
    ) values (
        p_profile_id, p_amount, p_payment_method_code, p_purchased_on,
        'approved', 'staff', v_notes, now(), auth.uid(), auth.uid()
    )
    returning id into v_id;

    return v_id;
end;
$$;

comment on function public.issue_credit(uuid, numeric, text, date, text) is
    'Staff issues an approved credit for a registered member.';

create or replace function public.review_credit(
    p_credit_id uuid,
    p_approve boolean
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_status text;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para revisar créditos.'
            using errcode = '42501';
    end if;

    select status into v_status
    from public.credit_purchases
    where id = p_credit_id
    for update;

    if not found then
        raise exception 'Crédito não encontrado.' using errcode = '22023';
    end if;

    if v_status <> 'pending' then
        raise exception 'Este crédito já foi revisado.' using errcode = '22023';
    end if;

    update public.credit_purchases
       set status = case when p_approve then 'approved' else 'rejected' end,
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = p_credit_id;
end;
$$;

comment on function public.review_credit(uuid, boolean) is
    'Approves or rejects a pending credit request. Reviewed rows are final.';

create or replace function public.request_credit(
    p_amount numeric,
    p_payment_method_code text,
    p_purchased_on date,
    p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
    v_notes text;
begin
    if current_user_role() <> 'member' then
        raise exception 'Apenas clientes podem solicitar créditos.'
            using errcode = '42501';
    end if;

    if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
        raise exception 'Informe um valor válido.' using errcode = '22023';
    end if;

    if p_purchased_on is null or p_purchased_on > current_date then
        raise exception 'Informe uma data de compra válida.' using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.payment_methods
        where code = p_payment_method_code
          and active = true
          and kind in ('cash', 'pix', 'debit', 'credit', 'voucher')
    ) then
        raise exception 'Selecione uma forma de pagamento válida.' using errcode = '22023';
    end if;

    v_notes := nullif(btrim(coalesce(p_notes, '')), '');

    if v_notes is not null and char_length(v_notes) > 500 then
        raise exception 'A observação deve ter no máximo 500 caracteres.'
            using errcode = '22023';
    end if;

    insert into public.credit_purchases (
        profile_id, amount, payment_method_code, purchased_on,
        status, source, notes, created_by
    ) values (
        auth.uid(), p_amount, p_payment_method_code, p_purchased_on,
        'pending', 'site', v_notes, auth.uid()
    )
    returning id into v_id;

    return v_id;
end;
$$;

comment on function public.request_credit(numeric, text, date, text) is
    'Creates a pending credit request for the signed-in member (used by the future client site).';

revoke all on function public.issue_credit(uuid, numeric, text, date, text) from public;
grant execute on function public.issue_credit(uuid, numeric, text, date, text) to authenticated;

revoke all on function public.review_credit(uuid, boolean) from public;
grant execute on function public.review_credit(uuid, boolean) to authenticated;

revoke all on function public.request_credit(numeric, text, date, text) from public;
grant execute on function public.request_credit(numeric, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Cash ledger: an approved credit purchase is money in on its purchase date.
-- ---------------------------------------------------------------------------
create or replace view public.v_cash_flow_entries
with (security_invoker = true)
as
with purchase_totals as (
    select
        pu.id,
        pu.purchased_on,
        pu.paid_on,
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
        pu.paid_on,
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
    pt.paid_on,
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
left join public.accounts a on a.id = pt.account_id
where pt.paid_on is not null

union all

select
    c.purchased_on,
    'credit'::text,
    'in'::text,
    c.amount,
    coalesce(nullif(btrim(p.name), ''), 'Cliente'),
    concat_ws(' · ', pm.label, 'Créditos'),
    c.id,
    null::uuid,
    null::uuid,
    null::uuid,
    null::text,
    'Créditos'::text,
    pm.label,
    null::text,
    c.created_at
from public.credit_purchases c
join public.profiles p on p.id = c.profile_id
join public.payment_methods pm on pm.code = c.payment_method_code
where c.status = 'approved';

comment on view public.v_cash_flow_entries is
    'Derived cash ledger: receipt events, expenses, confirmed stock purchases and approved credit sales. Pending card purchases, pending credits and write-offs are not cash movements.';

grant select on public.v_cash_flow_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Monthly P&L: an approved credit purchase is revenue on its purchase date,
-- matching the cartela model (full value recognised when the client pays).
-- ---------------------------------------------------------------------------
create or replace function public.monthly_pnl(p_month date)
returns table (
    month date,
    ganho_vendas numeric,
    royalties numeric,
    bonus numeric,
    ganho_bruto numeric,
    custos_fixos numeric,
    investimentos_promocoes numeric,
    ganho_liquido numeric,
    despesas_pessoais numeric,
    pv_total numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with bounds as (
        select
            date_trunc('month', p_month)::date as month_start,
            (date_trunc('month', p_month) + interval '1 month')::date as month_end
    ),
    sales_m as (
        select
            coalesce(
                sum(s.profit) filter (
                    where dt.kind in ('sale', 'discount', 'financial')
                       or s.deal_type_code is null
                ),
                0
            ) as gain_sales,
            coalesce(sum(s.pv), 0) as pv_total
        from public.sales s
        left join public.deal_types dt on dt.code = s.deal_type_code
        cross join bounds b
        where s.sold_on >= b.month_start
          and s.sold_on < b.month_end
    ),
    credits_m as (
        select coalesce(sum(c.amount), 0) as gain_credits
        from public.credit_purchases c
        cross join bounds b
        where c.status = 'approved'
          and c.purchased_on >= b.month_start
          and c.purchased_on < b.month_end
    ),
    exp_m as (
        select
            coalesce(sum(e.amount) filter (where e.scope = 'negocio_fixo'), 0) as custos_fixos,
            coalesce(sum(e.amount) filter (where e.scope = 'negocio_variavel'), 0) as custos_variaveis,
            coalesce(sum(e.amount) filter (where e.scope = 'pessoal'), 0) as despesas_pessoais
        from public.expenses e, bounds b
        where e.incurred_on >= b.month_start
          and e.incurred_on < b.month_end
    ),
    stmt as (
        select
            coalesce(max(h.royalty_usd * coalesce(h.royalty_fx, 1)), 0) as royalties_brl,
            coalesce(max(h.bonus_usd * coalesce(h.bonus_fx, 1)), 0) as bonus_brl
        from public.herbalife_statements h, bounds b
        where h.month = b.month_start
    ),
    combined as (
        select
            s.gain_sales + cr.gain_credits as gain_sales,
            s.pv_total
        from sales_m s
        cross join credits_m cr
    )
    select
        b.month_start,
        c.gain_sales,
        st.royalties_brl,
        st.bonus_brl,
        c.gain_sales + st.royalties_brl + st.bonus_brl,
        e.custos_fixos,
        e.custos_variaveis,
        c.gain_sales + st.royalties_brl + st.bonus_brl
            - e.custos_fixos - e.custos_variaveis,
        e.despesas_pessoais,
        c.pv_total
    from bounds b
    cross join combined c
    cross join exp_m e
    cross join stmt st;
$$;

comment on function public.monthly_pnl(date) is
    'Monthly P&L for one month. Sales profit counts client sales only; approved credit purchases count as revenue on their purchase date (cartela model). Statement USD amounts are converted with their FX rate.';

create or replace view public.v_monthly_pnl
with (security_invoker = true)
as
with months as (
    select date_trunc('month', sold_on)::date as month
    from public.sales
    union
    select date_trunc('month', incurred_on)::date
    from public.expenses
    union
    select month
    from public.herbalife_statements
    union
    select date_trunc('month', purchased_on)::date
    from public.credit_purchases
    where status = 'approved'
),
sales_m as (
    select
        date_trunc('month', s.sold_on)::date as month,
        sum(s.profit) filter (
            where dt.kind in ('sale', 'discount', 'financial')
               or s.deal_type_code is null
        ) as gain_sales,
        sum(s.pv) as pv_total
    from public.sales s
    left join public.deal_types dt on dt.code = s.deal_type_code
    group by 1
),
credits_m as (
    select
        date_trunc('month', purchased_on)::date as month,
        sum(amount) as gain_credits
    from public.credit_purchases
    where status = 'approved'
    group by 1
),
exp_m as (
    select
        date_trunc('month', incurred_on)::date as month,
        sum(amount) filter (where scope = 'negocio_fixo') as custos_fixos,
        sum(amount) filter (where scope = 'negocio_variavel') as custos_variaveis,
        sum(amount) filter (where scope = 'pessoal') as despesas_pessoais
    from public.expenses
    group by 1
),
stmt as (
    select
        month,
        royalty_usd * coalesce(royalty_fx, 1) as royalty_brl,
        bonus_usd * coalesce(bonus_fx, 1) as bonus_brl
    from public.herbalife_statements
)
select
    m.month,
    coalesce(s.gain_sales, 0) + coalesce(cr.gain_credits, 0) as ganho_vendas,
    coalesce(st.royalty_brl, 0) as royalties,
    coalesce(st.bonus_brl, 0) as bonus,
    (
        coalesce(s.gain_sales, 0)
        + coalesce(cr.gain_credits, 0)
        + coalesce(st.royalty_brl, 0)
        + coalesce(st.bonus_brl, 0)
    ) as ganho_bruto,
    coalesce(e.custos_fixos, 0) as custos_fixos,
    coalesce(e.custos_variaveis, 0) as investimentos_promocoes,
    (
        coalesce(s.gain_sales, 0)
        + coalesce(cr.gain_credits, 0)
        + coalesce(st.royalty_brl, 0)
        + coalesce(st.bonus_brl, 0)
        - coalesce(e.custos_fixos, 0)
        - coalesce(e.custos_variaveis, 0)
    ) as ganho_liquido,
    coalesce(e.despesas_pessoais, 0) as despesas_pessoais,
    coalesce(s.pv_total, 0) as pv_total
from months m
left join sales_m s on s.month = m.month
left join credits_m cr on cr.month = m.month
left join exp_m e on e.month = m.month
left join stmt st on st.month = m.month
order by m.month desc;

comment on view public.v_monthly_pnl is
    'Monthly P&L for every month touched by sales, expenses, statements or approved credits. Sales profit counts client sales only; credits are revenue on the purchase date.';

grant select on public.v_monthly_pnl to authenticated;

notify pgrst, 'reload schema';
