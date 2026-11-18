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


def skip_sql_string(text, start):
    """Given index `start` at the opening `'`, return index of the closing `'` (or len(text))."""
    i = start + 1
    while i < len(text):
        if text[i] == "'":
            if i + 1 < len(text) and text[i + 1] == "'":
                i += 2
                continue
            return i
        i += 1
    return len(text)


def find_stmt_end(text, pos):
    """Index of the ';' terminating the statement starting at pos (quote/paren aware)."""
    depth = 0
    i = pos
    while i < len(text):
        ch = text[i]
        if ch == "'":
            i = skip_sql_string(text, i)
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
    items = []
    depth = 0
    start = 0
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "'":
            i = skip_sql_string(s, i)
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            items.append(s[start:i].strip())
            start = i + 1
        i += 1
    tail = s[start:].strip()
    if tail:
        items.append(tail)
    return items


def find_matching_paren(text, open_pos):
    """Given index `open_pos` at `(`, return index of matching `)` (or len(text))."""
    depth = 0
    q = open_pos
    while q < len(text):
        ch = text[q]
        if ch == "'":
            q = skip_sql_string(text, q)
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return q
        q += 1
    return len(text)


def extract_insert_items(text, stmt, m):
    if m.group("form").lower() != "values":
        return split_top_level(stmt[m.end() - m.start():])
    p = text.find("(", m.end())
    if p == -1:
        return []
    q = find_matching_paren(text, p)
    return split_top_level(text[p + 1:q])


def iter_inserts(text):
    """Yield (match, stmt_text, items, line) for every insert statement, quote-aware."""
    import bisect
    nl_pos = [i for i, ch in enumerate(text) if ch == "\n"]
    pos = 0
    while pos < len(text):
        if text[pos] == "'":
            pos = skip_sql_string(text, pos) + 1
            continue
        m = INSERT_RE.match(text, pos) if text.startswith("insert into ", pos) else None
        if not m:
            pos += 1
            continue
        end = find_stmt_end(text, m.end())
        stmt = text[m.start():end]
        items = extract_insert_items(text, stmt, m)
        line = bisect.bisect_right(nl_pos, m.start()) + 1
        yield m, stmt, items, line
        pos = end + 1


def dequote(item):
    s = item.strip()
    if len(s) >= 2 and s[0] == "'" and s[-1] == "'":
        return s[1:-1].replace("''", "'")
    return None


def add_issue(issues, path, line, msg):
    issues.append(f"{os.path.basename(path)}:{line}: {msg}")


def col_item_value(cols, items, name):
    if name in cols and len(items) == len(cols):
        return items[cols.index(name)]
    return None


def check_columns_and_nulls(path, line, table, cols, items, schema, issues):
    if len(cols) != len(set(cols)):
        dupes = [c for c, n in Counter(cols).items() if n > 1]
        add_issue(issues, path, line, f"duplicate column(s) in insert: {dupes}")
    for c in cols:
        if c not in schema["colset"]:
            add_issue(issues, path, line, f"`{table}` has no column `{c}`")
    if len(items) != len(cols):
        add_issue(issues, path, line, f"`{table}`: {len(cols)} columns but {len(items)} values/expressions")
    for c, item in zip(cols, items):
        if item.strip().upper() == "NULL" and c in schema["not_null"]:
            add_issue(issues, path, line, f"`{table}.{c}` is NOT NULL but gets literal NULL")


def check_conflict_targets(path, line, table, stmt, schema, issues):
    for oc in re.findall(r"on conflict\s*\(([^)]*)\)", stmt, re.I):
        for raw_c in oc.split(","):
            c = raw_c.strip()
            if c and c not in schema["colset"]:
                add_issue(issues, path, line, f"`{table}`: on conflict target `{c}` is not a column")
    for c in re.findall(r"([a-z_][a-z0-9_]*)\s*=\s*excluded\.", stmt, re.I):
        if c not in schema["colset"]:
            add_issue(issues, path, line, f"`{table}`: do update set target `{c}` is not a column")


def check_subselect_tables(path, line, stmt, tables, issues):
    scan = re.sub(r"'(?:[^']|'')*'", "''", stmt)
    for mm in re.finditer(r"\bfrom\s+([a-z_][a-z0-9_]*)", scan, re.I):
        if scan[mm.end():mm.end() + 1] == ".":
            continue
        ref = mm.group(1)
        if ref not in tables and ref not in IGNORED_TABLES:
            add_issue(issues, path, line, f"subselect references unknown table `{ref}`")


LOOKUP_PATTERNS = (
    ("sku", re.compile(r"from products\s+where\s+sku\s*=\s*'((?:[^']|'')*)'", re.I)),
    ("client", re.compile(r"from clients\s+where\s+name_normalized\s*=\s*'((?:[^']|'')*)'", re.I)),
    ("payment", re.compile(r"from payment_methods\s+where\s+code\s*=\s*'((?:[^']|'')*)'", re.I)),
    ("deal", re.compile(r"from deal_types\s+where\s+code\s*=\s*'((?:[^']|'')*)'", re.I)),
    ("account", re.compile(r"from accounts\s+where\s+name\s*=\s*'((?:[^']|'')*)'", re.I)),
    ("category", re.compile(r"from expense_categories\s+where\s+name\s*=\s*'((?:[^']|'')*)'", re.I)),
)

LEGACY_ROW = "legacy_row"
LOOKUP_KEYS = ("sku", "client", "payment", "deal", "class", "account", "category", LEGACY_ROW)

SIMPLE_DEF_TABLES = {
    "clients": ("client", "name_normalized"),
    "payment_methods": ("payment", "code"),
    "deal_types": ("deal", "code"),
    "item_classes": ("class", "code"),
    "accounts": ("account", "name"),
    "expense_categories": ("category", "name"),
}


class ValidationState:
    def __init__(self):
        self.issues = []
        self.insert_counts = Counter()
        self.defined = {k: set() for k in LOOKUP_KEYS}
        self.used = {k: set() for k in LOOKUP_KEYS}
        self.used_lines = {}


def collect_stmt_usages(path, line, stmt, used, used_lines):
    for kind, pattern in LOOKUP_PATTERNS:
        for mm in pattern.finditer(stmt):
            val = mm.group(1).replace("''", "'")
            used[kind].add(val)
            if kind == "sku":
                used_lines.setdefault(("sku", val), (path, line))
    for mm in re.finditer(r"from sales\s+where\s+legacy_row\s*=\s*(\d+)", stmt, re.I):
        used[LEGACY_ROW].add(int(mm.group(1)))


def collect_table_definitions(table, cols, items, defined, used):
    if table == "products":
        sku = dequote(col_item_value(cols, items, "sku") or "")
        if sku:
            defined["sku"].add(sku)
        cls = dequote(col_item_value(cols, items, "item_class") or "")
        if cls:
            used["class"].add(cls)
        return
    if table == "sales":
        lr = col_item_value(cols, items, LEGACY_ROW)
        if lr and lr.isdigit():
            defined[LEGACY_ROW].add(int(lr))
        return
    spec = SIMPLE_DEF_TABLES.get(table)
    if spec:
        kind, col_name = spec
        val = dequote(col_item_value(cols, items, col_name) or "")
        if val:
            defined[kind].add(val)


def handle_ignored_table(path, line, table, items, used, used_lines):
    if table == "sale_sku_map" and len(items) == 2:
        sku = dequote(items[1])
        if sku:
            used["sku"].add(sku)
            used_lines.setdefault(("sku", sku), (path, line))


def check_seed_file(path, tables, state):
    for m, stmt, items, line in iter_inserts(read(path)):
        if m.group("schema"):
            continue
        table = m.group("table")
        state.insert_counts[table] += 1
        cols = [c.strip() for c in m.group("cols").split(",") if c.strip()]

        if table in IGNORED_TABLES:
            handle_ignored_table(path, line, table, items, state.used, state.used_lines)
            continue
        if table not in tables:
            add_issue(state.issues, path, line, f"unknown table `{table}`")
            continue

        schema = tables[table]
        check_columns_and_nulls(path, line, table, cols, items, schema, state.issues)
        check_conflict_targets(path, line, table, stmt, schema, state.issues)
        check_subselect_tables(path, line, stmt, tables, state.issues)
        collect_stmt_usages(path, line, stmt, state.used, state.used_lines)
        collect_table_definitions(table, cols, items, state.defined, state.used)


def check_cross_file_lookups(defined, used, used_lines, issues):
    labels = (
        ("sku", "products.sku"),
        ("client", "clients.name_normalized"),
        ("payment", "payment_methods.code"),
        ("deal", "deal_types.code"),
        ("class", "item_classes.code"),
        ("account", "accounts.name"),
        ("category", "expense_categories.name"),
        (LEGACY_ROW, "sales.legacy_row"),
    )
    for kind, label in labels:
        missing = used[kind] - defined[kind]
        for value in sorted(missing, key=str)[:10]:
            where = used_lines.get((kind, value))
            loc = f" (first use {os.path.basename(where[0])}:{where[1]})" if where else ""
            issues.append(f"lookup miss: {label} = {value!r} is used but never defined{loc}")
        if len(missing) > 10:
            issues.append(f"lookup miss: ... and {len(missing) - 10} more {label} values")


def collect_file_legacy_rows(path):
    rows = []
    for m, _, items, _ in iter_inserts(read(path)):
        if m.group("table") != "sales":
            continue
        cols = [c.strip() for c in m.group("cols").split(",") if c.strip()]
        v = col_item_value(cols, items, LEGACY_ROW)
        if v and v.isdigit():
            rows.append(int(v))
    return rows


def check_duplicate_legacy_rows(seed_paths, issues):
    lr_all = []
    for path in seed_paths:
        lr_all.extend(collect_file_legacy_rows(path))
    dupes = [v for v, n in Counter(lr_all).items() if n > 1]
    if dupes:
        issues.append(
            f"sales.legacy_row duplicated ({len(dupes)} values, e.g. {dupes[:5]}) — "
            f"sale_payments lookups would attach to the wrong sale"
        )


def resolve_seed_paths(seed_arg):
    if seed_arg:
        return seed_arg
    seeds_dir = os.path.join(ROOT, "supabase", "seeds")
    return [os.path.join(seeds_dir, f) for f in sorted(os.listdir(seeds_dir)) if f.endswith(".sql")]


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--migration", default=os.path.join(ROOT, "supabase", "migrations", "20261018000001_initial_schema.sql"))
    ap.add_argument("--seed", action="append", default=None,
                    help="seed file to check (repeatable). Default: supabase/seeds/*.sql")
    args = ap.parse_args()

    seed_paths = resolve_seed_paths(args.seed)
    tables = parse_schema(args.migration)
    state = ValidationState()

    for path in seed_paths:
        check_seed_file(path, tables, state)

    issues = state.issues
    check_cross_file_lookups(state.defined, state.used, state.used_lines, issues)
    check_duplicate_legacy_rows(seed_paths, issues)

    # ------------------------------------------------------------------
    # report
    # ------------------------------------------------------------------
    insert_counts = state.insert_counts
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
