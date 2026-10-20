import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { isUuid } from "@/lib/clients";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { PurchaseForm } from "../purchase-form";

export const metadata: Metadata = {
  title: "Nova compra",
};

type SearchParams = Promise<{ produto?: string }>;

const LOCATION_ORDER: Record<string, number> = {
  EVS: 0,
  CASA: 1,
  MALA: 2,
  BUFFER: 3,
};

export default async function NovaCompraPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [
    productsResult,
    costsResult,
    suppliersResult,
    accountsResult,
    locationsResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku")
      .eq("is_active", true)
      .order("name")
      .limit(1000),
    supabase
      .from("v_stock_product_totals")
      .select("product_id, unit_cost")
      .limit(1000),
    supabase
      .from("counterparties")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("locations")
      .select("code, label")
      .eq("active", true)
      .order("code"),
  ]);

  const firstError = [
    productsResult.error,
    costsResult.error,
    suppliersResult.error,
    accountsResult.error,
    locationsResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const costs = new Map(
    (costsResult.data ?? []).map((row) => [row.product_id, row.unit_cost]),
  );
  const products = (productsResult.data ?? []).map((product) => ({
    ...product,
    last_cost: costs.get(product.id) ?? null,
  }));

  const initialProductId =
    params.produto && isUuid(params.produto)
      ? products.find((product) => product.id === params.produto)?.id
      : undefined;

  const locations = (locationsResult.data ?? []).slice().sort(
    (a, b) =>
      (LOCATION_ORDER[a.code] ?? 99) - (LOCATION_ORDER[b.code] ?? 99) ||
      a.label.localeCompare(b.label, "pt-BR"),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href="/compras"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Compras
        </Link>
      </div>

      <PageHeader
        title="Nova compra"
        description="Registre a entrada dos produtos e o custo de cada item."
      />

      <div className="mt-6">
        <PurchaseForm
          data={{
            products,
            suppliers: suppliersResult.data ?? [],
            accounts: accountsResult.data ?? [],
            locations,
            today: todayISO(),
            initialProductId,
          }}
        />
      </div>
    </div>
  );
}
