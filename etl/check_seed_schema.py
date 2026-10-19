#!/usr/bin/env python3
"""Static consistency check of the generated seeds against the schema.

Runs WITHOUT a database: parses `create table` statements from the migration,
then validates every `insert` in the generated seed SQL:

  * target table and columns exist; no duplicate columns
  * values/select list arity matches the column list
  * literal NULL is never written into a NOT NULL column
  * `on conflict (...)` targets exist, `do update set` targets exist
  * tables referenced in subselects exist
  * cross-file lookups resolve:
      products by sku, clients by name_normalized, sale legacy_row,
      payment_methods/deal_types/item_classes by code,
      accounts / expense_categories by name

Usage:
    python3 etl/check_seed_schema.py                  # checks supabase/seeds/*.sql
    python3 etl/check_seed_schema.py --seed path.sql  # check specific file(s)
Exit code 0 = clean, 1 = problems found.
"""
import argparse
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

IGNORED_TABLES = {"sale_sku_map"}  # temp table created inside 004_sales.sql

INSERT_RE = re.compile(
    r"insert into (?:(?P<schema>[a-z_][a-z0-9_]*)\.)?(?P<table>[a-z_][a-z0-9_]*)\s*"
    r"\((?P<cols>[^)]*)\)\s*(?P<form>values|select)\s*",
    re.I,
)

TYPE_RE = re.compile(
    r"^([a-z_][a-z0-9_]*)\s+(uuid|text|int|integer|numeric|date|timestamptz|boolean|jsonb)\b"
)


# ---------------------------------------------------------------------------
# parsing helpers
# ---------------------------------------------------------------------------
def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def parse_schema(migration_path):
    text = read(migration_path)
    tables = {}
    for m in re.finditer(r"create table if not exists ([a-z_][a-z0-9_]*)\s*\((.*?)\n\);", text, re.S):
        name, body = m.group(1), m.group(2)
        cols, not_null = [], set()
        for line in body.split("\n"):
            s = line.strip()
            cm = TYPE_RE.match(s)
            if not cm:
                continue
            col = cm.group(1)
            cols.append(col)
            if re.search(r"\bnot null\b", s, re.I) or re.search(r"\bprimary key\b", s, re.I):
                not_null.add(col)
        for pk in re.findall(r"primary key\s*\(([^)]*)\)", body):
            for c in pk.split(","):
                not_null.add(c.strip())
        tables[name] = {"cols": cols, "colset": set(cols), "not_null": not_null}
    return tables


def find_stmt_end(text, pos):
    """Index of the ';' terminating the statement starting at pos (quote/paren aware)."""
    depth, in_str = 0, False
    i = pos
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if ch == "'":
            in_str = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ";" and depth == 0:
            return i
        i += 1
    return len(text)


def split_top_level(s):
    """Split an expression list on commas that sit outside quotes and parens."""
    items, buf, depth, in_str = [], [], 0, False
    i = 0
    while i < len(s):
        ch = s[i]
        if in_str:
            buf.append(ch)
            if ch == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
        elif ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            items.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        items.append(tail)
    return items


def iter_inserts(text):
    """Yield (match, stmt_text, items) for every insert statement, quote-aware."""
    import bisect
    nl_pos = [i for i, ch in enumerate(text) if ch == "\n"]

    def line_of(pos):
        return bisect.bisect_right(nl_pos, pos) + 1

    pos, in_str = 0, False
    while pos < len(text):
        ch = text[pos]
        if in_str:
            if ch == "'":
                if pos + 1 < len(text) and text[pos + 1] == "'":
                    pos += 2
                    continue
                in_str = False
            pos += 1
            continue
        if ch == "'":
            in_str = True
            pos += 1
            continue
        if text.startswith("insert into ", pos):
            m = INSERT_RE.match(text, pos)
            if not m:
                pos += 1
                continue
            end = find_stmt_end(text, m.end())
            stmt = text[m.start():end]
            form = m.group("form").lower()
            if form == "values":
                p = m.end()
                while p < len(text) and text[p] != "(":
                    p += 1
                depth, in_s, q = 0, False, p
                while q < len(text):
                    c2 = text[q]
                    if in_s:
                        if c2 == "'":
                            if q + 1 < len(text) and text[q + 1] == "'":
                                q += 2
                                continue
                            in_s = False
                    elif c2 == "'":
                        in_s = True
                    elif c2 == "(":
                        depth += 1
                    elif c2 == ")":
                        depth -= 1
                        if depth == 0:
                            break
                    q += 1
                items = split_top_level(text[p + 1:q])
            else:
                items = split_top_level(stmt[m.end() - m.start():])
            line = line_of(m.start())
            yield m, stmt, items, line
            pos = end + 1
            continue
        pos += 1


def dequote(item):
    s = item.strip()
    if len(s) >= 2 and s[0] == "'" and s[-1] == "'":
        return s[1:-1].replace("''", "'")
    return None


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--migration", default=os.path.join(ROOT, "supabase", "migrations", "20261018000001_initial_schema.sql"))
    ap.add_argument("--seed", action="append", default=None,
                    help="seed file to check (repeatable). Default: supabase/seeds/*.sql")
    args = ap.parse_args()

    if args.seed:
        seed_paths = args.seed
    else:
        seeds_dir = os.path.join(ROOT, "supabase", "seeds")
        seed_paths = [os.path.join(seeds_dir, f) for f in sorted(os.listdir(seeds_dir)) if f.endswith(".sql")]

    tables = parse_schema(args.migration)

    issues = []
    tables_used = set()
    insert_counts = Counter()

    defined = {k: set() for k in ("sku", "client", "payment", "deal", "class", "account", "category", "legacy_row")}
    used = {k: set() for k in ("sku", "client", "payment", "deal", "class", "account", "category", "legacy_row")}
    used_lines = {}

    def issue(path, line, msg):
        issues.append(f"{os.path.basename(path)}:{line}: {msg}")

    for path in seed_paths:
        text = read(path)
        for m, stmt, items, line in iter_inserts(text):
            if m.group("schema"):  # schema-qualified, e.g. auth.users
                continue
            table = m.group("table")
            tables_used.add(table)
            insert_counts[table] += 1

            cols = [c.strip() for c in m.group("cols").split(",") if c.strip()]

            if table in IGNORED_TABLES:
                if table == "sale_sku_map" and len(items) == 2:
                    sku = dequote(items[1])
                    if sku:
                        used["sku"].add(sku)
                        used_lines.setdefault(("sku", sku), (path, line))
                continue

            if table not in tables:
                issue(path, line, f"unknown table `{table}`")
                continue
            schema = tables[table]

            if len(cols) != len(set(cols)):
                dupes = [c for c, n in Counter(cols).items() if n > 1]
                issue(path, line, f"duplicate column(s) in insert: {dupes}")
            for c in cols:
                if c not in schema["colset"]:
                    issue(path, line, f"`{table}` has no column `{c}`")

            if len(items) != len(cols):
                issue(path, line, f"`{table}`: {len(cols)} columns but {len(items)} values/expressions")
                pairs = list(zip(cols, items))
            else:
                pairs = list(zip(cols, items))

            for c, item in pairs:
                if item.strip().upper() == "NULL" and c in schema["not_null"]:
                    issue(path, line, f"`{table}.{c}` is NOT NULL but gets literal NULL")

            # on conflict target + do update set targets
            for oc in re.findall(r"on conflict\s*\(([^)]*)\)", stmt, re.I):
                for c in oc.split(","):
                    c = c.strip()
                    if c and c not in schema["colset"]:
                        issue(path, line, f"`{table}`: on conflict target `{c}` is not a column")
            for c in re.findall(r"([a-z_][a-z0-9_]*)\s*=\s*excluded\.", stmt, re.I):
                if c not in schema["colset"]:
                    issue(path, line, f"`{table}`: do update set target `{c}` is not a column")

            # tables referenced in subselects (ignore strings + schema-qualified refs)
            scan = re.sub(r"'(?:[^']|'')*'", "''", stmt)
            for mm in re.finditer(r"\bfrom\s+([a-z_][a-z0-9_]*)", scan, re.I):
                if scan[mm.end():mm.end() + 1] == ".":
                    continue  # e.g. auth.users
                ref = mm.group(1)
                if ref not in tables and ref not in IGNORED_TABLES:
                    issue(path, line, f"subselect references unknown table `{ref}`")

            # collect definition / usage sets
            def col_item(name):
                return items[cols.index(name)] if name in cols and len(items) == len(cols) else None

            for mm in re.finditer(r"from products\s+where\s+sku\s*=\s*'((?:[^']|'')*)'", stmt, re.I):
                sku_val = mm.group(1).replace("''", "'")
                used["sku"].add(sku_val)
                used_lines.setdefault(("sku", sku_val), (path, line))
            for mm in re.finditer(r"from clients\s+where\s+name_normalized\s*=\s*'((?:[^']|'')*)'", stmt, re.I):
                used["client"].add(mm.group(1).replace("''", "'"))
            for mm in re.finditer(r"from payment_methods\s+where\s+code\s*=\s*'((?:[^']|'')*)'", stmt, re.I):
                used["payment"].add(mm.group(1).replace("''", "'"))
            for mm in re.finditer(r"from deal_types\s+where\s+code\s*=\s*'((?:[^']|'')*)'", stmt, re.I):
                used["deal"].add(mm.group(1).replace("''", "'"))
            for mm in re.finditer(r"from accounts\s+where\s+name\s*=\s*'((?:[^']|'')*)'", stmt, re.I):
                used["account"].add(mm.group(1).replace("''", "'"))
            for mm in re.finditer(r"from expense_categories\s+where\s+name\s*=\s*'((?:[^']|'')*)'", stmt, re.I):
                used["category"].add(mm.group(1).replace("''", "'"))
            for mm in re.finditer(r"from sales\s+where\s+legacy_row\s*=\s*(\d+)", stmt, re.I):
                used["legacy_row"].add(int(mm.group(1)))

            if table == "products":
                sku = dequote(col_item("sku") or "")
                if sku:
                    defined["sku"].add(sku)
                cls = dequote(col_item("item_class") or "")
                if cls:
                    used["class"].add(cls)
            elif table == "clients":
                nn = dequote(col_item("name_normalized") or "")
                if nn:
                    defined["client"].add(nn)
            elif table == "payment_methods":
                code = dequote(col_item("code") or "")
                if code:
                    defined["payment"].add(code)
            elif table == "deal_types":
                code = dequote(col_item("code") or "")
                if code:
                    defined["deal"].add(code)
            elif table == "item_classes":
                code = dequote(col_item("code") or "")
                if code:
                    defined["class"].add(code)
            elif table == "accounts":
                nm = dequote(col_item("name") or "")
                if nm:
                    defined["account"].add(nm)
            elif table == "expense_categories":
                nm = dequote(col_item("name") or "")
                if nm:
                    defined["category"].add(nm)
            elif table == "sales":
                lr = col_item("legacy_row")
                if lr and lr.isdigit():
                    defined["legacy_row"].add(int(lr))

    # cross-file lookups
    for kind, label in (
        ("sku", "products.sku"),
        ("client", "clients.name_normalized"),
        ("payment", "payment_methods.code"),
        ("deal", "deal_types.code"),
        ("class", "item_classes.code"),
        ("account", "accounts.name"),
        ("category", "expense_categories.name"),
        ("legacy_row", "sales.legacy_row"),
    ):
        missing = used[kind] - defined[kind]
        for value in sorted(missing, key=str)[:10]:
            where = used_lines.get((kind, value))
            loc = f" (first use {os.path.basename(where[0])}:{where[1]})" if where else ""
            issues.append(f"lookup miss: {label} = {value!r} is used but never defined{loc}")
        if len(missing) > 10:
            issues.append(f"lookup miss: ... and {len(missing) - 10} more {label} values")

    # duplicated sales legacy_row definitions cannot be detected after set() — reparse
    lr_all = []
    for path in seed_paths:
        text = read(path)
        for m, stmt, items, line in iter_inserts(text):
            if m.group("table") != "sales":
                continue
            cols = [c.strip() for c in m.group("cols").split(",") if c.strip()]
            if "legacy_row" in cols and len(items) == len(cols):
                v = items[cols.index("legacy_row")]
                if v.isdigit():
                    lr_all.append(int(v))
    dupes = [v for v, n in Counter(lr_all).items() if n > 1]
    if dupes:
        issues.append(f"sales.legacy_row duplicated ({len(dupes)} values, e.g. {dupes[:5]}) — "
                      f"sale_payments lookups would attach to the wrong sale")

    # ------------------------------------------------------------------
    # report
    # ------------------------------------------------------------------
    print(f"schema: {len(tables)} tables parsed from {os.path.relpath(args.migration, ROOT)}")
    print(f"checked {len(seed_paths)} seed file(s), {sum(insert_counts.values())} insert statements")
    print("rows per table: " + ", ".join(f"{t}={n}" for t, n in sorted(insert_counts.items())))
    print()

    if issues:
        print(f"FAIL — {len(issues)} problem(s):")
        for msg in issues[:120]:
            print("  - " + msg)
        if len(issues) > 120:
            print(f"  ... and {len(issues) - 120} more")
        return 1

    print("OK — all inserts reference existing tables/columns with matching arity;")
    print("no literal NULL into NOT NULL; all cross-file lookups resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
