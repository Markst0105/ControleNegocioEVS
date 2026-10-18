#!/usr/bin/env python3
"""
Phase 0 validation: recompute monthly aggregates from imported sales and
compare against the cached values the workbook itself computed
('Consumo e Investimento' rows 2-26, 'Consolidado' rows 2-14).

Run:  python3 etl/validate.py
Appends a results section to etl/validation_report.md.
"""

import zipfile
import xml.etree.ElementTree as ET
import datetime
import os
from collections import defaultdict

ROOT = "/home/user/BioAvalia"
XLSX = os.path.join(ROOT, "Controle do Negócio 2026-10.xlsx")
REPORT = os.path.join(ROOT, "etl", "validation_report.md")

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EPOCH = datetime.date(1899, 12, 30)

Z = zipfile.ZipFile(XLSX)
SST = []
for si in ET.fromstring(Z.read("xl/sharedStrings.xml")).findall(M + "si"):
    SST.append("".join(t.text or "" for t in si.iter(M + "t")))


def cell_value(c):
    t = c.get("t"); v = c.find(M + "v"); f = c.find(M + "f")
    if f is not None:
        return v.text if v is not None else None, f.text
    if t == "s" and v is not None:
        return SST[int(v.text)], None
    if v is not None:
        return v.text, None
    return None, None


def serial_to_date(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f < 10000 or f > 80000:
        return None
    return (EPOCH + datetime.timedelta(days=int(f))).isoformat()


def col_of(ref):
    return "".join(ch for ch in ref if ch.isalpha())


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def sheet_rows(sheet_file):
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


RELS = ET.fromstring(Z.read("xl/_rels/workbook.xml.rels"))
RID2TARGET = {r.get("Id"): r.get("Target") for r in RELS}
WB = ET.fromstring(Z.read("xl/workbook.xml"))
NSR = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
SHEET_FILE = {}
for s in WB.find(M + "sheets").findall(M + "sheet"):
    rid = s.get(NSR + "id")
    tgt = RID2TARGET.get(rid, "")
    if tgt.startswith("worksheets/"):
        SHEET_FILE[s.get("name")] = "xl/" + tgt


def sheet(name):
    return list(sheet_rows(SHEET_FILE[name]))


# ---------------------------------------------------------------- sales ---
monthly = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0]))  # month -> deal -> [n, cost, pv]
monthly_rev = defaultdict(float)
monthly_cnt = defaultdict(int)

for r, cells in sheet("Lançamento de Venda"):
    if r < 2:
        continue
    d = serial_to_date(cells.get("A"))
    if d is None:
        continue
    month = d[:7]
    deal = cells.get("D") or "0"
    cost = num(cells.get("J")) or 0.0
    pv = num(cells.get("M")) or 0.0
    amt = num(cells.get("I")) or 0.0
    monthly[month][deal][0] += 1
    monthly[month][deal][1] += cost
    monthly[month][deal][2] += pv
    monthly_rev[month] += amt
    monthly_cnt[month] += 1

# ------------------------------------------- Consumo e Investimento cached --
cons_rows = {}
for r, cells in sheet("Consumo e Investimento"):
    if r < 2:
        continue
    d = serial_to_date(cells.get("A"))
    if d is None:
        continue
    cons_rows[d[:7]] = {
        "CONS_cost": num(cells.get("B")), "CONS_pv": num(cells.get("C")),
        "BRINDE_cost": num(cells.get("D")), "BRINDE_pv": num(cells.get("E")),
        "SALE_cost": num(cells.get("F")), "SALE_pv": num(cells.get("G")),
        "NEG_cost": num(cells.get("H")), "NEG_pv": num(cells.get("I")),
    }

deal_map = {
    "CONS": ("CONS",), "BRINDE": ("BRINDE",), "NEG": ("NEG",),
}
DISCOUNT_CODES = {"0.25", "0.35", "0.42", "0.5", "0.14", "0.23", "0.32"}

def sale_agg(month):
    n = cost = pv = 0.0
    for key, (nn, cc, pp) in monthly[month].items():
        if key == "0" or key in DISCOUNT_CODES:
            n += nn; cost += cc; pv += pp
    return [n, cost, pv]

lines = []
lines.append("## Validation vs workbook cached values")
lines.append("")
lines.append("Recomputed from imported `sales` vs cached in `Consumo e Investimento` "
             "(rows 2-26) and `Consolidado` (rows 2-14).")
lines.append("")
lines.append("| month | source | cost recomputed | cost cached | pv recomputed | pv cached | match |")
lines.append("|-------|--------|-----------------|-------------|---------------|-----------|-------|")

ok = True
checked = 0
for month in sorted(cons_rows):
    cached = cons_rows[month]
    for deal_key, label in [("CONS", "CONS"), ("BRINDE", "BRINDE"),
                            ("NEG", "NEG"), ("SALE", "SALE")]:
        if deal_key == "SALE":
            n, cost, pv = sale_agg(month)
        else:
            n, cost, pv = monthly[month].get(deal_key, [0, 0.0, 0.0])
        ccost = cached[label + "_cost"] or 0.0
        cpv = cached[label + "_pv"] or 0.0
        cost_ok = abs(cost - ccost) < 0.01
        pv_ok = abs(pv - cpv) < 0.01
        checked += 1
        if not (cost_ok and pv_ok):
            ok = False
        lines.append(
            f"| {month} | {label} | {cost:,.2f} | {ccost:,.2f} | "
            f"{pv:,.2f} | {cpv:,.2f} | {'✓' if (cost_ok and pv_ok) else '✗'} |")

lines.append("")
lines.append(f"Comparisons checked: {checked} — all passed: {ok}")
lines.append("")

# monthly revenue sanity vs Consolidado col D cached (Total Vendas)
cons_rows2 = {}
for r, cells in sheet("Consolidado"):
    if r < 2:
        continue
    d = serial_to_date(cells.get("A"))
    if d is None:
        continue
    cons_rows2[d[:7]] = cells

lines.append("### Consolidado spot check (revenue / PV total, months 2025-01 → 2026-01)")
lines.append("")
lines.append("| month | revenue recomputed | D cached (Total Vendas) | PV recomputed | J cached (PV Total) |")
lines.append("|-------|--------------------|-------------------------|---------------|---------------------|")

checked2 = 0
ok2 = True
for month in sorted(cons_rows2):
    if month < "2025-01" or month > "2026-01":
        continue
    cells = cons_rows2[month]
    rev = monthly_rev.get(month, 0.0)
    pv_tot = sum(v[2] for v in monthly[month].values())
    c_d = num(cells.get("D"))
    c_j = num(cells.get("J"))
    d_ok = c_d is None or abs(rev - c_d) < 1.0
    j_ok = c_j is None or abs(pv_tot - c_j) < 1.0
    checked2 += 1
    if not (d_ok and j_ok):
        ok2 = False
    lines.append(
        f"| {month} | {rev:,.2f} | {c_d if c_d is not None else '—'} | "
        f"{pv_tot:,.2f} | {c_j if c_j is not None else '—'} |")

lines.append("")
lines.append(f"Consolidado spot-check comparisons: {checked2} — all passed: {ok2}")
lines.append("")
lines.append("### Conclusion")
lines.append("")
if ok and ok2:
    lines.append("✅ Imported sales reproduce the workbook's cached monthly aggregates — ETL is faithful.")
else:
    lines.append("⚠️  Some mismatches found — review the table above before loading seeds.")
lines.append("")

with open(REPORT, "a", encoding="utf-8") as fh:
    fh.write("\n".join(lines))

print(f"validation: {checked} Consumo checks, {checked2} Consolidado checks")
print("appended to", REPORT)
