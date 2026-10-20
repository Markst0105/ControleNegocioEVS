import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { isUuid } from "@/lib/clients";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { MovementForm } from "../movement-form";

export const metadata: Metadata = {
  title: "Nova movimentação",
};

type SearchParams = Promise<{ produto?: string }>;

const LOCATION_ORDER: Record<string, number> = {
  EVS: 0,
  CASA: 1,
  MALA: 2,
  BUFFER: 3,
};

export default async function NovaMovimentacaoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [productsResult, locationsResult, counterpartiesResult] =
    await Promise.all([
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
        .from("counterparties")
        .select("id, name")
        .eq("active", true)
        .order("name"),
    ]);

  const firstError = [
    productsResult.error,
    locationsResult.error,
    counterpartiesResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const products = productsResult.data ?? [];
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
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href="/estoque/movimentacoes"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Movimentações
        </Link>
      </div>

      <PageHeader
        title="Nova movimentação"
        description="Transfira, ajuste, empreste ou devolva produtos."
      />

      <div className="mt-6">
        <MovementForm
          data={{
            products,
            locations,
            counterparties: counterpartiesResult.data ?? [],
            today: todayISO(),
            initialProductId,
          }}
        />
      </div>
    </div>
  );
}
