import { NextResponse } from "next/server";

import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Public readiness check for the deployment.
 *
 * It never returns credentials or data — only booleans — so it can be used by
 * an uptime monitor and by the post-deploy smoke test. It is the only route
 * that the session proxy lets through without a signed-in user.
 *
 * Checks:
 *   env    — the public Supabase values are present in the bundle;
 *   auth   — the Supabase Auth service answers and the publishable key works;
 *   tables — PostgREST knows the new schema (the Phase 4b table exists);
 *   views  — the reporting view plans and answers (the Phase 5 fix).
 */
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

type Probe =
  | { kind: "response"; status: number; body: string }
  | { kind: "error"; message: string };

async function probe(
  url: string,
  init: RequestInit,
): Promise<Probe> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      kind: "response",
      status: response.status,
      body: await response.text(),
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function statusOf(result: Probe): number {
  return result.kind === "response" ? result.status : 0;
}

function messageOf(result: Probe, fallback: string): string {
  if (result.kind === "error") return fallback;
  return result.body.slice(0, 200);
}

export async function GET() {
  const url = supabaseUrl();
  const key = supabaseKey();

  if (!url || !key) {
    return NextResponse.json(
      {
        status: "error",
        checks: {
          env: { ok: false, detail: "missing NEXT_PUBLIC_SUPABASE_* values" },
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authHeaders = { apikey: key };

  const [authService, authSettings, table, view] = await Promise.all([
    probe(`${url}/auth/v1/health`, { method: "GET", headers: authHeaders }),
    probe(`${url}/auth/v1/settings`, { method: "GET", headers: authHeaders }),
    probe(`${url}/rest/v1/month_closings?select=month&limit=1`, {
      method: "GET",
      headers: authHeaders,
    }),
    probe(`${url}/rest/v1/v_monthly_pnl?select=month&limit=1`, {
      method: "GET",
      headers: authHeaders,
    }),
  ]);

  const authServiceStatus = statusOf(authService);
  const authSettingsStatus = statusOf(authSettings);
  const tableStatus = statusOf(table);
  const viewStatus = statusOf(view);

  // PostgREST answers 401/403 when the role has no privilege on the relation,
  // 404 (PGRST205) when the relation is unknown and 400 when the query itself
  // cannot be planned.
  const relationKnown = (status: number) =>
    status === 200 || status === 401 || status === 403;

  const checks = {
    env: { ok: true },
    auth: {
      ok: authServiceStatus === 200 && authSettingsStatus === 200,
      detail:
        authServiceStatus === 200
          ? authSettingsStatus === 200
            ? "ok"
            : "publishable key rejected"
          : "auth service unreachable",
    },
    tables: {
      ok: relationKnown(tableStatus),
      detail: relationKnown(tableStatus)
        ? "month_closings available"
        : tableStatus === 404
          ? "month_closings not found — apply the migrations"
          : "postgrest unreachable",
    },
    views: {
      ok: relationKnown(viewStatus),
      detail: relationKnown(viewStatus)
        ? "v_monthly_pnl available"
        : viewStatus === 400
          ? `v_monthly_pnl does not answer — ${messageOf(view, "query error")}`
          : viewStatus === 404
            ? "v_monthly_pnl not found — apply the migrations"
            : "postgrest unreachable",
    },
  };

  const ok = Object.values(checks).every((check) => check.ok);

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      time: new Date().toISOString(),
      checks,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
