-- ============================================================================
-- BioAvalia — Phase 0: initial Supabase / PostgreSQL schema
-- Migration of "Controle do Negócio 2026-10.xlsx" (Herbalife EVS Mooca + CASA)
-- Language: pt-BR UI labels; English identifiers.
-- ============================================================================

-- ==== Enable UUID extension ==================================================
create extension if not exists pgcrypto;

-- ==== Profiles (app users) ====================================================
create table if not exists profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    name          text not null,
    role          text not null
                   check (role in ('admin','operator','member')),
    price_tier    text default 'retail',
    created_at    timestamptz default now()
);

comment on table profiles is 'App users. admin = full access; operator = floor staff (sales, stock, expenses); member = client (catalog + own reservations only).';

-- ==== Reference data ==========================================================

create table if not exists payment_methods (
    code          text primary key,        -- $  P  TK  1  2  3  NP  NTT ...
    label         text not null,           -- Dinheiro / PIX / Cartela / Crédito 1x / ...
    kind          text not null
                   check (kind in ('cash','pix','debit','credit','voucher','ticket','exception','financial')),
    fee_pct       numeric(5,4) default 0,  -- card/ticket fee %
    settlement_days int default 0,         -- days until amount is effectively received
    active        boolean default true,
    created_at    timestamptz default now()
);

comment on column payment_methods.code is 'Single-letter codes from the spreadsheet: $=Dinheiro, P=PIX, TK=cartela, 1/2/3=crédito parcelas, NP=não pagou, NTT=não trouxe ticket';

create table if not exists deal_types (
    code          text primary key,        -- 0  CONS  NEG  BRINDE  LEVOU  TROUXE  0.25 ...
    label         text not null,
    kind          text not null
                   check (kind in ('sale','discount','consumo','brinde','negocio','loan_out','return','financial')),
    affects_revenue boolean default true,
    affects_pv           boolean default true,
    affects_stock        boolean default true,
    active        boolean default true,
    created_at    timestamptz default now()
);

comment on column deal_types.code is 'Column D of Lançamento de Venda. CONS=consumo próprio, NEG=negócio, BRINDE=brinde, LEVOU=empréstimo saída, TROUXE=devolução, numerics = desconto %';

create table if not exists item_classes (
    code           text primary key,      -- N.I  N.E  E.A  E.X  E.AC  E.AF  N.IF
    label          text not null,
    family         text not null,         -- N.I / N.E / E.A / E.X  (for "E.A*" wildcard rollups)
    is_financial_only boolean default false, -- E.AF / N.IF: payment-only line, no cost/PV/stock
    active         boolean default true,
    created_at     timestamptz default now()
);

comment on column item_classes.family is 'Used to aggregate MDO "Espaço" classes (E.A + E.AC + E.AF) just like the workbook"s E.A* wildcard';

create table if not exists expense_categories (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,    -- Alimentação / EVS Mooca Custo Fixo / ...
    scope       text not null
                   check (scope in ('pessoal','negocio_fixo','negocio_variavel')),
    is_personal boolean default true,    -- hidden from members
    active      boolean default true,
    created_at  timestamptz default now()
);

create table if not exists accounts (
    id      uuid primary key default gen_random_uuid(),
    name    text not null unique,        -- Cash Jun / Itaú / Crédito Art Salsa
    is_bank boolean default true,
    active  boolean default true,
    created_at timestamptz default now()
);

create table if not exists locations (
    id     uuid primary key default gen_random_uuid(),
    code   text unique not null,         -- EVS  CASA  MALA  BUFFER
    label  text not null,
    active boolean default true,
    created_at timestamptz default now()
);

create table if not exists counterparties (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,    -- Amanda, Paula, Sá, Geicy, Shoudi, Yumi ...
    role_hint   text,                    -- cliente / distribuidora / funcionário
    active      boolean default true,
    created_at  timestamptz default now()
);

-- ==== Catalog =================================================================

create table if not exists products (
    id               uuid primary key default gen_random_uuid(),
    sku              text unique not null,     -- #148K / apd / cmp05 ...
    name             text not null,
    kind             text not null
                      check (kind in ('ni','ne','access','supply','complement')),
    item_class       text references item_classes(code),
    pv               numeric(10,4) default 0,  -- ponto de volume (4 dp: 1.9538)
    portions_per_pack int  default 1,
    portion_label    text,                     -- "1 scoop"
    is_active        boolean default true,
    print_name       text,                     -- name on the printed menu
    created_at       timestamptz default now(),
    updated_at       timestamptz default now()
);

create table if not exists product_prices (
    id          uuid primary key default gen_random_uuid(),
    product_id  uuid not null references products(id) on delete cascade,
    tier_code   text not null,                  -- retail / t0.25 / t0.35 / t0.42 / t0.5 / bronze / prata / ouro
    price       numeric(12,2) not null,
    valid_from  date not null,
    valid_to    date,
    created_at  timestamptz default now(),
    unique (product_id, tier_code, valid_from)
);

comment on column product_prices.tier_code is 'Replaces the VLOOKUP→Novos Preços HLF chain. versioned by valid_from';

create table if not exists product_components (
    parent_id uuid not null references products(id) on delete cascade,
    child_id  uuid not null references products(id) on delete cascade,
    qty       numeric(10,4) not null default 1,
    unit_label text,
    primary key (parent_id, child_id)
);

comment on table product_components is 'Composed EVS items (aces, waffles, soups...). cost/PV = SUM(component price ÷ portions × qty)';

-- ==== Clients =================================================================

create table if not exists clients (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    name_normalized  text not null unique,
    phone            text,
    whatsapp         text,
    notes            text,
    created_at       timestamptz default now(),
    updated_at       timestamptz default now()
);

create table if not exists client_aliases (
    raw_name  text primary key,     -- "Abel (Pai Taise)" / "Abel (pai da Taise)"
    client_id uuid not null references clients(id) on delete cascade,
    created_at timestamptz default now()
);

comment on table client_aliases is 'Absorbs spelling variants found in the ledger (559 distinct raw names)';

-- ==== Sales (Lançamento de Venda) =============================================

create table if not exists sales (
    id                uuid primary key default gen_random_uuid(),
    sold_on           date not null,
    client_id         uuid references clients(id) on delete set null,
    client_name_raw   text,
    payment_method_code text references payment_methods(code),
    deal_type_code    text references deal_types(code),
    discount_pct      numeric(5,4) default 0,
    product_id        uuid references products(id) on delete set null,
    product_name_raw  text,
    origin            text check (origin in ('EVS','CASA')),
    stock_discount_pct numeric(5,4) default 0,   -- column H (price at purchase)
    obs               text,
    amount_received   numeric(12,2) default 0,   -- column I
    product_cost      numeric(12,2) default 0,   -- column J
    financial_cost    numeric(12,2) default 0,   -- column K (card/ticket fee)
    profit            numeric(12,2) generated always as
                         (amount_received - product_cost - financial_cost) stored,
    pv                numeric(10,4) default 0,   -- column M
    sale_seq          int,                       -- legacy column Z
    reservation_id    uuid,                      -- set when converted from a reservation
    legacy_row        int,                       -- row number in the source sheet
    created_at        timestamptz default now(),
    updated_at        timestamptz default now(),
    created_by        uuid references auth.users(id)
);

create index if not exists idx_sales_date on sales(sold_on);
create index if not exists idx_sales_client on sales(client_id);
create index if not exists idx_sales_product on sales(product_id);
create index if not exists idx_sales_created_by on sales(created_by);

-- ==== Installments / receivables (columns R,S / T,U / V,W) ====================

create table if not exists sale_payments (
    id           uuid primary key default gen_random_uuid(),
    sale_id      uuid not null references sales(id) on delete cascade,
    installment  int not null check (installment in (1,2,3)),
    due_on       date,                       -- NULL when the source row has an amount but no due date
    amount       numeric(12,2) not null default 0,
    method_code  text references payment_methods(code),
    fee_pct      numeric(5,4) default 0,
    received_on  date,
    received_amount numeric(12,2),
    unique (sale_id, installment)
);

create index if not exists idx_sale_payments_due on sale_payments(due_on);

comment on table sale_payments is 'Informational receivable schedule. MDO-Dia "A Receber (Cartões)" = sum(amount) grouped by due_on';

-- ==== Reservations (member reserves products; operator converts to sale) ======

create table if not exists reservations (
    id              uuid primary key default gen_random_uuid(),
    member_id       uuid not null references profiles(id) on delete cascade,
    status          text not null
                     check (status in ('open','confirmed','cancelled','converted')),
    created_at      timestamptz default now(),
    confirmed_at    timestamptz,
    converted_sale_id uuid references sales(id)
);

create index if not exists idx_reservations_member on reservations(member_id);
create index if not exists idx_reservations_status on reservations(status);

create table if not exists reservation_items (
    id          uuid primary key default gen_random_uuid(),
    reservation_id uuid not null references reservations(id) on delete cascade,
    product_id  uuid not null references products(id),
    qty         numeric(10,4) not null default 1,
    unit_price  numeric(12,2) not null,
    pv          numeric(10,4) not null default 0,
    created_at  timestamptz default now()
);

-- ==== Expenses (Lançamento Despesas / Despesas Totais) ========================

create table if not exists expenses (
    id             uuid primary key default gen_random_uuid(),
    incurred_on    date not null,
    description    text not null,
    category_id    uuid references expense_categories(id),
    account_id     uuid references accounts(id),
    amount         numeric(12,2) not null default 0,
    scope          text check (scope in ('pessoal','negocio_fixo','negocio_variavel')),
    legacy_row     int,
    created_at     timestamptz default now(),
    updated_at     timestamptz default now(),
    created_by     uuid references auth.users(id)
);

create index if not exists idx_expenses_date on expenses(incurred_on);
create index if not exists idx_expenses_category on expenses(category_id);

-- ==== Inventory (Estoque) =====================================================

create table if not exists inventory_movements (
    id             uuid primary key default gen_random_uuid(),
    product_id     uuid not null references products(id) on delete cascade,
    moved_on       date,                       -- NULL for undated legacy rows (snapshot/initial stock)
    type           text not null
                     check (type in ('purchase','sale','transfer','loan_out','loan_in','return','adjustment','count')),
    location_from  text,
    location_to    text,
    counterparty_id uuid references counterparties(id),
    qty            numeric(10,4) not null default 0,
    event_label    text,                      -- original column header text, e.g. "Mooca 5/3"
    sale_id        uuid references sales(id),
    created_at     timestamptz default now(),
    created_by     uuid references auth.users(id)
);

create index if not exists idx_inventory_product on inventory_movements(product_id);
create index if not exists idx_inventory_date on inventory_movements(moved_on);
create index if not exists idx_inventory_sale on inventory_movements(sale_id);

create table if not exists stock_counts (
    id          uuid primary key default gen_random_uuid(),
    location    text not null,
    counted_on  date not null,
    created_at  timestamptz default now(),
    created_by  uuid references auth.users(id)
);

-- ==== MDO daily manual KPIs (MDO-Dia columns B..AF) ==========================

create table if not exists daily_kpis (
    id                 uuid primary key default gen_random_uuid(),
    kpi_date           date unique not null,
    -- activities & quantities
    contatos           int default 0,
    ligacao            int default 0,
    marcacao           int default 0,
    apresentacao       int default 0,
    indicacoes         int default 0,
    convites_traga_um  int default 0,
    cliente_novo       int default 0,
    cliente_repetidor  int default 0,
    acesso_total       int default 0,
    cartelas           int default 0,
    cortesias          int default 0,
    consumo_proprio    int default 0,
    panfletos          int default 0,
    -- recruiting funnel
    convidados_hom     int default 0,
    convidados_jantar  int default 0,
    convidados_qs      int default 0,
    convidados_sts     int default 0,
    indicacoes_recru   int default 0,
    novos_consultores  int default 0,
    novos_cons_sr      int default 0,
    novos_const_sucesso int default 0,
    novos_supervisores int default 0,
    created_at         timestamptz default now(),
    updated_at         timestamptz default now(),
    created_by         uuid references auth.users(id)
);

create index if not exists idx_daily_kpis_date on daily_kpis(kpi_date);

-- ==== Herbalife monthly statements (Consolidado N/O/P/Q) ======================

create table if not exists herbalife_statements (
    month       date primary key,   -- first day of month
    royalty_usd numeric(12,2),
    royalty_fx  numeric(12,4),
    bonus_usd   numeric(12,2),
    bonus_fx    numeric(12,4),
    raw_json    jsonb,
    updated_at  timestamptz default now()
);

-- ==== Audit log ===============================================================

create table if not exists audit_log (
    id          uuid primary key default gen_random_uuid(),
    table_name  text not null,
    row_id      uuid,
    action      text not null check (action in ('insert','update','delete')),
    old_data    jsonb,
    new_data    jsonb,
    changed_by  uuid references auth.users(id),
    changed_at  timestamptz default now()
);

-- ==== Helpers =================================================================

create or replace function fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- trigger registration (per table)
do $$
declare t text;
begin
    for t in (
        select tablename from pg_tables where schemaname='public'
          and tablename in ('products','clients','sales','expenses','inventory_movements','daily_kpis','reservations','reservation_items','herbalife_statements')
    ) loop
        execute format($f$
            drop trigger if exists trg_%I_updated_at on public.%I;
            create trigger trg_%I_updated_at
            before update on public.%I
            for each row execute function fn_set_updated_at()
        $f$, t, t, t, t);
    end loop;
end $$;

-- ==== Circumstantial constraints (added after both tables exist) ==============

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'sales_reservation_id_fkey') then
        alter table sales
            add constraint sales_reservation_id_fkey
            foreign key (reservation_id) references reservations(id) on delete set null;
    end if;
end $$;

-- tier price lookup (replaces VLOOKUP+ROUNDUP chain)
create or replace function fn_tier_price(p_product_id uuid, p_tier_code text, p_on date)
returns numeric(12,2)
language plpgsql
as $$
declare
    v_price numeric(12,2);
begin
    select price into v_price
    from product_prices
    where product_id = p_product_id
      and tier_code = p_tier_code
      and valid_from <= p_on
      and (valid_to is null or valid_to >= p_on)
    order by valid_from desc
    limit 1;
    return coalesce(v_price, 0);
end;
$$;

-- ==== Row Level Security ======================================================
-- NOTE: enable per table in the follow-up migration (20261018000002_rls.sql)
