import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { VendaForm } from "./venda-form";

export const metadata: Metadata = {
  title: "Lançar venda",
};

const PAYMENT_ORDER: Record<string, number> = {
  cash: 0,
  pix: 1,
  debit: 2,
  voucher: 3,
  credit: 4,
  ticket: 5,
  exception: 6,
  financial: 7,
};

const DEAL_ORDER: Record<string, number> = {
  sale: 0,
  discount: 1,
  negocio: 2,
  consumo: 3,
  brinde: 4,
  loan_out: 5,
  return: 6,
  financial: 7,
};

export default async function NovaVendaPage() {
  const supabase = await createClient();

  const [clientsResult, productsResult, dealTypesResult, paymentMethodsResult] =
    await Promise.all([
      supabase.from("clients").select("id, name").order("name").limit(2000),
      supabase
        .from("products")
        .select("id, name, sku, pv")
        .eq("is_active", true)
        .order("name")
        .limit(1000),
      supabase
        .from("deal_types")
        .select("code, label, kind")
        .eq("active", true),
      supabase
        .from("payment_methods")
        .select("code, label, kind, settlement_days")
        .eq("active", true),
    ]);

  const firstError = [
    clientsResult.error,
    productsResult.error,
    dealTypesResult.error,
    paymentMethodsResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  const dealTypes = (dealTypesResult.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        (DEAL_ORDER[a.kind] ?? 99) - (DEAL_ORDER[b.kind] ?? 99) ||
        a.label.localeCompare(b.label, "pt-BR"),
    );

  const paymentMethods = (paymentMethodsResult.data ?? []).slice().sort(
    (a, b) =>
      (PAYMENT_ORDER[a.kind] ?? 99) - (PAYMENT_ORDER[b.kind] ?? 99) ||
      (a.settlement_days ?? 0) - (b.settlement_days ?? 0) ||
      a.label.localeCompare(b.label, "pt-BR"),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href="/vendas"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Vendas
        </Link>
      </div>

      <PageHeader
        title="Lançar venda"
        description="Registre a venda para o controle do mês."
      />

      <div className="mt-6">
        <VendaForm
          data={{
            clients: clientsResult.data ?? [],
            products: productsResult.data ?? [],
            dealTypes,
            paymentMethods,
            today: todayISO(),
          }}
        />
      </div>
    </div>
  );
}
