import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type ClientOverviewStats = {
  id: string;
  sales_count: number;
  total_spent: number;
  last_purchase_on: string | null;
  open_amount: number;
};

/**
 * Sales/open-receivable aggregates for a bounded set of clients.
 *
 * Used by the client list so the database only aggregates the 25 rows on the
 * current page instead of every client. RLS remains in effect because the
 * function is SECURITY INVOKER.
 */
export async function getClientOverviewStats(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, ClientOverviewStats>> {
  if (ids.length === 0) return new Map<string, ClientOverviewStats>();

  const { data, error } = await supabase.rpc("client_overview_for_ids", {
    p_ids: ids,
  });

  if (error) throw new Error(error.message);

  const rows: ClientOverviewStats[] = data ?? [];
  return new Map(rows.map((row) => [row.id, row] as const));
}
