-- ============================================================================
-- BioAvalia — RLS smoke tests (admin / operator / member)
--
-- Prerequisites: both migrations applied and seeds loaded.
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
    (select count(*) from public.v_catalog_member)                          as catalog;

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
