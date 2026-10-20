import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, ChevronLeft, Plus } from "lucide-react";

import {
  LocationStockChips,
  MovementTypeBadge,
  StockStatusBadge,
  StockValue,
} from "@/components/app/inventory-badges";
import { PageHeader } from "@/components/app/page-header";
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
import { formatDate, formatDecimal, formatMoney } from "@/lib/format";
import {
  PRODUCT_KIND_LABELS,
  formatMovementQty,
  movementRoute,
  signedMovementQty,
} from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Produto",
};

type Params = Promise<{ id: string }>;

export default async function ProdutoEstoquePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [productResult, totalResult, stockResult, movementsResult] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, sku, name, kind, is_active")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("v_stock_product_totals")
        .select("qty_on_hand, price_ouro, stock_value")
        .eq("product_id", id)
        .maybeSingle(),
      supabase
        .from("v_stock_on_hand")
        .select("location, qty_on_hand")
        .eq("product_id", id)
        .order("location"),
      supabase
        .from("inventory_movements")
        .select(
          "id, moved_on, type, location_from, location_to, qty, event_label, notes, purchase_id, sale_id",
        )
        .eq("product_id", id)
        .order("moved_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const firstError = [
    productResult.error,
    totalResult.error,
    stockResult.error,
    movementsResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const product = productResult.data;
  if (!product) notFound();

  const total = totalResult.data;
  const stockRows = (stockResult.data ?? []).map((row) => ({
    product_id: id,
    location: row.location,
    qty_on_hand: row.qty_on_hand,
  }));
  const movements = movementsResult.data ?? [];
  const qty = Number(total?.qty_on_hand ?? 0);
  const kindLabel = PRODUCT_KIND_LABELS[product.kind] ?? product.kind;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/estoque"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Estoque
        </Link>
      </div>

      <PageHeader
        title={product.name}
        description={`SKU ${product.sku} · ${kindLabel}${
          product.is_active === false ? " · Inativo" : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-9 font-bold">
              <Link href={`/compras/nova?produto=${product.id}`}>
                <Plus />
                Nova compra
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href={`/estoque/movimentacoes/nova?produto=${product.id}`}>
                <ArrowLeftRight />
                Movimentar
              </Link>
            </Button>
          </div>
        }
      />

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        <div className="bg-paper px-4 py-4 sm:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Saldo</dt>
          <dd className="num mt-1.5 flex items-center gap-2 text-[18px] leading-none font-medium">
            {formatDecimal(qty)}
            <StockStatusBadge qty={qty} />
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Locais</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {stockRows.length}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Preço Ouro
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            <StockValue value={total?.price_ouro ?? null} />
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Valor em estoque
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(total?.stock_value ?? 0)}
          </dd>
        </div>
      </dl>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Saldo por local
          </h2>
          <LocationStockChips rows={stockRows} />
        </div>

        {stockRows.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-center text-sm text-ink-soft">
            Nenhuma movimentação de estoque para este produto.
          </p>
        ) : (
          <div className="mt-3 border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Local
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Saldo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockRows.map((row) => (
                  <TableRow
                    key={row.location}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="num border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px]">
                      {row.location}
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 pr-3 text-right text-[13px]">
                      {formatDecimal(row.qty_on_hand)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Movimentações recentes
          </h2>
          <Link
            href={`/estoque/movimentacoes?q=${encodeURIComponent(product.sku)}`}
            className="text-xs font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Ver histórico completo
          </Link>
        </div>

        {movements.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-center text-sm text-ink-soft">
            Nenhuma movimentação registrada.
          </p>
        ) : (
          <div className="mt-3 border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Tipo
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Local
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Qtd.
                  </TableHead>
                  <TableHead className="hidden h-9 pr-3 text-[10.5px] font-medium text-ink-soft md:table-cell">
                    Observação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => {
                  const signed = signedMovementQty(movement);
                  return (
                    <TableRow
                      key={movement.id}
                      className="border-line/80 hover:bg-moss-soft/25"
                    >
                      <TableCell className="num border-l-[3px] border-l-transparent py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                        {formatDate(movement.moved_on)}
                      </TableCell>
                      <TableCell className="px-2 py-2.5">
                        <MovementTypeBadge type={movement.type} />
                      </TableCell>
                      <TableCell className="num hidden px-2 py-2.5 text-[11.5px] text-ink-soft sm:table-cell">
                        {movementRoute(movement)}
                      </TableCell>
                      <TableCell
                        className={
                          signed < 0
                            ? "num px-2 py-2.5 text-right text-[12px] whitespace-nowrap text-rust-ink"
                            : "num px-2 py-2.5 text-right text-[12px] whitespace-nowrap text-moss-ink"
                        }
                      >
                        {formatMovementQty(movement)}
                      </TableCell>
                      <TableCell className="hidden max-w-[240px] px-2 py-2.5 pr-3 text-[11.5px] text-ink-soft md:table-cell">
                        {movement.purchase_id ? (
                          <Link
                            href={`/compras/${movement.purchase_id}`}
                            className="block truncate underline-offset-2 hover:underline"
                          >
                            {movement.notes || movement.event_label || "Compra"}
                          </Link>
                        ) : (
                          <span className="block truncate">
                            {movement.notes || movement.event_label || "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
