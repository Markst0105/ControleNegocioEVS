import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Plus } from "lucide-react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { PriceTierBadge } from "@/components/app/price-tier-badge";
import { PurchasePaymentBadge } from "@/components/app/purchase-payment-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isUuid } from "@/lib/clients";
import {
  formatDate,
  formatDecimal,
  formatInt,
  formatMoney,
  todayISO,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { PurchasePaymentForm } from "./payment-form";

export const metadata: Metadata = {
  title: "Compra",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string }>;

export default async function CompraPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [purchaseResult, itemsResult] = await Promise.all([
    supabase
      .from("v_purchase_overview")
      .select(
        "id, purchased_on, supplier_name, account_name, location_code, invoice_no, notes, item_count, total_units, total_cost, paid_on, is_credit_card",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("purchase_items")
      .select("id, product_id, qty, unit_cost, price_tier")
      .eq("purchase_id", id)
      .order("created_at"),
  ]);

  const firstError = [purchaseResult.error, itemsResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const purchase = purchaseResult.data;
  if (!purchase) notFound();

  const items = itemsResult.data ?? [];
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const productsResult =
    productIds.length > 0
      ? await supabase
          .from("products")
          .select("id, name, sku")
          .in("id", productIds)
      : { data: [], error: null };

  if (productsResult.error) throw new Error(productsResult.error.message);

  const products = new Map(
    (productsResult.data ?? []).map((product) => [product.id, product]),
  );

  const okMessage =
    query.ok === "pagamento"
      ? "Pagamento confirmado."
      : query.ok === "pagamento_removido"
        ? "Pagamento desmarcado. A compra voltou a ficar pendente."
        : query.ok
          ? "Compra registrada."
          : null;

  const title = purchase.invoice_no
    ? `Compra ${purchase.invoice_no}`
    : "Compra";
  const description = [
    formatDate(purchase.purchased_on),
    purchase.supplier_name ?? "Sem fornecedor",
    purchase.account_name ? `Conta ${purchase.account_name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <div>
        <Link
          href="/compras"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Compras
        </Link>
      </div>

      <PageHeader
        title={title}
        description={description}
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/compras/nova">
              <Plus />
              Nova compra
            </Link>
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        <div className="bg-paper px-4 py-4 sm:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Itens</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(Number(purchase.item_count))}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Unidades</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatDecimal(purchase.total_units)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Custo total
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(purchase.total_cost)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Destino</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {purchase.location_code}
          </dd>
        </div>
      </dl>

      {purchase.is_credit_card ? (
        <section
          className={
            purchase.paid_on
              ? "rounded-lg border border-line bg-surface"
              : "rounded-lg border border-citrus/30 bg-citrus-soft/60"
          }
        >
          <header className="border-b border-line/70 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-[20px] leading-none font-normal">
                Pagamento no cartão
              </h2>
              <PurchasePaymentBadge
                paidOn={purchase.paid_on}
                isCreditCard={purchase.is_credit_card}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-soft">
              {purchase.paid_on
                ? "Esta compra entra no caixa na data do pagamento."
                : "A compra ainda não saiu do caixa. Confirme quando a transação aparecer na fatura."}
            </p>
          </header>
          <div className="px-4 py-4">
            <PurchasePaymentForm
              purchaseId={purchase.id}
              today={todayISO()}
              paidOn={purchase.paid_on}
            />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="font-serif text-[24px] leading-none font-normal">
          Itens da compra
        </h2>

        {items.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-center text-sm text-ink-soft">
            Nenhum item registrado.
          </p>
        ) : (
          <div className="mt-3 border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Produto
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Qtd.
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Custo unit.
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = products.get(item.product_id);
                  return (
                    <TableRow
                      key={item.id}
                      className="border-line/80 hover:bg-moss-soft/25"
                    >
                      <TableCell className="max-w-[360px] border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px]">
                        <Link
                          href={`/estoque/${item.product_id}`}
                          className="block truncate font-medium underline-offset-2 hover:underline"
                        >
                          {product?.name ?? "Produto"}
                        </Link>
                        <span className="num block truncate text-[11px] text-ink-soft">
                          {product?.sku ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 text-right text-[12px]">
                        {formatDecimal(item.qty)}
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 text-right text-[12px] text-ink-soft">
                        <span className="flex flex-col items-end gap-1">
                          <span>{formatMoney(item.unit_cost)}</span>
                          <PriceTierBadge code={item.price_tier} />
                        </span>
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 pr-3 text-right text-[13px] whitespace-nowrap">
                        {formatMoney(Number(item.qty) * Number(item.unit_cost))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {purchase.notes ? (
        <section>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Observações
          </h2>
          <p className="mt-3 border-y border-line py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
            {purchase.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
