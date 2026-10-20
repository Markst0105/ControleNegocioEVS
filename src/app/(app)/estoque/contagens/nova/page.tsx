import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CountForm } from "../count-form";

export const metadata: Metadata = {
  title: "Nova contagem",
};

const LOCATION_ORDER: Record<string, number> = {
  EVS: 0,
  CASA: 1,
  MALA: 2,
  BUFFER: 3,
};

export default async function NovaContagemPage() {
  const supabase = await createClient();

  const [productsResult, locationsResult, stockResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku")
      .eq("is_active", true)
      .order("name")
      .limit(1000),
    supabase
      .from("locations")
      .select("code, label")
      .eq("active", true)
      .order("code"),
    supabase
      .from("v_stock_on_hand")
      .select("product_id, location, qty_on_hand")
      .limit(5000),
  ]);

  const firstError = [
    productsResult.error,
    locationsResult.error,
    stockResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const stockByLocation: Record<string, Record<string, number>> = {};
  for (const row of stockResult.data ?? []) {
    stockByLocation[row.product_id] ??= {};
    stockByLocation[row.product_id][row.location] = Number(row.qty_on_hand);
  }

  const locations = (locationsResult.data ?? []).slice().sort(
    (a, b) =>
      (LOCATION_ORDER[a.code] ?? 99) - (LOCATION_ORDER[b.code] ?? 99) ||
      a.label.localeCompare(b.label, "pt-BR"),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href="/estoque/contagens"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Contagens
        </Link>
      </div>

      <PageHeader
        title="Nova contagem"
        description="Informe a quantidade física; o sistema registra o ajuste."
      />

      <div className="mt-6">
        <CountForm
          data={{
            products: productsResult.data ?? [],
            locations,
            stockByLocation,
            today: todayISO(),
          }}
        />
      </div>
    </div>
  );
}
