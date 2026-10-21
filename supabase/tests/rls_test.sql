-- ============================================================================
-- BioAvalia — RLS smoke tests (admin / operator / member)
--
-- Prerequisites: all migrations applied and seeds loaded.
--
-- Run with psql (recommended):
--     psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
-- or paste this ENTIRE file into the Supabase SQL editor (it wraps itself in a
-- transaction and rolls back, so it leaves no trace).
--
-- What it does:
--   1. creates three throwaway auth users (fixed UUIDs) + profiles;
--   2. snapshots ground-truth row counts as the privileged role;
--   3. switches to `authenticated` with each user's JWT claims and records
--      pass/fail checks in a temp table;
--   4. prints the results and ROLLS BACK everything.
--
-- Expected output: every line PASS.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. throwaway users (rolled back at the end)
-- ---------------------------------------------------------------------------
insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
    ('00000000-0000-0000-0000-000000000000',
     'a0000000-0000-4000-8000-000000000001',
     'authenticated', 'authenticated', 'rls-admin@test.local',
     '$2a$10$01234567890123456789012345678901234567890123456789012', now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b0000000-0000-4000-8000-000000000002',
     'authenticated', 'authenticated', 'rls-operator@test.local',
     '$2a$10$01234567890123456789012345678901234567890123456789012', now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'c0000000-0000-4000-8000-000000000003',
     'authenticated', 'authenticated', 'rls-member@test.local',
     '$2a$10$01234567890123456789012345678901234567890123456789012', now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, name, role) values
    ('a0000000-0000-4000-8000-000000000001', 'RLS Test Admin',    'admin'),
    ('b0000000-0000-4000-8000-000000000002', 'RLS Test Operator', 'operator'),
    ('c0000000-0000-4000-8000-000000000003', 'RLS Test Member',   'member')
on conflict (id) do update set role = excluded.role;

-- a reservation owned by the admin: the member must NOT see it
insert into public.reservations (member_id, status)
values ('a0000000-0000-4000-8000-000000000001', 'open');

-- one owned by the member: the member must see exactly this one
insert into public.reservations (member_id, status)
values ('c0000000-0000-4000-8000-000000000003', 'open');

-- ---------------------------------------------------------------------------
-- 2. ground truth + results table (privileged role, RLS bypassed)
-- ---------------------------------------------------------------------------
create temp table rls_truth as
select
    (select count(*) from public.sales)                                     as sales,
    (select count(*) from public.clients)                                   as clients,
    (select count(*) from public.expenses)                                  as expenses,
    (select count(*) from public.expenses
      where scope in ('negocio_fixo','negocio_variavel'))                   as expenses_negocio,
    (select count(*) from public.expenses where scope = 'pessoal')          as expenses_pessoal,
    (select count(*) from public.v_catalog_member)                          as catalog,
    (select count(*) from public.v_price_catalog)                           as price_catalog;

create temp table rls_results (ord int, test text, pass boolean);
grant all on pg_temp.rls_results to authenticated;
grant select on pg_temp.rls_truth to authenticated;

-- ===========================================================================
-- ADMIN — full access
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', 'a0000000-0000-4000-8000-000000000001')::text,
                  true);

insert into pg_temp.rls_results
select 1, 'admin: vê todas as vendas', (select count(*) from public.sales) = (select sales from rls_truth);
insert into pg_temp.rls_results
select 2, 'admin: vê todas as despesas (incl. pessoais)', (select count(*) from public.expenses) = (select expenses from rls_truth);
insert into pg_temp.rls_results
select 3, 'admin: vê clientes', (select count(*) from public.clients) = (select clients from rls_truth);

-- ===========================================================================
-- OPERATOR — operations only, no sensitive data
-- ===========================================================================
select set_config('request.jwt.claims',
                  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002')::text,
                  true);

insert into pg_temp.rls_results
select 4, 'operador: vê todas as vendas', (select count(*) from public.sales) = (select sales from rls_truth);
insert into pg_temp.rls_results
select 5, 'operador: vê clientes', (select count(*) from public.clients) = (select clients from rls_truth);
insert into pg_temp.rls_results
select 6, 'operador: NÃO vê despesas pessoais', (select count(*) from public.expenses where scope = 'pessoal') = 0;
insert into pg_temp.rls_results
select 7, 'operador: vê apenas despesas do negócio',
       (select count(*) from public.expenses) = (select expenses_negocio from rls_truth);
insert into pg_temp.rls_results
select 8, 'operador: NÃO vê extratos Herbalife (royalties)', (select count(*) from public.herbalife_statements) = 0;
insert into pg_temp.rls_results
select 9, 'operador: NÃO vê trilha de auditoria', (select count(*) from public.audit_log) = 0;
insert into pg_temp.rls_results
select 10, 'operador: vê cadastro de membro (para reservas)', (select count(*) from public.profiles where role = 'member') = 1;
insert into pg_temp.rls_results
select 11, 'operador: NÃO vê perfis de outros operadores/admins', (select count(*) from public.profiles where role = 'admin') = 0;

-- ===========================================================================
-- MEMBER — own reservations + catalog only
-- ===========================================================================
select set_config('request.jwt.claims',
                  json_build_object('sub', 'c0000000-0000-4000-8000-000000000003')::text,
                  true);

insert into pg_temp.rls_results
select 12, 'membro: NÃO vê vendas', (select count(*) from public.sales) = 0;
insert into pg_temp.rls_results
select 13, 'membro: NÃO vê despesas', (select count(*) from public.expenses) = 0;
insert into pg_temp.rls_results
select 14, 'membro: NÃO vê clientes', (select count(*) from public.clients) = 0;
insert into pg_temp.rls_results
select 15, 'membro: NÃO vê P&L mensal (v_monthly_pnl)', (select count(*) from public.v_monthly_pnl) = 0;
insert into pg_temp.rls_results
select 16, 'membro: vê o catálogo (v_catalog_member)', (select count(*) from public.v_catalog_member) = (select catalog from rls_truth);
insert into pg_temp.rls_results
select 17, 'membro: vê o próprio perfil', (select count(*) from public.profiles) = 1;
insert into pg_temp.rls_results
select 18, 'membro: vê apenas as próprias reservas', (select count(*) from public.reservations) = 1;

-- member creates a reservation for themselves (must succeed)
insert into public.reservations (member_id, status)
values ('c0000000-0000-4000-8000-000000000003', 'open');

insert into pg_temp.rls_results
select 19, 'membro: cria reserva própria', (select count(*) from public.reservations) = 2;

-- operator maintains the supplier directory
select set_config('request.jwt.claims',
                  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002')::text,
                  true);

insert into public.counterparties (name, role_hint, active)
values ('Fornecedor RLS', 'supplier', true);

insert into pg_temp.rls_results
select 20, 'operador: cadastra fornecedor',
       (select count(*) from public.counterparties where name = 'Fornecedor RLS') = 1;

update public.counterparties set active = false where name = 'Fornecedor RLS';

insert into pg_temp.rls_results
select 21, 'operador: edita fornecedor',
       (select active from public.counterparties where name = 'Fornecedor RLS') = false;

select set_config('request.jwt.claims',
                  json_build_object('sub', 'c0000000-0000-4000-8000-000000000003')::text,
                  true);

insert into pg_temp.rls_results
select 22, 'membro: NÃO vê fornecedores', (select count(*) from public.counterparties) = 0;

-- operator reads the price catalog; the security_invoker view keeps it from members
select set_config('request.jwt.claims',
                  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002')::text,
                  true);

insert into pg_temp.rls_results
select 23, 'operador: vê a tabela de preços',
       (select count(*) from public.v_price_catalog) = (select price_catalog from rls_truth);

select set_config('request.jwt.claims',
                  json_build_object('sub', 'c0000000-0000-4000-8000-000000000003')::text,
                  true);

insert into pg_temp.rls_results
select 24, 'membro: NÃO vê a tabela de preços',
       (select count(*) from public.v_price_catalog) = 0;

-- ---------------------------------------------------------------------------
-- Phase 3: reservation guards and conversion
-- ---------------------------------------------------------------------------
-- add one catalog item to the member's own open reservation
insert into public.reservation_items (reservation_id, product_id, qty, unit_price, pv)
select r.id, c.id, 1, c.retail_price, coalesce(c.pv, 0)
from public.reservations r
cross join lateral (
    select id, retail_price, pv from public.v_catalog_member limit 1
) c
where r.member_id = auth.uid() and r.status = 'open'
order by r.created_at desc
limit 1;

do $$
declare v_blocked boolean := false;
begin
    begin
        update public.reservations
           set status = 'confirmed', confirmed_at = now()
         where member_id = auth.uid() and status = 'open';
    exception when insufficient_privilege then
        v_blocked := true;
    end;

    insert into pg_temp.rls_results
    values (25, 'membro: NÃO confirma a própria reserva', v_blocked);
end $$;

do $$
declare v_blocked boolean := false;
begin
    begin
        update public.reservation_items
           set unit_price = 0
         where reservation_id in (
             select id from public.reservations where member_id = auth.uid()
         );
    exception when insufficient_privilege then
        v_blocked := true;
    end;

    insert into pg_temp.rls_results
    values (26, 'membro: NÃO altera o preço da reserva', v_blocked);
end $$;

select set_config('request.jwt.claims',
                  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002')::text,
                  true);

update public.reservations
   set status = 'confirmed', confirmed_at = now()
 where member_id = 'c0000000-0000-4000-8000-000000000003'
   and status = 'open';

insert into pg_temp.rls_results
select 27, 'operador: confirma reserva do membro',
       (select count(*) from public.reservations
         where member_id = 'c0000000-0000-4000-8000-000000000003'
           and status = 'confirmed') >= 1;

do $$
declare
    v_reservation_id uuid;
    v_sale_id uuid;
begin
    select id into v_reservation_id
    from public.reservations
    where member_id = 'c0000000-0000-4000-8000-000000000003'
      and status = 'confirmed'
    order by created_at desc
    limit 1;

    v_sale_id := public.convert_reservation(
        v_reservation_id, current_date, 'EVS', 'P', '0'
    );

    insert into pg_temp.rls_results
    values (28, 'operador: converte reserva em venda',
            (select count(*) from public.sales
              where id = v_sale_id
                and reservation_id = v_reservation_id) = 1);
end $$;

select set_config('request.jwt.claims',
                  json_build_object('sub', 'c0000000-0000-4000-8000-000000000003')::text,
                  true);

insert into pg_temp.rls_results
select 29, 'membro: vê a própria reserva convertida',
       (select count(*) from public.v_reservation_overview
         where status = 'converted') = 1;

do $$
declare v_blocked boolean := false;
begin
    begin
        update public.profiles set role = 'admin' where id = auth.uid();
        raise exception 'unexpected role change' using errcode = 'P0001';
    exception
        when insufficient_privilege then v_blocked := true;
        when sqlstate 'P0001' then v_blocked := false;
    end;

    insert into pg_temp.rls_results
    values (30, 'membro: NÃO eleva o próprio papel', v_blocked);
end $$;

do $$
declare v_blocked boolean := false;
begin
    begin
        update public.profiles set price_tier = 'ouro' where id = auth.uid();
        raise exception 'unexpected tier change' using errcode = 'P0001';
    exception
        when insufficient_privilege then v_blocked := true;
        when sqlstate 'P0001' then v_blocked := false;
    end;

    insert into pg_temp.rls_results
    values (31, 'membro: NÃO altera a própria faixa de preço', v_blocked);
end $$;

update public.profiles set name = 'RLS Test Member Editado' where id = auth.uid();

insert into pg_temp.rls_results
select 32, 'membro: edita o próprio nome',
       (select name from public.profiles where id = auth.uid()) = 'RLS Test Member Editado';

-- ---------------------------------------------------------------------------
-- Phase 2c: operators may write business expenses, never personal ones
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002')::text,
                  true);

insert into public.expenses (incurred_on, description, amount, scope)
values (current_date, 'RLS business expense', 10, 'negocio_variavel');

insert into pg_temp.rls_results
select 33, 'operador: lança despesa do negócio',
       (select count(*) from public.expenses
         where description = 'RLS business expense') = 1;

do $$
declare v_blocked boolean := false;
begin
    begin
        insert into public.expenses (incurred_on, description, amount, scope)
        values (current_date, 'RLS personal expense', 10, 'pessoal');
    exception when insufficient_privilege then
        v_blocked := true;
    end;

    insert into pg_temp.rls_results
    values (34, 'operador: NÃO lança despesa pessoal', v_blocked);
end $$;

do $$
declare v_blocked boolean := false;
begin
    begin
        update public.expenses
           set scope = 'pessoal'
         where description = 'RLS business expense';
    exception when insufficient_privilege then
        v_blocked := true;
    end;

    insert into pg_temp.rls_results
    values (35, 'operador: NÃO reclassifica despesa como pessoal', v_blocked);
end $$;

delete from public.expenses where description = 'RLS business expense';

insert into pg_temp.rls_results
select 36, 'operador: exclui despesa do negócio',
       (select count(*) from public.expenses
         where description = 'RLS business expense') = 0;

-- ---------------------------------------------------------------------------
-- 3. results
-- ---------------------------------------------------------------------------
reset role;

select
    ord,
    test,
    case when pass then 'PASS' else 'FAIL' end as result
from rls_results
order by ord;

rollback;
