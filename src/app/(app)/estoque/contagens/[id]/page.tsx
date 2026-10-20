import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isUuid } from "@/lib/clients";
import { formatDate, formatDecimal, formatInt } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Contagem",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string }>;

export default async function ContagemPage({
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
  const [countResult, itemsResult] = await Promise.all([
    supabase
      .from("stock_counts")
      .select("id, location, counted_on, notes, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stock_count_items")
      .select("id, product_id, expected_qty, counted_qty")
      .eq("stock_count_id", id)
      .order("created_at"),
  ]);

  const firstError = [countResult.error, itemsResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const countRow = countResult.data;
  if (!countRow) notFound();

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

  const totalAdjustment = items.reduce(
    (sum, item) =>
      sum + Math.abs(Number(item.counted_qty) - Number(item.expected_qty)),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {query.ok ? <FlashToast message="Contagem registrada." /> : null}
      </Suspense>

      <div>
        <Link
          href="/estoque/contagens"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Contagens
        </Link>
      </div>

      <PageHeader
        title="Contagem"
        description={`${formatDate(countRow.counted_on)} · ${countRow.location}`}
      />

      <dl className="grid grid-cols-3 gap-px border-y border-line bg-line">
        <div className="bg-paper px-4 py-4 sm:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Produtos</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(items.length)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Ajuste total
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatDecimal(totalAdjustment)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Local</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {countRow.location}
          </dd>
        </div>
      </dl>

      <section>
        <h2 className="font-serif text-[24px] leading-none font-normal">
          Itens contados
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
                    No sistema
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Contado
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Diferença
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = products.get(item.product_id);
                  const diff = Number(item.counted_qty) - Number(item.expected_qty);

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
                      <TableCell className="num px-2 py-2.5 text-right text-[12px] text-ink-soft">
                        {formatDecimal(item.expected_qty)}
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 text-right text-[12px]">
                        {formatDecimal(item.counted_qty)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "num px-2 py-2.5 pr-3 text-right text-[12px]",
                          diff === 0
                            ? "text-ink-soft"
                            : diff > 0
                              ? "text-moss-ink"
                              : "text-rust-ink",
                        )}
                      >
                        {diff > 0 ? "+" : ""}
                        {formatDecimal(diff)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {countRow.notes ? (
        <section>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Observações
          </h2>
          <p className="mt-3 border-y border-line py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
            {countRow.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
