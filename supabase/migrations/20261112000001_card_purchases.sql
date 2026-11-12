-- ---------------------------------------------------------------------------
-- Card purchases are pending until the card transaction is checked.
--
-- A purchase paid from a credit-card account does not leave the bank account
-- at the purchase date; each transaction is confirmed later, when the card
-- statement is checked. This migration:
--   * marks credit-card accounts (`Crédito …` / `Cartão …`) explicitly;
--   * adds `purchases.paid_on` — the date the purchase actually left cash;
--   * backfills non-card purchases as paid on the purchase date;
--   * exposes both fields in `v_purchase_overview`;
--   * keeps pending card purchases out of `v_cash_flow_entries`;
--   * makes `create_purchase` leave card purchases pending;
--   * adds `set_purchase_paid_on` for the per-transaction confirmation.
-- ---------------------------------------------------------------------------

alter table public.accounts
    add column if not exists is_credit_card boolean not null default false;

update public.accounts
set is_credit_card = true
where is_credit_card = false
  and (
      name ilike 'crédito%'
      or name ilike 'credito%'
      or name ilike 'cartão%'
      or name ilike 'cartao%'
  );

comment on column public.accounts.is_credit_card is
    'Card accounts: purchases stay pending until the card transaction is confirmed.';

alter table public.purchases
    add column if not exists paid_on date;

comment on column public.purchases.paid_on is
    'Date the purchase left cash. NULL while a card purchase is pending confirmation.';

-- Non-card purchases (and purchases without an account) were paid on the
-- purchase date. Card purchases stay pending.
update public.purchases pu
set paid_on = pu.purchased_on
where pu.paid_on is null
  and not exists (
      select 1
      from public.accounts a
      where a.id = pu.account_id
        and a.is_credit_card
  );

create index if not exists idx_purchases_paid_on
    on public.purchases (paid_on);

-- ---------------------------------------------------------------------------
-- Purchase overview gains the payment status.
-- ---------------------------------------------------------------------------
drop view if exists public.v_purchase_overview;

create view public.v_purchase_overview
with (security_invoker = true)
as
select
    pu.id,
    pu.purchased_on,
    pu.supplier_id,
    pu.account_id,
    pu.location_code,
    pu.invoice_no,
    pu.notes,
    pu.created_at,
    pu.paid_on,
    c.name as supplier_name,
    a.name as account_name,
    coalesce(a.is_credit_card, false) as is_credit_card,
    count(pi.id)::bigint as item_count,
    coalesce(sum(pi.qty), 0)::numeric as total_units,
    coalesce(sum(pi.qty * pi.unit_cost), 0)::numeric as total_cost
from public.purchases pu
left join public.counterparties c on c.id = pu.supplier_id
left join public.accounts a on a.id = pu.account_id
left join public.purchase_items pi on pi.purchase_id = pu.id
group by
    pu.id, pu.purchased_on, pu.supplier_id, pu.account_id, pu.location_code,
    pu.invoice_no, pu.notes, pu.created_at, pu.paid_on,
    c.name, a.name, a.is_credit_card;

comment on view public.v_purchase_overview is
    'Purchase header with supplier/account names, item count, total cost and card payment status.';

grant select on public.v_purchase_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Cash ledger: a purchase enters only when it has a payment date, and it
-- enters on that date (not on the purchase date).
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
where pt.paid_on is not null;

comment on view public.v_cash_flow_entries is
    'Derived cash ledger: receipt events, expenses and confirmed stock purchases. Pending card purchases and write-offs are not cash movements.';

grant select on public.v_cash_flow_entries to authenticated;

-- ---------------------------------------------------------------------------
-- create_purchase: card purchases stay pending (paid_on = NULL).
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase(
    p_purchased_on date,
    p_supplier_id uuid,
    p_account_id uuid,
    p_location_code text,
    p_invoice_no text,
    p_notes text,
    p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_purchase_id uuid;
    v_location text;
    v_invoice text;
    v_notes text;
    v_item jsonb;
    v_product_id uuid;
    v_qty numeric;
    v_unit_cost numeric;
    v_price_tier text;
    v_is_credit_card boolean := false;
    v_count int := 0;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para registrar compras.'
            using errcode = '42501';
    end if;

    if p_purchased_on is null then
        raise exception 'Informe a data da compra.' using errcode = '22023';
    end if;

    select code into v_location
    from public.locations
    where code = p_location_code and active = true;

    if v_location is null then
        raise exception 'Local de destino inválido.' using errcode = '22023';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'Adicione pelo menos um produto à compra.' using errcode = '22023';
    end if;

    if p_account_id is not null then
        select coalesce(is_credit_card, false)
          into v_is_credit_card
          from public.accounts
         where id = p_account_id;

        v_is_credit_card := coalesce(v_is_credit_card, false);
    end if;

    v_invoice := nullif(trim(coalesce(p_invoice_no, '')), '');
    v_notes := nullif(trim(coalesce(p_notes, '')), '');

    insert into public.purchases (
        purchased_on, supplier_id, account_id, location_code,
        invoice_no, notes, paid_on, created_by
    ) values (
        p_purchased_on, p_supplier_id, p_account_id, v_location,
        v_invoice, v_notes,
        case when v_is_credit_card then null else p_purchased_on end,
        auth.uid()
    )
    returning id into v_purchase_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
        v_qty := nullif(trim(v_item ->> 'qty'), '')::numeric;
        v_unit_cost := coalesce(nullif(trim(v_item ->> 'unit_cost'), '')::numeric, 0);
        v_price_tier := nullif(trim(coalesce(v_item ->> 'price_tier', '')), '');

        if v_product_id is null
           or not exists (select 1 from public.products where id = v_product_id) then
            raise exception 'Produto inválido na compra.' using errcode = '22023';
        end if;

        if v_qty is null or v_qty <= 0 then
            raise exception 'Informe uma quantidade maior que zero.' using errcode = '22023';
        end if;

        if v_unit_cost < 0 then
            raise exception 'O custo unitário não pode ser negativo.' using errcode = '22023';
        end if;

        if v_price_tier is not null
           and v_price_tier not in (
               'retail', 't0.25', 't0.35', 't0.42', 't0.5',
               'bronze', 'prata', 'ouro'
           ) then
            raise exception 'Faixa de preço inválida.' using errcode = '22023';
        end if;

        insert into public.purchase_items (
            purchase_id, product_id, qty, unit_cost, price_tier
        )
        values (
            v_purchase_id, v_product_id, v_qty, v_unit_cost, v_price_tier
        );

        insert into public.inventory_movements (
            product_id, moved_on, type, location_to, qty, event_label,
            purchase_id, notes, created_by
        ) values (
            v_product_id, p_purchased_on, 'purchase', v_location, v_qty,
            coalesce(v_invoice, 'Compra'), v_purchase_id, v_notes, auth.uid()
        );

        v_count := v_count + 1;
    end loop;

    if v_count = 0 then
        raise exception 'Adicione pelo menos um produto à compra.' using errcode = '22023';
    end if;

    return v_purchase_id;
end;
$$;

comment on function public.create_purchase(date, uuid, uuid, text, text, text, jsonb) is
    'Creates a purchase, its lines and one purchase movement per line atomically, including the optional price tier. Card purchases are created with paid_on = NULL.';

-- ---------------------------------------------------------------------------
-- Per-transaction card confirmation. `p_paid_on = NULL` reverts to pending.
-- ---------------------------------------------------------------------------
create or replace function public.set_purchase_paid_on(
    p_purchase_id uuid,
    p_paid_on date
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_purchased_on date;
    v_is_credit_card boolean;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para confirmar pagamentos.'
            using errcode = '42501';
    end if;

    select pu.purchased_on, coalesce(a.is_credit_card, false)
      into v_purchased_on, v_is_credit_card
      from public.purchases pu
      left join public.accounts a on a.id = pu.account_id
     where pu.id = p_purchase_id;

    if not found then
        raise exception 'Compra não encontrada.' using errcode = '22023';
    end if;

    if not v_is_credit_card then
        raise exception 'Esta compra não foi feita no cartão.' using errcode = '22023';
    end if;

    if p_paid_on is not null and p_paid_on < v_purchased_on then
        raise exception 'A data do pagamento não pode ser anterior à compra.'
            using errcode = '22023';
    end if;

    update public.purchases
       set paid_on = p_paid_on
     where id = p_purchase_id;
end;
$$;

comment on function public.set_purchase_paid_on(uuid, date) is
    'Confirms (or reverts, with NULL) the payment date of a card purchase.';

revoke all on function public.set_purchase_paid_on(uuid, date) from public;
grant execute on function public.set_purchase_paid_on(uuid, date) to authenticated;

notify pgrst, 'reload schema';
