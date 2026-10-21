#!/usr/bin/env node
// Checks that every table, view and function the app calls exists in the
// connected Supabase project and is exposed through PostgREST.
//
//   node scripts/check-schema-parity.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from
// the environment or from .env.local. Read-only: it only probes the REST API
// and never writes.
//
// How the functions are probed:
//   * read-only functions are called with harmless arguments;
//   * mutating functions are called with a value that cannot be cast to the
//     parameter type, so PostgREST fails before the function body runs. A
//     missing function is reported as PGRST202, a cast error as HTTP 400.
//
// Grants for the `authenticated` role are not covered here — the RLS suite
// (`npm run db:rls`) checks those with a signed-in role.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const INVALID_DATE = "not-a-date";
const INVALID_UUID = "not-a-uuid";
const OLD_DATE = "1900-01-01";

/**
 * Safe probe payloads. Read-only functions get harmless values; mutating
 * functions get a value that fails the parameter cast, so the body never runs.
 */
const FUNCTION_PROBES = {
  // read-only
  monthly_pnl: { p_month: OLD_DATE },
  cash_flow_summary: { p_month: OLD_DATE },
  month_close_summary: { p_month: OLD_DATE },
  open_receivables_as_of: { p_date: OLD_DATE },
  client_overview_for_ids: { p_ids: [] },
  stock_for_products: { p_ids: [] },
  inventory_summary: {},
  open_receivables_total: {},
  open_receivables_summary: {},
  business_today: {},
  // mutating — the cast fails, the body never runs
  close_month: { p_month: INVALID_DATE },
  reopen_month: { p_month: INVALID_DATE },
  receive_sale_payment: {
    p_sale_payment_id: INVALID_UUID,
    p_amount: 1,
    p_received_on: OLD_DATE,
  },
  write_off_sale_payment: {
    p_sale_payment_id: INVALID_UUID,
    p_written_off_on: OLD_DATE,
    p_reason: "probe",
  },
  reconcile_sale_payments_before: { p_cutoff: INVALID_DATE, p_mode: "probe" },
  merge_clients: { p_source: INVALID_UUID, p_target: INVALID_UUID },
  create_purchase: {
    p_purchased_on: INVALID_DATE,
    p_supplier_id: null,
    p_account_id: null,
    p_location_code: "EVS",
    p_invoice_no: null,
    p_notes: null,
    p_items: [],
  },
  create_stock_count: {
    p_counted_on: INVALID_DATE,
    p_location_code: "EVS",
    p_notes: null,
    p_items: [],
  },
  record_inventory_movement: {
    p_type: "probe",
    p_product_id: INVALID_UUID,
    p_moved_on: null,
    p_location_from: null,
    p_location_to: null,
    p_qty: 1,
    p_counterparty_id: null,
    p_notes: null,
    p_event_label: null,
  },
};

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!env[key]) env[key] = value;
    }
  } catch {
    // no .env.local — the environment is enough
  }
  return env;
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

function extractRelations() {
  const tables = new Set();
  const functions = new Set();
  const dynamic = [];

  for (const file of collectFiles(join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\(\s*["'`]([A-Za-z0-9_]+)["'`]/g)) {
      tables.add(match[1]);
    }
    for (const match of source.matchAll(/\.rpc\(\s*["'`]([A-Za-z0-9_]+)["'`]/g)) {
      functions.add(match[1]);
    }
    for (const match of source.matchAll(/\.from\(\s*([A-Za-z0-9_]+)\s*\)/g)) {
      dynamic.push(`${file.replace(ROOT, "")}: .from(${match[1]})`);
    }
  }

  return {
    tables: [...tables].sort(),
    functions: [...functions].sort(),
    dynamic,
  };
}

async function readJson(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function probeTable(url, key, table) {
  const response = await fetch(`${url}/rest/v1/${table}?limit=1`, {
    headers: { apikey: key },
  });
  const payload = await readJson(response);
  const code = payload && typeof payload === "object" ? payload.code : undefined;

  if (response.status === 404 && code === "PGRST205") {
    return { state: "missing", detail: "relation not in the schema cache" };
  }
  if (response.status === 200) {
    const rows = Array.isArray(payload) ? payload.length : 0;
    return {
      state: "ok",
      detail: `exposed (${rows} row(s) visible to the publishable key)`,
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { state: "ok", detail: "exists, restricted to signed-in roles" };
  }
  return { state: "error", detail: `HTTP ${response.status}` };
}

async function probeFunction(url, key, fn) {
  const probe = FUNCTION_PROBES[fn];
  if (!probe) {
    return {
      state: "unknown",
      detail: "no safe probe defined — check it by hand",
    };
  }

  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(probe),
  });
  const payload = await readJson(response);
  const code = payload && typeof payload === "object" ? payload.code : undefined;

  if (response.status === 404 && code === "PGRST202") {
    return { state: "missing", detail: "function not in the schema cache" };
  }
  if (response.status === 200) {
    return { state: "ok", detail: "callable" };
  }
  if (response.status === 400) {
    return { state: "ok", detail: "present (probe rejected as expected)" };
  }
  if (response.status === 401 || response.status === 403) {
    return { state: "ok", detail: "exists, restricted to signed-in roles" };
  }
  return { state: "error", detail: `HTTP ${response.status}` };
}

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.",
    );
    process.exit(2);
  }

  const { tables, functions, dynamic } = extractRelations();
  const rows = [];

  for (const table of tables) {
    rows.push({
      kind: "table",
      name: table,
      ...(await probeTable(url, key, table)),
    });
  }
  for (const fn of functions) {
    rows.push({
      kind: "function",
      name: fn,
      ...(await probeFunction(url, key, fn)),
    });
  }

  const width = Math.max(...rows.map((r) => r.name.length), 10);
  for (const row of rows) {
    const label = row.state === "ok" ? "OK  " : row.state.toUpperCase();
    console.log(
      `${label} ${row.kind.padEnd(8)} ${row.name.padEnd(width)}  ${row.detail}`,
    );
  }

  for (const item of dynamic) {
    console.log(`SKIP dynamic relation: ${item}`);
  }

  const broken = rows.filter((r) => r.state === "missing" || r.state === "error");
  const unknown = rows.filter((r) => r.state === "unknown");

  console.log();
  console.log(
    `Schema parity: ${rows.length - broken.length}/${rows.length} relations available` +
      (unknown.length > 0 ? ` (${unknown.length} not probed)` : "") +
      ".",
  );
  console.log("Grants for the authenticated role: run `npm run db:rls`.");

  if (broken.length > 0) {
    console.error(
      `Missing or broken: ${broken.map((r) => r.name).join(", ")}. Apply the migrations and reload the PostgREST schema.`,
    );
    process.exit(1);
  }
}

await main();
