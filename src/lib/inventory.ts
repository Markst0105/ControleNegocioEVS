import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { formatDecimal } from "@/lib/format";

export const LOW_STOCK_THRESHOLD = 3;

export const PRODUCT_KIND_LABELS: Record<string, string> = {
  ni: "N.I",
  ne: "N.E",
  access: "Acesso",
  supply: "Suprimento",
  complement: "Complemento",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase: "Compra",
  sale: "Venda",
  transfer: "Transferência",
  loan_out: "Empréstimo saída",
  loan_in: "Empréstimo entrada",
  return: "Devolução",
  adjustment: "Ajuste",
  count: "Contagem",
};

export const MANUAL_MOVEMENT_TYPES = [
  "transfer",
  "adjustment",
  "loan_out",
  "loan_in",
  "return",
] as const;

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export const MANUAL_MOVEMENT_LABELS: Record<ManualMovementType, string> = {
  transfer: "Transferência entre locais",
  adjustment: "Ajuste de saldo",
  loan_out: "Empréstimo (saída)",
  loan_in: "Empréstimo (entrada)",
  return: "Devolução",
};

export function movementTypeLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? type;
}

export function isManualMovementType(value: string): value is ManualMovementType {
  return (MANUAL_MOVEMENT_TYPES as readonly string[]).includes(value);
}

export type StockLocationRow = {
  product_id: string;
  location: string;
  qty_on_hand: number;
};

/**
 * Stock by location for a bounded set of products. Used by the inventory list
 * so we only load the location breakdown for the current page.
 */
export async function getStockLocations(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, StockLocationRow[]>> {
  if (ids.length === 0) return new Map<string, StockLocationRow[]>();

  const { data, error } = await supabase.rpc("stock_for_products", {
    p_ids: ids,
  });

  if (error) throw new Error(error.message);

  const byProduct = new Map<string, StockLocationRow[]>();
  for (const row of (data ?? []) as StockLocationRow[]) {
    const rows = byProduct.get(row.product_id) ?? [];
    rows.push(row);
    byProduct.set(row.product_id, rows);
  }

  for (const rows of byProduct.values()) {
    rows.sort((a, b) => a.location.localeCompare(b.location, "pt-BR"));
  }

  return byProduct;
}

export type InventorySummary = {
  total_products: number;
  total_units: number;
  low_stock: number;
  out_of_stock: number;
  stock_value: number;
};

const EMPTY_SUMMARY: InventorySummary = {
  total_products: 0,
  total_units: 0,
  low_stock: 0,
  out_of_stock: 0,
  stock_value: 0,
};

export async function getInventorySummary(
  supabase: SupabaseClient<Database>,
  search: string,
): Promise<InventorySummary> {
  const { data, error } = await supabase.rpc("inventory_summary", {
    p_search: search || null,
  });

  if (error) throw new Error(error.message);
  return data?.[0] ?? EMPTY_SUMMARY;
}

export function stockStatus(qty: number): "out" | "low" | "ok" {
  if (qty <= 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

export type MovementLike = {
  qty: number;
  location_from: string | null;
  location_to: string | null;
};

/**
 * Signed quantity for display. New movements use positive qty plus a
 * location side; legacy rows use location_to with a signed qty.
 */
export function signedMovementQty(movement: MovementLike): number {
  const qty = Number(movement.qty);
  if (Number.isNaN(qty)) return 0;

  if (movement.location_from && movement.location_to) return qty;
  if (movement.location_from) return -Math.abs(qty);
  return qty;
}

export function formatSignedQty(value: number): string {
  if (value === 0) return "0,00";
  return `${value > 0 ? "+" : "−"}${formatDecimal(Math.abs(value))}`;
}

/** Transfers show the moved quantity without a direction sign. */
export function formatMovementQty(movement: MovementLike): string {
  if (movement.location_from && movement.location_to) {
    return formatDecimal(Math.abs(Number(movement.qty)));
  }
  return formatSignedQty(signedMovementQty(movement));
}

export function movementRoute(movement: {
  location_from: string | null;
  location_to: string | null;
}): string {
  if (movement.location_from && movement.location_to) {
    return `${movement.location_from} → ${movement.location_to}`;
  }
  if (movement.location_from) return `Saída · ${movement.location_from}`;
  if (movement.location_to) return `Entrada · ${movement.location_to}`;
  return "—";
}
