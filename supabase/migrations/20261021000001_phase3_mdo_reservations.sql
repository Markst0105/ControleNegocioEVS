-- ============================================================================
-- BioAvalia — Phase 3: MDO, reservations and the member catalog
--
-- MDO uses the existing daily_kpis table (730 days already imported).
-- This migration adds:
--   * the member's own tier price to the member-safe catalog;
--   * a reservation overview view used by both the operator and member areas;
--   * transactional create/convert functions so prices are resolved server-side;
--   * reservation guards so a member cannot confirm/convert their own reservation
--     or change item prices through the REST API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Member catalog: keep the original columns, add the member tier and price.
-- The view stays owner-defined (not security_invoker) so members can read the
-- catalog without access to product_prices or other profiles.
-- ---------------------------------------------------------------------------
drop view if exists public.v_catalog_member;

create view public.v_catalog_member as
with latest_prices as (
    select distinct on (product_id, tier_code)
        product_id,
        tier_code,
        price
    from public.product_prices
    where valid_from <= current_date
      and (valid_to is null or valid_to >= current_date)
    order by product_id, tier_code, valid_from desc
)
select
    p.id,
    p.sku,
    p.name,
    p.kind,
    p.portions_per_pack,
    p.portion_label,
    max(lp.price) filter (where lp.tier_code = 'retail') as retail_price,
    p.pv,
    p.is_active,
    p.print_name,
    coalesce(nullif(me.price_tier, ''), 'retail') as member_tier_code,
    coalesce(
        max(lp.price) filter (
            where lp.tier_code = coalesce(nullif(me.price_tier, ''), 'retail')
        ),
        max(lp.price) filter (where lp.tier_code = 'retail')
    ) as member_price
from public.products p
join latest_prices rp
  on rp.product_id = p.id and rp.tier_code = 'retail'
left join latest_prices lp on lp.product_id = p.id
left join public.profiles me on me.id = auth.uid()
where p.is_active = true
group by
    p.id,
    p.sku,
    p.name,
    p.kind,
    p.portions_per_pack,
    p.portion_label,
    p.pv,
    p.is_active,
    p.print_name,
    coalesce(nullif(me.price_tier, ''), 'retail');

comment on view public.v_catalog_member is
    'Member-safe catalog with retail and the signed-in member tier price.';

grant select on public.v_catalog_member to authenticated;

-- The initial schema registered fn_set_updated_at on these two tables, but
-- did not give them an updated_at column. No reservation had been updated
-- before Phase 3; conversion and cancellation now do.
alter table public.reservations
    add column if not exists updated_at timestamptz default now();
alter table public.reservation_items
    add column if not exists updated_at timestamptz default now();

-- ---------------------------------------------------------------------------
-- Reservation overview. security_invoker keeps member access scoped by RLS;
-- operators see every member reservation.
-- ---------------------------------------------------------------------------
create or replace view public.v_reservation_overview
with (security_invoker = true)
as
select
    r.id,
    r.member_id,
    pr.name as member_name,
    r.status,
    r.created_at,
    r.confirmed_at,
    r.converted_sale_id,
    coalesce(i.item_count, 0)::int as item_count,
    coalesce(i.total_qty, 0)::numeric(12,4) as total_qty,
    coalesce(i.total, 0)::numeric(12,2) as total,
    coalesce(i.pv_total, 0)::numeric(12,4) as pv_total,
    coalesce(s.sale_count, 0)::int as sale_count,
    coalesce(s.sales_total, 0)::numeric(12,2) as sales_total,
    r.updated_at
from public.reservations r
join public.profiles pr on pr.id = r.member_id
left join lateral (
    select
        count(*) as item_count,
        sum(ri.qty) as total_qty,
        sum(ri.qty * ri.unit_price) as total,
        sum(ri.qty * ri.pv) as pv_total
    from public.reservation_items ri
    where ri.reservation_id = r.id
) i on true
left join lateral (
    select
        count(*) as sale_count,
        sum(sa.amount_received) as sales_total
    from public.sales sa
    where sa.reservation_id = r.id
) s on true;

comment on view public.v_reservation_overview is
    'Reservation totals, member name and converted-sale totals.';

grant select on public.v_reservation_overview to authenticated;

create index if not exists idx_sales_reservation on public.sales(reservation_id);

-- ---------------------------------------------------------------------------
-- Reservation item sanity checks (new rows only).
-- ---------------------------------------------------------------------------
alter table public.reservation_items
    drop constraint if exists reservation_items_qty_check;
alter table public.reservation_items
    add constraint reservation_items_qty_check check (qty > 0 and qty <= 1000);

alter table public.reservation_items
    drop constraint if exists reservation_items_price_check;
alter table public.reservation_items
    add constraint reservation_items_price_check
    check (unit_price >= 0 and pv >= 0);

-- ---------------------------------------------------------------------------
-- Members may only create/read their own reservations and may only cancel an
-- open reservation. Status changes and converted-sale links are operator work.
-- ---------------------------------------------------------------------------
create or replace function public.fn_guard_member_reservation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
    -- Seed/service-role writes have no JWT; only enforce the member path when
    -- an authenticated user is present. Authenticated members land here.
    if auth.uid() is null or current_user_role() <> 'member' then
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    if tg_op = 'INSERT' then
        if new.member_id <> auth.uid() then
            raise exception 'Você só pode criar reservas para a sua conta.'
                using errcode = '42501';
        end if;
        if new.status <> 'open' then
            raise exception 'Uma reserva nova deve ficar aberta.'
                using errcode = '42501';
        end if;
        if new.confirmed_at is not null or new.converted_sale_id is not null then
            raise exception 'Reserva inválida.' using errcode = '42501';
        end if;
        return new;
    end if;

    if tg_op = 'UPDATE' then
        if old.member_id <> auth.uid()
           or new.member_id <> old.member_id
           or new.id <> old.id
           or new.created_at is distinct from old.created_at
           or new.converted_sale_id is distinct from old.converted_sale_id
           or new.confirmed_at is distinct from old.confirmed_at then
            raise exception 'Você não pode alterar os dados desta reserva.'
                using errcode = '42501';
        end if;
        if old.status <> 'open' or new.status not in ('open', 'cancelled') then
            raise exception 'Você só pode cancelar uma reserva aberta.'
                using errcode = '42501';
        end if;
        return new;
    end if;

    if old.status <> 'open' then
        raise exception 'Você só pode excluir uma reserva aberta.'
            using errcode = '42501';
    end if;
    return old;
end;
$$;

drop trigger if exists trg_guard_member_reservation on public.reservations;
create trigger trg_guard_member_reservation
before insert or update or delete on public.reservations
for each row execute function public.fn_guard_member_reservation();

create or replace function public.fn_guard_member_reservation_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_reservation_id uuid;
    v_member_id uuid;
    v_status text;
    v_tier text;
    v_price numeric(12,2);
    v_pv numeric(10,4);
begin
    if auth.uid() is null or current_user_role() <> 'member' then
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    if tg_op in ('UPDATE', 'DELETE') then
        raise exception 'Cancele a reserva e crie outra para alterar os itens.'
            using errcode = '42501';
    end if;

    v_reservation_id := new.reservation_id;

    select r.member_id, r.status, coalesce(nullif(pr.price_tier, ''), 'retail')
      into v_member_id, v_status, v_tier
    from public.reservations r
    join public.profiles pr on pr.id = r.member_id
    where r.id = v_reservation_id;

    if v_member_id is distinct from auth.uid() or v_status <> 'open' then
        raise exception 'Esta reserva não está aberta para novos itens.'
            using errcode = '42501';
    end if;

    select p.pv,
           coalesce(
               nullif(fn_tier_price(p.id, v_tier, current_date), 0),
               fn_tier_price(p.id, 'retail', current_date)
           )
      into v_pv, v_price
    from public.products p
    where p.id = new.product_id and p.is_active = true;

    if v_price is null or v_price <= 0 then
        raise exception 'Produto sem preço de tabela.' using errcode = '22023';
    end if;
    if new.unit_price <> v_price or new.pv <> coalesce(v_pv, 0) then
        raise exception 'O preço da reserva é definido pela tabela.'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_guard_member_reservation_item on public.reservation_items;
create trigger trg_guard_member_reservation_item
before insert or update or delete on public.reservation_items
for each row execute function public.fn_guard_member_reservation_item();

-- ---------------------------------------------------------------------------
-- Profiles are self-editable, but role and price tier are not. Without this
-- guard a member could update their own profile to admin through PostgREST.
-- Service-role/seed writes have no JWT and pass through.
-- ---------------------------------------------------------------------------
create or replace function public.fn_guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or current_user_role() = 'admin' then
        return new;
    end if;

    if new.role is distinct from old.role then
        raise exception 'Somente um administrador pode alterar papéis.'
            using errcode = '42501';
    end if;

    if new.price_tier is distinct from old.price_tier then
        raise exception 'Somente um administrador pode alterar a faixa de preço.'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
before update on public.profiles
for each row execute function public.fn_guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Create a reservation atomically. Prices always come from the member's tier
-- (retail fallback), never from the browser. Members may only reserve for
-- themselves; operators may choose a member.
-- ---------------------------------------------------------------------------
create or replace function public.create_reservation(
    p_member_id uuid,
    p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_role text := current_user_role();
    v_member_id uuid;
    v_member_tier text;
    v_reservation_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_qty numeric;
    v_price numeric(12,2);
    v_pv numeric(10,4);
    v_count int := 0;
begin
    if v_role not in ('admin', 'operator', 'member') then
        raise exception 'Sua conta não tem permissão para reservar.'
            using errcode = '42501';
    end if;

    if v_role = 'member' then
        v_member_id := auth.uid();
        if p_member_id is not null and p_member_id <> v_member_id then
            raise exception 'Você só pode reservar para a sua conta.'
                using errcode = '42501';
        end if;
    else
        v_member_id := p_member_id;
    end if;

    if v_member_id is null then
        raise exception 'Selecione o membro da reserva.' using errcode = '22023';
    end if;

    select id, coalesce(nullif(price_tier, ''), 'retail')
      into v_member_id, v_member_tier
    from public.profiles
    where id = v_member_id and role = 'member';

    if v_member_id is null then
        raise exception 'Membro não encontrado.' using errcode = '22023';
    end if;

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'Adicione pelo menos um produto à reserva.'
            using errcode = '22023';
    end if;

    if jsonb_array_length(p_items) > 50 then
        raise exception 'Uma reserva pode ter no máximo 50 itens.'
            using errcode = '22023';
    end if;

    insert into public.reservations (member_id, status)
    values (v_member_id, 'open')
    returning id into v_reservation_id;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        v_product_id := nullif(trim(v_item ->> 'product_id'), '')::uuid;
        v_qty := nullif(trim(v_item ->> 'qty'), '')::numeric;

        if v_product_id is null then
            raise exception 'Produto inválido na reserva.' using errcode = '22023';
        end if;
        if v_qty is null or v_qty <= 0 or v_qty > 1000 then
            raise exception 'Informe uma quantidade entre 0 e 1000.'
                using errcode = '22023';
        end if;

        select p.pv,
               coalesce(
                   nullif(fn_tier_price(p.id, v_member_tier, current_date), 0),
                   fn_tier_price(p.id, 'retail', current_date)
               )
          into v_pv, v_price
        from public.products p
        where p.id = v_product_id and p.is_active = true;

        if v_price is null or v_price <= 0 then
            raise exception 'Produto sem preço de tabela para este membro.'
                using errcode = '22023';
        end if;

        insert into public.reservation_items (
            reservation_id, product_id, qty, unit_price, pv
        ) values (
            v_reservation_id, v_product_id, v_qty, v_price, coalesce(v_pv, 0)
        );

        v_count := v_count + 1;
    end loop;

    if v_count = 0 then
        raise exception 'Adicione pelo menos um produto à reserva.'
            using errcode = '22023';
    end if;

    return v_reservation_id;
end;
$$;

revoke all on function public.create_reservation(uuid, jsonb) from public;
grant execute on function public.create_reservation(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Convert a reservation into one sale per item. The operation is atomic:
-- either every sale, payment schedule and stock movement is written, or none.
-- The first sale id is stored in reservations.converted_sale_id for the UI.
-- ---------------------------------------------------------------------------
create or replace function public.convert_reservation(
    p_reservation_id uuid,
    p_sold_on date,
    p_origin text,
    p_payment_method_code text,
    p_deal_type_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_member_id uuid;
    v_member_name text;
    v_status text;
    v_item record;
    v_sale_id uuid;
    v_first_sale_id uuid;
    v_method_kind text;
    v_method_fee numeric(5,4);
    v_settlement_days int;
    v_deal_kind text;
    v_affects_stock boolean;
    v_unit_cost numeric(12,2);
    v_amount numeric(12,2);
    v_installments int;
    v_total_cents bigint;
    v_base_cents bigint;
    v_installment_cents bigint;
    v_due_on date;
    v_index int;
begin
    if current_user_role() not in ('admin', 'operator') then
        raise exception 'Sua conta não tem permissão para converter reservas.'
            using errcode = '42501';
    end if;

    if p_sold_on is null then
        raise exception 'Informe a data da venda.' using errcode = '22023';
    end if;
    if p_origin not in ('EVS', 'CASA') then
        raise exception 'Selecione a origem EVS ou CASA.' using errcode = '22023';
    end if;

    select kind, fee_pct, coalesce(settlement_days, 0)
      into v_method_kind, v_method_fee, v_settlement_days
    from public.payment_methods
    where code = p_payment_method_code and active = true;

    if not found then
        raise exception 'Forma de pagamento inválida.' using errcode = '22023';
    end if;

    select kind, affects_stock
      into v_deal_kind, v_affects_stock
    from public.deal_types
    where code = p_deal_type_code and active = true;

    if not found then
        raise exception 'Tipo de negócio inválido.' using errcode = '22023';
    end if;

    select r.member_id, pr.name, r.status
      into v_member_id, v_member_name, v_status
    from public.reservations r
    join public.profiles pr on pr.id = r.member_id
    where r.id = p_reservation_id
    for update of r;

    if not found then
        raise exception 'Reserva não encontrada.' using errcode = '22023';
    end if;
    if v_status not in ('open', 'confirmed') then
        raise exception 'Esta reserva não pode mais ser convertida.'
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from public.reservation_items
        where reservation_id = p_reservation_id
    ) then
        raise exception 'A reserva não tem itens.' using errcode = '22023';
    end if;

    for v_item in
        select ri.product_id, ri.qty, ri.unit_price, ri.pv, p.name as product_name
        from public.reservation_items ri
        join public.products p on p.id = ri.product_id
        where ri.reservation_id = p_reservation_id
        order by ri.created_at, ri.id
    loop
        v_amount := round(v_item.unit_price * v_item.qty, 2);

        select coalesce(unit_cost, 0)
          into v_unit_cost
        from public.v_stock_product_totals
        where product_id = v_item.product_id;
        v_unit_cost := coalesce(v_unit_cost, 0);

        insert into public.sales (
            sold_on,
            client_name_raw,
            payment_method_code,
            deal_type_code,
            discount_pct,
            product_id,
            product_name_raw,
            origin,
            amount_received,
            product_cost,
            financial_cost,
            pv,
            obs,
            reservation_id,
            created_by
        ) values (
            p_sold_on,
            v_member_name,
            p_payment_method_code,
            p_deal_type_code,
            0,
            v_item.product_id,
            v_item.product_name,
            p_origin,
            v_amount,
            round(v_unit_cost * v_item.qty, 2),
            0,
            round(v_item.pv * v_item.qty, 4),
            'Reserva convertida',
            p_reservation_id,
            auth.uid()
        )
        returning id into v_sale_id;

        if v_first_sale_id is null then
            v_first_sale_id := v_sale_id;
        end if;

        if v_method_kind in ('credit', 'ticket', 'exception') then
            v_installments := case
                when p_payment_method_code in ('1', '2', '3')
                    then p_payment_method_code::int
                else 1
            end;
            v_total_cents := round(v_amount * 100);
            v_base_cents := floor(v_total_cents / v_installments);

            for v_index in 1..v_installments
            loop
                v_installment_cents := case
                    when v_index = v_installments
                        then v_total_cents - (v_base_cents * (v_installments - 1))
                    else v_base_cents
                end;

                v_due_on := p_sold_on + case
                    when v_method_kind = 'credit' then 30 * v_index
                    else v_settlement_days
                end;

                insert into public.sale_payments (
                    sale_id, installment, due_on, amount, method_code, fee_pct
                ) values (
                    v_sale_id,
                    v_index,
                    v_due_on,
                    v_installment_cents / 100.0,
                    p_payment_method_code,
                    v_method_fee
                );
            end loop;
        end if;

        if v_affects_stock then
            insert into public.inventory_movements (
                product_id,
                moved_on,
                type,
                location_from,
                location_to,
                qty,
                event_label,
                sale_id,
                notes,
                created_by
            ) values (
                v_item.product_id,
                p_sold_on,
                case
                    when v_deal_kind = 'return' then 'return'
                    when v_deal_kind = 'loan_out' then 'loan_out'
                    else 'sale'
                end,
                case when v_deal_kind = 'return' then null else p_origin end,
                case when v_deal_kind = 'return' then p_origin else null end,
                v_item.qty,
                'Reserva convertida',
                v_sale_id,
                null,
                auth.uid()
            );
        end if;
    end loop;

    update public.reservations
       set status = 'converted',
           confirmed_at = coalesce(confirmed_at, now()),
           converted_sale_id = v_first_sale_id
     where id = p_reservation_id;

    return v_first_sale_id;
end;
$$;

revoke all on function public.convert_reservation(uuid, date, text, text, text) from public;
grant execute on function public.convert_reservation(uuid, date, text, text, text) to authenticated;

notify pgrst, 'reload schema';
