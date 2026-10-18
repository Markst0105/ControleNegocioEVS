#!/usr/bin/env python3
"""
BioAvalia Phase 0 ETL.

Parses "Controle do Negócio 2026-10.xlsx" with nothing but the standard
library (zipfile + xml.etree) and emits:

  supabase/seeds/001_reference_data.sql
  supabase/seeds/002_products.sql
  supabase/seeds/003_clients.sql
  supabase/seeds/004_sales.sql
  supabase/seeds/005_movements.sql
  supabase/seeds/006_expenses.sql
  supabase/seeds/007_mdo_kpis.sql
  etl/validation_report.md

Run:  python3 etl/extract.py
"""

import zipfile
import xml.etree.ElementTree as ET
import datetime
import re
import os
from collections import OrderedDict, Counter

ROOT = "/home/user/BioAvalia"
XLSX = os.path.join(ROOT, "Controle do Negócio 2026-10.xlsx")
SEED_DIR = os.path.join(ROOT, "supabase", "seeds")

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# ---------------------------------------------------------------------------
# Workbook parsing helpers
# ---------------------------------------------------------------------------
Z = zipfile.ZipFile(XLSX)

# shared strings
SST = []
for si in ET.fromstring(Z.read("xl/sharedStrings.xml")).findall(M + "si"):
    SST.append("".join(t.text or "" for t in si.iter(M + "t")))


def cell_value(c):
    """Return (value, formula_or_None). value may be None."""
    t = c.get("t")
    v = c.find(M + "v")
    f = c.find(M + "f")
    if f is not None:
        if v is not None:
            return v.text, f.text
        return None, f.text
    if t == "s" and v is not None:
        return SST[int(v.text)], None
    if t == "inlineStr":
        is_ = c.find(M + "is")
        if is_ is not None:
            return "".join(t.text or "" for t in is_.iter(M + "t")), None
        return None, None
    if v is not None:
        return v.text, None
    return None, None


SERIAL_EPOCH = datetime.date(1899, 12, 30)


def serial_to_date(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f < 10000 or f > 80000:
        return None
    return (SERIAL_EPOCH + datetime.timedelta(days=int(f))).isoformat()


def col_of(ref):
    return "".join(ch for ch in ref if ch.isalpha())


def row_of(ref):
    m = re.search(r"\d+$", ref)
    return int(m.group()) if m else None


def sheet_rows(sheet_file):
    """Yield (row_number, {col: value}) for non-empty cells, streaming."""
    with Z.open(sheet_file) as fh:
        ctx = ET.iterparse(fh, events=("end",))
        for _, el in ctx:
            if el.tag == M + "row":
                r = int(el.get("r"))
                cells = {}
                for c in el.findall(M + "c"):
                    val, _ = cell_value(c)
                    if val not in (None, ""):
                        cells[col_of(c.get("r"))] = val
                el.clear()
                if cells:
                    yield r, cells


# workbook -> sheet file map
RELS = ET.fromstring(Z.read("xl/_rels/workbook.xml.rels"))
RID2TARGET = {r.get("Id"): r.get("Target") for r in RELS}
WB = ET.fromstring(Z.read("xl/workbook.xml"))
SHEET_FILE = {}
NSR = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
for s in WB.find(M + "sheets").findall(M + "sheet"):
    name = s.get("name")
    rid = s.get(NSR + "id")
    tgt = RID2TARGET.get(rid, "")
    if tgt.startswith("worksheets/"):
        SHEET_FILE[name] = "xl/" + tgt


def sheet(name):
    return list(sheet_rows(SHEET_FILE[name]))


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------
def sql_str(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def sql_num(v):
    if v is None or v == "":
        return "NULL"
    return str(v)


def sql_date(v):
    if v is None:
        return "NULL"
    d = serial_to_date(v) if isinstance(v, str) and re.fullmatch(r"\d+(\.\d+)?", v) else v
    if d is None:
        return "NULL"
    return "'" + str(d) + "'"


os.makedirs(SEED_DIR, exist_ok=True)

seeds = {name: [] for name in [
    "001_reference_data", "002_products", "003_clients",
    "004_sales", "005_movements", "006_expenses", "007_mdo_kpis",
]}


def emit(seed, line):
    seeds[seed].append(line)

# ---------------------------------------------------------------------------
# 1. Reference data
# ---------------------------------------------------------------------------

# --- payment methods (column C of sales; distinct set discovered by scan) ---
PAYMENT_MAP = OrderedDict([
    ("$",   ("Dinheiro",           "cash",      0,   0)),
    ("P",   ("PIX",                "pix",       0,   0)),
    ("D",   ("Débito",             "debit",     0,   0)),
    ("TK",  ("Cartela",            "ticket",    0,   0)),
    ("VR",  ("Vale Refeição",      "voucher",   0,   0)),
    ("AL",  ("Alelo",              "voucher",   0,   0)),
    ("SX",  ("Sodexo",             "voucher",   0,   0)),
    ("TR",  ("Ticket Restaurante", "voucher",   0,   0)),
    ("1",   ("Crédito 1x",         "credit",    0,  30)),
    ("2",   ("Crédito 2x",         "credit",    0,  60)),
    ("3",   ("Crédito 3x",         "credit",    0,  90)),
    ("NP",  ("Não pagou",          "exception", 0,   0)),
    ("NTT", ("Não trouxe ticket",  "exception", 0,   0)),
])

# --- deal types (column D of sales) ---
DEAL_MAP = OrderedDict([
    ("0",      ("Venda (sem desconto)",      "sale",           True,  True,  True)),
    ("CONS",   ("Consumo próprio",           "consumo",        False, False, False)),
    ("NEG",    ("Negócio",                   "negocio",        True,  True,  False)),
    ("BRINDE", ("Brinde",                    "brinde",         False, False, False)),
    ("LEVOU",  ("Empréstimo (saída)",         "loan_out",       False, False, True)),
    ("TROUXE", ("Devolução",                 "return",         False, False, True)),
    ("DESC",   ("Desconto",                  "discount",         True,  True,  True)),
    ("pga",    ("Pagamento acesso",           "financial",      True,  False, False)),
])
DISCOUNT_CODES = {"0.25", "0.35", "0.42", "0.5", "0.14", "0.23", "0.32"}

# --- item classes (column O of sales / M of price table) ---
ITEM_CLASS_MAP = OrderedDict([
    ("N.I",  ("Nutrição Interna",     "N.I",  False)),
    ("N.E",  ("Nutrição Externa",     "N.E",  False)),
    ("E.A",  ("Espaço / Acesso",      "E.A",  False)),
    ("E.X",  ("Espaço Extra",         "E.X",  False)),
    ("E.AC", ("Espaço Acesso Cartela","E.A",  False)),
    ("E.AF", ("Espaço Acesso Financeiro","E.A", True)),
    ("N.IF", ("Nutrição Interna Financeira","N.I", True)),
])

# --- expense categories -> scope (column C of Lancamento Despesas) ---
EXPENSE_SCOPE = {
    "EVS Mooca Custo Fixo":        "negocio_fixo",
    "EVS Mooca Custo Variável":    "negocio_variavel",
    "Herbalife Custo Fixo":        "negocio_fixo",
    "Herbalife Custo Variável":    "negocio_variavel",
    "Pagamentos/Investimentos":    "negocio_variavel",
    "Pessoal":                     "pessoal",
}
EXPENSE_PERSONAL_DEFAULT = {
    "Alimentação", "Transporte Carro", "Roupa", "Lazer", "Moradia",
    "Saúde", "Educação", "Compras", "Comunicação", "Manutenção Carro", "Reajuste",
}

for code, (label, kind, fee, days) in PAYMENT_MAP.items():
    emit("001_reference_data",
         f"insert into payment_methods (code, label, kind, fee_pct, settlement_days) values ({sql_str(code)}, {sql_str(label)}, {sql_str(kind)}, {fee}, {days}) on conflict (code) do nothing;")

for code, (label, kind, ar, ap, as_) in DEAL_MAP.items():
    emit("001_reference_data",
         f"insert into deal_types (code, label, kind, affects_revenue, affects_pv, affects_stock) values ({sql_str(code)}, {sql_str(label)}, {sql_str(kind)}, {str(ar).lower()}, {str(ap).lower()}, {str(as_).lower()}) on conflict (code) do nothing;")

for code, (label, family, fin) in ITEM_CLASS_MAP.items():
    emit("001_reference_data",
         f"insert into item_classes (code, label, family, is_financial_only) values ({sql_str(code)}, {sql_str(label)}, {sql_str(family)}, {str(fin).lower()}) on conflict (code) do nothing;")

# locations
for code, label in [("EVS", "Espaço Mooca"), ("CASA", "Casa"), ("MALA", "Mala"), ("BUFFER", "Buffer")]:
    emit("001_reference_data",
         f"insert into locations (code, label) values ({sql_str(code)}, {sql_str(label)}) on conflict (code) do nothing;")

emit("001_reference_data", "")

# ---------------------------------------------------------------------------
# 2. Products & prices
# ---------------------------------------------------------------------------
# 2a. Novos Preços HLF (sheet2) - master list: SKU, name, PV, retail + tiers
hlf_products = {}
for r, cells in sheet("Novos Preços HLF"):
    if r < 2:
        continue
    sku = cells.get("A")
    name = cells.get("B")
    if not sku or not name:
        continue
    hlf_products[str(sku)] = {
        "sku": str(sku), "name": str(name),
        "pv": cells.get("C"),
        "retail": cells.get("D"),
        "t0.25": cells.get("E"), "t0.35": cells.get("F"),
        "t0.42": cells.get("G"), "t0.5": cells.get("H"),
        "bronze": cells.get("I"), "prata": cells.get("J"), "ouro": cells.get("K"),
    }

# 2b. Tabela de Preços (sheet4) - SKU, name, PV, item class, plus composed items
tabela_products = {}
for r, cells in sheet("Tabela de Preços"):
    if r < 2:
        continue
    sku = cells.get("C") or cells.get("A")
    name = cells.get("B")
    if not sku or not name:
        continue
    sku = str(sku).strip()
    if sku.lower() in ("sku",):
        continue
    ic_raw = cells.get("M")
    tabela_products[sku] = {
        "sku": sku, "name": str(name).strip(),
        "pv": cells.get("D") or cells.get("P"),
        "item_class": ic_raw,
        "kind": "access" if r >= 118 else "ni",
        "portions": cells.get("O"),
        "portion_label": cells.get("N"),
    }

# merge: hlf products as base, overlay tabela info
products = {}
for sku, p in hlf_products.items():
    products[sku] = {
        "sku": sku, "name": p["name"], "kind": "ni",
        "item_class": "N.I", "pv": p["pv"],
        "retail": p["retail"],
        "t0.25": p["t0.25"], "t0.35": p["t0.35"], "t0.42": p["t0.42"],
        "t0.5": p["t0.5"], "bronze": p["bronze"], "prata": p["prata"], "ouro": p["ouro"],
    }
for sku, p in tabela_products.items():
    if sku in products:
        prod = products[sku]
        if p["item_class"]:
            prod["item_class"] = p["item_class"]
        if p["kind"]:
            prod["kind"] = p["kind"]
        if p["pv"] is not None:
            prod["pv"] = p["pv"]
        if p["portions"]:
            prod["portions_per_pack"] = int(float(p["portions"]))
        if p["portion_label"]:
            prod["portion_label"] = p["portion_label"]
    else:
        products[sku] = {
            "sku": sku, "name": p["name"], "kind": p["kind"],
            "item_class": p["item_class"] or "N.I", "pv": p["pv"],
            "portions_per_pack": int(float(p["portions"])) if p["portions"] else 1,
            "portion_label": p["portion_label"],
        }

TIER_COLS = ["retail", "t0.25", "t0.35", "t0.42", "t0.5", "bronze", "prata", "ouro"]
TIER_CODES = ["retail", "t0.25", "t0.35", "t0.42", "t0.5", "bronze", "prata", "ouro"]

for sku, p in products.items():
    emit("002_products",
         f"insert into products (sku, name, kind, item_class, pv, portions_per_pack, portion_label, is_active) "
         f"values ({sql_str(sku)}, {sql_str(p['name'])}, {sql_str(p['kind'])}, {sql_str(p['item_class'])}, "
         f"{sql_num(p['pv'])}, {sql_num(p.get('portions_per_pack', 1))}, {sql_str(p.get('portion_label'))}, true) "
         f"on conflict (sku) do update set name = excluded.name, item_class = excluded.item_class;")
    for tier, code in zip(TIER_COLS, TIER_CODES):
        val = p.get(tier)
        if val is not None and val != "":
            emit("002_products",
                 f"insert into product_prices (product_id, tier_code, price, valid_from) "
                 f"select id, {sql_str(code)}, {sql_num(val)}, '2025-01-01' from products where sku = {sql_str(sku)} "
                 f"on conflict (product_id, tier_code, valid_from) do nothing;")

emit("002_products", "")
print(f"products: {len(products)}")

# ---------------------------------------------------------------------------
# 3. Clients (from sales sheet column B)
# ---------------------------------------------------------------------------
raw_clients = Counter()
for r, cells in sheet("Lançamento de Venda"):
    if r < 2:
        continue
    b = cells.get("B")
    if b:
        raw_clients[str(b)] += 1

clients = {}   # normalized -> client dict
aliases = {}   # raw -> normalized
for raw in raw_clients:
    norm = re.sub(r"\s+", " ", str(raw).strip().lower())
    if norm not in clients:
        clients[norm] = {"name": raw, "normalized": norm, "phone": None, "whatsapp": None, "notes": None}
    aliases[raw] = norm

for norm, c in clients.items():
    emit("003_clients",
         f"insert into clients (name, name_normalized) values ({sql_str(c['name'])}, {sql_str(norm)}) "
         f"on conflict (name_normalized) do nothing;")
for raw, norm in aliases.items():
    emit("003_clients",
         f"insert into client_aliases (raw_name, client_id) "
         f"select {sql_str(raw)}, id from clients where name_normalized = {sql_str(norm)} on conflict (raw_name) do nothing;")

emit("003_clients", "")
print(f"clients: {len(clients)} (raw variants: {len(aliases)})")

# ---------------------------------------------------------------------------
# 4. Sales + installments
# ---------------------------------------------------------------------------
SALE_INSERT_BATCH = []
PAYMENT_INSERT_BATCH = []
MOVEMENT_FROM_SALE_BATCH = []

# product lookup by sku -> need DB id; we emit placeholder and fix via CTE in seed? Simpler: emit sales with product_id
# resolved by joining products table at insert time (sku stored in product_name_raw? no - sku in col N).
# We'll emit sales WITHOUT product_id/fk, then a fix-up script updates product_id by sku match.
# Actually cleaner: emit product_sku column into a temp column? We don't have one. Solution: two-step:
#   1. insert sales with product_name_raw + sku_raw (store sku in obs? no).
# Decision: add sku_raw to sales via product_name_raw? No. We'll emit a mapping table seed instead:
#   seed: update sales set product_id = (select id from products where sku = sales.sku_raw) where sku_raw is not null;
# So sales table needs sku_raw column... it doesn't. Add column in migration? Let's keep sales clean and emit
# a separate mapping seed file 004b that creates a temp mapping via a CTE-based update using product_name_raw match on name? fragile.
# Simplest robust approach: store SKU in product_name_raw is wrong semantically.
# -> Add `sku_raw` text column to sales in 001? I already wrote 001 without it. I'll add an ALTER in seeds header.
# Actually simplest: emit sales including product_id resolved NOW by matching sku (col N) to products dict.
product_by_sku = {p["sku"]: p for p in products.values()}
# We can't know UUIDs pre-insert. So: emit sales rows with product_id NULL + sku in a comment-free way is bad.
# Alternative: use a temp join table seeded from ETL:
#   create temp table sale_sku_map (legacy_row int, sku text);
#   insert into sale_sku_map values (...);
#   update sales s set product_id = p.id from sale_sku_map m join products p on p.sku = m.sku where s.legacy_row = m.legacy_row;
# Clean. Let's do that.

SKU_MAP_ROWS = []

sale_counter = 0
payment_counter = 0
rows_without_date = 0
unknown_deals = Counter()
unknown_pay = Counter()
unknown_classes = Counter()

for r, cells in sheet("Lançamento de Venda"):
    if r < 2:
        continue
    sold_on = serial_to_date(cells.get("A"))
    if sold_on is None:
        rows_without_date += 1
        continue
    client_raw = cells.get("B")
    pay_code = cells.get("C")
    deal_code = cells.get("D")
    product_name = cells.get("E")
    origin = cells.get("G")
    stock_disc = cells.get("H")
    obs = cells.get("F")
    amount = cells.get("I")
    cost = cells.get("J")
    fin_cost = cells.get("K")
    pv = cells.get("M")
    sku = cells.get("N")
    item_class = cells.get("O")
    client_type = cells.get("P")
    sale_seq = cells.get("Z")

    if pay_code and str(pay_code) not in PAYMENT_MAP:
        unknown_pay[str(pay_code)] += 1
    if item_class and str(item_class) not in ITEM_CLASS_MAP:
        unknown_classes[str(item_class)] += 1

    if client_raw:
        norm = re.sub(r"\s+", " ", str(client_raw).strip().lower())
        client_id_sub = f"(select id from clients where name_normalized = {sql_str(norm)} limit 1)"
    else:
        client_id_sub = "NULL"

    product_id_sub = "NULL"
    if sku:
        SKU_MAP_ROWS.append((r, str(sku)))

    # normalize deal code: floats like 0.14000000000000001 -> '0.14'
    dc_raw = str(deal_code) if deal_code else ""
    dc = dc_raw
    if deal_code and dc_raw not in DEAL_MAP and dc_raw not in DISCOUNT_CODES:
        if dc_raw not in DEAL_MAP and dc_raw not in DISCOUNT_CODES:
            unknown_deals[dc_raw] += 1
        try:
            dc = f"{float(dc_raw):.2f}"
        except (TypeError, ValueError):
            dc = dc_raw

    # discount_pct when deal_code is a numeric discount
    disc_pct = "NULL"
    if dc in DISCOUNT_CODES:
        disc_pct = dc

    deal_sub = "NULL"
    if dc in DEAL_MAP:
        deal_sub = f"(select code from deal_types where code = {sql_str(dc)})"
    elif dc in DISCOUNT_CODES:
        deal_sub = f"(select code from deal_types where code = '0')"

    pay_sub = "NULL"
    if pay_code and str(pay_code) in PAYMENT_MAP:
        pay_sub = f"(select code from payment_methods where code = {sql_str(pay_code)})"

    emit("004_sales",
         f"insert into sales (sold_on, client_id, client_name_raw, payment_method_code, deal_type_code, "
         f"discount_pct, origin, stock_discount_pct, obs, amount_received, product_cost, financial_cost, pv, "
         f"sale_seq, legacy_row, created_by) "
         f"values ({sql_date(sold_on)}, {client_id_sub}, {sql_str(client_raw)}, {pay_sub}, {deal_sub}, "
         f"{sql_num(disc_pct)}, {sql_str(origin)}, {sql_num(stock_disc)}, {sql_str(obs)}, "
         f"{sql_num(amount)}, {sql_num(cost)}, {sql_num(fin_cost)}, {sql_num(pv)}, "
         f"{sql_num(sale_seq)}, {r}, (select id from auth.users limit 1));")

    # installments: (R,S) (T,U) (V,W)
    for inst, (dcol, acol) in enumerate([("R", "S"), ("T", "U"), ("V", "W")], start=1):
        due = cells.get(dcol)
        amt = cells.get(acol)
        if due is None and amt is None:
            continue
        due_iso = serial_to_date(due) if due else None
        emit("004_sales",
             f"insert into sale_payments (sale_id, installment, due_on, amount) "
             f"values ((select id from sales where legacy_row = {r} order by id desc limit 1), "
             f"{inst}, {sql_date(due_iso)}, {sql_num(amt)});")
        payment_counter += 1

    sale_counter += 1

# sku mapping fix-up
emit("004_sales", "-- fix product_id from SKU")
emit("004_sales", "create temp table sale_sku_map (legacy_row int, sku text);")
for lr, sku in SKU_MAP_ROWS:
    emit("004_sales", f"insert into sale_sku_map values ({lr}, {sql_str(sku)});")
emit("004_sales", "update sales s set product_id = p.id from sale_sku_map m join products p on p.sku = m.sku where s.legacy_row = m.legacy_row;")
emit("004_sales", "drop table sale_sku_map;")

emit("004_sales", "")
print(f"sales: {sale_counter} (rows without date skipped: {rows_without_date})")
print(f"installments: {payment_counter}")
print(f"unknown payment codes: {dict(unknown_pay)}")
print(f"unknown deal codes: {dict(unknown_deals)}")
print(f"unknown item classes: {dict(unknown_classes)}")

# ---------------------------------------------------------------------------
# 5. Inventory movements (Estoque sheet6)
# ---------------------------------------------------------------------------
est_rows = list(sheet("Estoque"))
hdr_row = {c: v for r, cells in est_rows if r == 1 for c, v in cells.items()}
tag_row = {c: v for r, cells in est_rows if r == 2 for c, v in cells.items()}

MOVEMENT_TYPE_MAP = {
    "acerto": "adjustment",
    "acert": "adjustment",
    "emprestimo": "loan_out",
    "empréstimo": "loan_out",
    "devolucao": "return",
    "devolução": "return",
    "pedido": "purchase",
    "compra": "purchase",
    "mooca": "purchase",
}

movement_counter = 0
product_rows = [ (r, cells) for r, cells in est_rows if 4 <= r <= 75 and (cells.get("A") or cells.get("B")) ]

for r, cells in product_rows:
    sku = cells.get("A")  # VLOOKUP result sku
    # moved qty per event column
    for col, val in cells.items():
        if col in ("A", "B", "C", "D", "E", "F", "G"):
            continue
        try:
            qty = float(val)
        except (TypeError, ValueError):
            continue
        if qty == 0:
            continue
        label = hdr_row.get(col, "")
        tag = tag_row.get(col, "")  # EVS / CASA
        low = str(label).lower()
        mtype = "transfer"
        for key, t in MOVEMENT_TYPE_MAP.items():
            if key in low:
                mtype = t
                break
        # parse date from label like "Mooca 5/3" or "15/9"
        moved_on = None
        dm = re.search(r"(\d{1,2})/(\d{1,2})", str(label))
        if dm:
            day, mon = int(dm.group(1)), int(dm.group(2))
            moved_on = f"2025-{mon:02d}-{day:02d}"  # legacy data; year best-effort
        emit("005_movements",
             f"insert into inventory_movements (product_id, moved_on, type, location_to, qty, event_label, created_by) "
             f"select (select id from products where sku = {sql_str(sku)} limit 1), "
             f"{sql_date(moved_on)}, {sql_str(mtype)}, {sql_str(tag)}, {sql_num(qty)}, {sql_str(label)}, "
             f"(select id from auth.users limit 1);")
        movement_counter += 1

emit("005_movements", "")
print(f"inventory products: {len(product_rows)}, movements: {movement_counter}")

# ---------------------------------------------------------------------------
# 6. Expenses (Lançamento Despesas - July/2023 block)
# ---------------------------------------------------------------------------
expense_counter = 0
account_names = set()
category_names = set()
for r, cells in sheet("Lançamento Despesas"):
    if r < 2:
        continue
    inc = serial_to_date(cells.get("A"))
    desc = cells.get("B")
    cat = cells.get("C")
    acct = cells.get("D")
    amt = cells.get("E")
    scope = cells.get("K")
    if not inc or not desc:
        continue
    if cat:
        category_names.add(str(cat))
    if acct:
        account_names.add(str(acct))
    scope_sql = "NULL"
    if scope and str(scope) in ("Negócio Fixo", "Negócio Variável", "Pessoal"):
        scope_sql = sql_str({"Negócio Fixo": "negocio_fixo", "Negócio Variável": "negocio_variavel", "Pessoal": "pessoal"}[str(scope)])
    elif cat and str(cat) in EXPENSE_SCOPE:
        scope_sql = sql_str(EXPENSE_SCOPE[str(cat)])
    elif cat and str(cat) in EXPENSE_PERSONAL_DEFAULT:
        scope_sql = sql_str("pessoal")
    emit("006_expenses",
         f"insert into expenses (incurred_on, description, account_id, amount, scope, legacy_row, created_by) "
         f"values ({sql_date(inc)}, {sql_str(desc)}, "
         f"(select id from accounts where name = {sql_str(acct)} limit 1), {sql_num(amt)}, {scope_sql}, {r}, "
         f"(select id from auth.users limit 1));")
    expense_counter += 1

# seed accounts & categories found
emit("006_expenses", "-- accounts discovered in ledger")
for name in sorted(account_names):
    emit("006_expenses", f"insert into accounts (name) values ({sql_str(name)}) on conflict (name) do nothing;")
emit("006_expenses", "-- categories discovered in ledger")
for name in sorted(category_names):
    scope = EXPENSE_SCOPE.get(name, "pessoal" if name in EXPENSE_PERSONAL_DEFAULT else "pessoal")
    emit("006_expenses",
         f"insert into expense_categories (name, scope) values ({sql_str(name)}, {sql_str(scope)}) on conflict (name) do nothing;")
emit("006_expenses", "")
print(f"expenses: {expense_counter}")
print(f"accounts: {sorted(account_names)}")
print(f"categories: {sorted(category_names)}")

# ---------------------------------------------------------------------------
# 7. MDO daily KPIs (MDO-Dia sheet7, rows 6..736)
# ---------------------------------------------------------------------------
MDO_COLS = {
    "B": "contatos", "C": "ligacao", "D": "marcacao", "E": "apresentacao",
    "F": "indicacoes", "G": "convites_traga_um", "H": "cliente_novo",
    "M": "cliente_repetidor", "Q": "acesso_total", "R": "cartelas",
    "S": "cortesias", "T": "consumo_proprio", "U": "panfletos",
    "X": "convidados_hom", "Y": "convidados_jantar", "Z": "convidados_qs",
    "AA": "convidados_sts", "AB": "indicacoes_recru", "AC": "novos_consultores",
    "AD": "novos_cons_sr", "AE": "novos_const_sucesso", "AF": "novos_supervisores",
}

mdo_counter = 0
mdo_first = mdo_last = None
for r, cells in sheet("MDO-Dia"):
    if r < 6:
        continue
    d = serial_to_date(cells.get("A"))
    if d is None:
        continue
    if mdo_first is None:
        mdo_first = d
    mdo_last = d
    vals = ", ".join(f"{col} = {sql_num(cells.get(col))}" for col in MDO_COLS if cells.get(col) is not None)
    emit("007_mdo_kpis",
         f"insert into daily_kpis (kpi_date, {', '.join(MDO_COLS.values()) if False else ''}) "
         f"values ({sql_date(d)}, {', '.join(sql_num(cells.get(c)) for c in MDO_COLS)}) "
         f"on conflict (kpi_date) do update set {vals};")
    mdo_counter += 1

emit("007_mdo_kpis", "")
print(f"MDO days: {mdo_counter} ({mdo_first} → {mdo_last})")

# ---------------------------------------------------------------------------
# Write seed files
# ---------------------------------------------------------------------------
for name, lines in seeds.items():
    path = os.path.join(SEED_DIR, name + ".sql")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("-- BioAvalia ETL seed — generated from Controle do Negócio 2026-10.xlsx\n")
        fh.write("-- Review before loading; do not load twice without cleaning.\n\n")
        fh.write("\n".join(lines))
        fh.write("\n")
    print("wrote", path)

# ---------------------------------------------------------------------------
# 8. Validation report
# ---------------------------------------------------------------------------
report = []
report.append("# ETL Validation Report")
report.append("")
report.append(f"Source: `Controle do Negócio 2026-10.xlsx`")
report.append("")

report.append("## Counts")
report.append(f"- Products: {len(products)}")
report.append(f"- Clients (normalized): {len(clients)} / raw variants: {len(aliases)}")
report.append(f"- Sales: {sale_counter}")
report.append(f"- Installments: {payment_counter}")
report.append(f"- Inventory movements: {movement_counter}")
report.append(f"- Expenses: {expense_counter}")
report.append(f"- MDO days: {mdo_counter} ({mdo_first} → {mdo_last})")
report.append("")

report.append("## Unknown codes (review manually)")
report.append("```")
report.append("Payment: " + str(dict(unknown_pay)))
report.append("Deal:    " + str(dict(unknown_deals)))
report.append("Class:   " + str(dict(unknown_classes)))
report.append("```")
report.append("")

report.append("## Notes")
report.append("- `MDO-Mês`, `Consolidado`, `Despesas Totais`, `Consumo e Investimento` are NOT imported; they are recomputed by SQL views.")
report.append("- `Estoque (emprestimos 2)` (hidden legacy ledger, since 2012) is NOT imported.")
report.append("- `Acompanhamento ND` and `Análise Organizacional` (hidden) are NOT imported.")
report.append("- Sales rows without a date in column A were skipped.")
report.append("- Inventory movement dates are best-effort (year 2025 assumed from column-header text).")
report.append("- `product_components` (composed EVS items cost build-up) is left empty; the admin defines components in the app.")
report.append("- Expense scope is inferred from category; rows without a scope marker default to `pessoal`.")
report.append("")

with open(os.path.join(ROOT, "etl", "validation_report.md"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(report))
print("\nwrote etl/validation_report.md")
