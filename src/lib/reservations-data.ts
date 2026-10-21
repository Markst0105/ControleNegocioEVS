import type { SupabaseClient } from "@supabase/supabase-js";

import { RESERVATION_STATUSES } from "@/lib/reservations";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

type ReservationBase = {
  id: string;
  member_id: string;
  status: string;
  created_at: string | null;
  confirmed_at: string | null;
  converted_sale_id: string | null;
};

export type ReservationSummary = ReservationBase & {
  member_name: string;
  item_count: number;
  total_qty: number;
  total: number;
  pv_total: number;
  sale_count: number;
  sales_total: number;
};

const RESERVATION_COLUMNS =
  "id, member_id, status, created_at, confirmed_at, converted_sale_id";

function numeric(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function withTotals(
  supabase: Supabase,
  reservations: ReservationBase[],
  options: { includeSales: boolean },
): Promise<ReservationSummary[]> {
  if (reservations.length === 0) return [];

  const ids = reservations.map((reservation) => reservation.id);
  const memberIds = Array.from(
    new Set(reservations.map((reservation) => reservation.member_id)),
  );

  const [itemsResult, profilesResult, salesResult] = await Promise.all([
    supabase
      .from("reservation_items")
      .select("reservation_id, qty, unit_price, pv")
      .in("reservation_id", ids),
    supabase.from("profiles").select("id, name").in("id", memberIds),
    options.includeSales
      ? supabase
          .from("sales")
          .select("reservation_id, amount_received")
          .in("reservation_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = [
    itemsResult.error,
    profilesResult.error,
    salesResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const itemTotals = new Map<
    string,
    { count: number; qty: number; total: number; pv: number }
  >();
  for (const item of itemsResult.data ?? []) {
    const current = itemTotals.get(item.reservation_id) ?? {
      count: 0,
      qty: 0,
      total: 0,
      pv: 0,
    };
    current.count += 1;
    current.qty += numeric(item.qty);
    current.total += numeric(item.qty) * numeric(item.unit_price);
    current.pv += numeric(item.qty) * numeric(item.pv);
    itemTotals.set(item.reservation_id, current);
  }

  const saleTotals = new Map<string, { count: number; total: number }>();
  for (const sale of salesResult.data ?? []) {
    if (!sale.reservation_id) continue;
    const current = saleTotals.get(sale.reservation_id) ?? {
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += numeric(sale.amount_received);
    saleTotals.set(sale.reservation_id, current);
  }

  const names = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.name]),
  );

  return reservations.map((reservation) => {
    const items = itemTotals.get(reservation.id) ?? {
      count: 0,
      qty: 0,
      total: 0,
      pv: 0,
    };
    const sales = saleTotals.get(reservation.id) ?? { count: 0, total: 0 };

    return {
      ...reservation,
      member_name: names.get(reservation.member_id) ?? "Membro",
      item_count: items.count,
      total_qty: items.qty,
      total: items.total,
      pv_total: items.pv,
      sale_count: sales.count,
      sales_total: sales.total,
    };
  });
}

export async function getReservationsPage(
  supabase: Supabase,
  options: {
    page: number;
    pageSize: number;
    status?: string;
    memberId?: string;
    includeSales: boolean;
  },
): Promise<{ rows: ReservationSummary[]; total: number }> {
  const { page, pageSize, status, memberId, includeSales } = options;
  let query = supabase
    .from("reservations")
    .select(RESERVATION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) query = query.eq("status", status);
  if (memberId) query = query.eq("member_id", memberId);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return {
    rows: await withTotals(
      supabase,
      (data ?? []) as ReservationBase[],
      { includeSales },
    ),
    total: count ?? 0,
  };
}

export async function getReservationSummary(
  supabase: Supabase,
  id: string,
  options: { includeSales: boolean },
): Promise<ReservationSummary | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const [summary] = await withTotals(
    supabase,
    [data as ReservationBase],
    { includeSales: options.includeSales },
  );
  return summary ?? null;
}

export async function getReservationStatusCounts(
  supabase: Supabase,
  memberId?: string,
): Promise<Map<string, number>> {
  const results = await Promise.all(
    RESERVATION_STATUSES.map(async (status) => {
      let query = supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (memberId) query = query.eq("member_id", memberId);
      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return [status, count ?? 0] as const;
    }),
  );

  return new Map(results);
}
