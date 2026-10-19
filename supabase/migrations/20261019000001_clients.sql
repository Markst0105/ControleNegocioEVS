-- ---------------------------------------------------------------------------
-- Clients — normalized phones, list/detail overview and merge.
--
-- Phones are stored as entered, while phone_normalized/whatsapp_normalized
-- hold digits only for search and duplicate detection. A trigger keeps both
-- columns correct for future inserts and edits.
-- ---------------------------------------------------------------------------

alter table clients add column if not exists phone_normalized text;
alter table clients add column if not exists whatsapp_normalized text;

create or replace function fn_phone_digits(value text)
returns text
language sql
immutable
as $$
    select case
        when length(digits) between 12 and 13 and left(digits, 2) = '55'
            then substr(digits, 3)
        else nullif(digits, '')
    end
    from (
        select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as digits
    ) normalized;
$$;

update clients
set phone_normalized = fn_phone_digits(phone),
    whatsapp_normalized = fn_phone_digits(whatsapp)
where phone_normalized is distinct from fn_phone_digits(phone)
   or whatsapp_normalized is distinct from fn_phone_digits(whatsapp);

create or replace function fn_clients_sync_phone_normalized()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
    new.phone_normalized := fn_phone_digits(new.phone);
    new.whatsapp_normalized := fn_phone_digits(new.whatsapp);
    return new;
end;
$$;

drop trigger if exists trg_clients_sync_phone_normalized on clients;
create trigger trg_clients_sync_phone_normalized
before insert or update of phone, whatsapp on clients
for each row execute function fn_clients_sync_phone_normalized();

create index if not exists idx_clients_phone_normalized
    on clients (phone_normalized)
    where phone_normalized is not null;

create index if not exists idx_clients_whatsapp_normalized
    on clients (whatsapp_normalized)
    where whatsapp_normalized is not null;

comment on column clients.phone_normalized is
    'Somente dígitos do telefone; mantido pelo trigger trg_clients_sync_phone_normalized.';
comment on column clients.whatsapp_normalized is
    'Somente dígitos do WhatsApp; mantido pelo trigger trg_clients_sync_phone_normalized.';

-- ---------------------------------------------------------------------------
-- One row per client with the aggregates used by the list and detail pages.
-- security_invoker keeps the caller's RLS in effect.
-- ---------------------------------------------------------------------------

create or replace view v_client_overview
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
from clients c
left join (
    select
        client_id,
        count(*) as sales_count,
        sum(coalesce(amount_received, 0)) as total_spent,
        max(sold_on) as last_purchase_on
    from sales
    where client_id is not null
    group by client_id
) s on s.client_id = c.id
left join (
    select
        s.client_id,
        sum(
            greatest(
                coalesce(sp.amount, 0) - coalesce(sp.received_amount, 0),
                0
            )
        ) as open_amount
    from sale_payments sp
    join sales s on s.id = sp.sale_id
    where sp.received_on is null
      and s.client_id is not null
    group by s.client_id
) p on p.client_id = c.id;

comment on view v_client_overview is
    'Client list/detail aggregates: sales count, total spent, last purchase and open receivables.';

grant select on v_client_overview to authenticated;

-- The overview and client detail scan sales/payments per client.
create index if not exists idx_sales_client_sold_on
    on sales (client_id, sold_on desc)
    where client_id is not null;

create index if not exists idx_sale_payments_sale
    on sale_payments (sale_id);

create index if not exists idx_sale_payments_open
    on sale_payments (sale_id)
    where received_on is null;

-- ---------------------------------------------------------------------------
-- Merge a duplicate client into the surviving record.
-- Admin-only because it moves sales and aliases and deletes the source row.
-- ---------------------------------------------------------------------------

create or replace function merge_clients(p_source uuid, p_target uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_source_name text;
    v_source_notes text;
    v_source_phone text;
    v_source_whatsapp text;
    v_target_name text;
    v_target_notes text;
    v_target_phone text;
    v_target_whatsapp text;
    v_notes text;
begin
    if current_user_role() <> 'admin' then
        raise exception 'Apenas administradores podem mesclar clientes.'
            using errcode = '42501';
    end if;

    if p_source is null or p_target is null or p_source = p_target then
        raise exception 'Selecione dois clientes diferentes.'
            using errcode = '22023';
    end if;

    select name, notes, phone, whatsapp
      into v_source_name, v_source_notes, v_source_phone, v_source_whatsapp
      from clients
     where id = p_source
       for update;

    if not found then
        raise exception 'Cliente de origem não encontrado.'
            using errcode = 'P0002';
    end if;

    select name, notes, phone, whatsapp
      into v_target_name, v_target_notes, v_target_phone, v_target_whatsapp
      from clients
     where id = p_target
       for update;

    if not found then
        raise exception 'Cliente de destino não encontrado.'
            using errcode = 'P0002';
    end if;

    -- Sales keep their history but point at the surviving client.
    update sales
       set client_id = p_target,
           client_name_raw = v_target_name
     where client_id = p_source;

    -- Every spelling variant now resolves to the target.
    update client_aliases
       set client_id = p_target
     where client_id = p_source;

    -- Preserve the old canonical name as an alias of the target.
    insert into client_aliases (raw_name, client_id)
    values (v_source_name, p_target)
    on conflict (raw_name) do update set client_id = excluded.client_id;

    -- Keep both notes. If the target already has a different phone/WhatsApp,
    -- preserve the source contact in the notes instead of silently dropping it.
    v_notes := nullif(
        concat_ws(E'\n\n', nullif(v_target_notes, ''), nullif(v_source_notes, '')),
        ''
    );

    if v_target_phone is not null
       and v_source_phone is not null
       and v_source_phone <> v_target_phone then
        v_notes := concat_ws(E'\n', nullif(v_notes, ''),
                             'Telefone anterior (mesclado): ' || v_source_phone);
    end if;

    if v_target_whatsapp is not null
       and v_source_whatsapp is not null
       and v_source_whatsapp <> v_target_whatsapp then
        v_notes := concat_ws(E'\n', nullif(v_notes, ''),
                             'WhatsApp anterior (mesclado): ' || v_source_whatsapp);
    end if;

    update clients
       set phone = coalesce(v_target_phone, v_source_phone),
           whatsapp = coalesce(v_target_whatsapp, v_source_whatsapp),
           notes = v_notes
     where id = p_target;

    delete from clients where id = p_source;
end;
$$;

revoke all on function merge_clients(uuid, uuid) from public;
grant execute on function merge_clients(uuid, uuid) to authenticated;

comment on function merge_clients(uuid, uuid) is
    'Admin-only: move sales/aliases from p_source to p_target, merge notes and delete the source client.';
