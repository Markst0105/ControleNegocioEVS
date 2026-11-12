import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PurchasePaymentBadge } from "@/components/app/purchase-payment-badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  currentMonthISO,
  formatDate,
  formatInt,
  formatMoney,
  monthFirstDay,
  nextMonthFirstDay,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Compras",
};

const PAGE_SIZE = 25;

type SearchParams = Promise<{ pagina?: string; status?: string }>;

type PaymentFilter = "all" | "pending" | "paid";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const status: PaymentFilter =
    params.status === "pending" || params.status === "paid"
      ? params.status
      : "all";

  const supabase = await createClient();
  const month = currentMonthISO();
  const monthStart = monthFirstDay(month);
  const monthEnd = nextMonthFirstDay(month);

  let purchasesQuery = supabase
    .from("v_purchase_overview")
    .select(
      "id, purchased_on, supplier_name, account_name, paid_on, is_credit_card, invoice_no, location_code, item_count, total_units, total_cost",
      { count: "exact" },
    )
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status === "pending") {
    purchasesQuery = purchasesQuery.is("paid_on", null);
  } else if (status === "paid") {
    purchasesQuery = purchasesQuery.not("paid_on", "is", null);
  }

  const [purchasesResult, monthResult, pendingResult, historyResult] =
    await Promise.all([
      purchasesQuery,
      supabase
        .from("v_purchase_overview")
        .select("id, total_cost")
        .gte("purchased_on", monthStart)
        .lt("purchased_on", monthEnd),
      supabase
        .from("v_purchase_overview")
        .select("id, total_cost")
        .is("paid_on", null),
      supabase
        .from("v_purchase_overview")
        .select("id", { count: "exact", head: true }),
    ]);

  const firstError = [
    purchasesResult.error,
    monthResult.error,
    pendingResult.error,
    historyResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const purchases = purchasesResult.data ?? [];
  const total = purchasesResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const monthCost = (monthResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.total_cost ?? 0),
    0,
  );
  const monthCount = (monthResult.data ?? []).length;
  const pending = pendingResult.data ?? [];
  const pendingCost = pending.reduce(
    (sum, row) => sum + Number(row.total_cost ?? 0),
    0,
  );
  const historyCount = historyResult.count ?? 0;
  const filtered = status !== "all";

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (status !== "all") sp.set("status", status);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString ? `/compras?${queryString}` : "/compras";
  }

  function statusHref(nextStatus: PaymentFilter) {
    return nextStatus === "all" ? "/compras" : `/compras?status=${nextStatus}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Compras"
        description="Entradas de mercadoria, fornecedores e custo dos pedidos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-9 font-bold">
              <Link href="/compras/nova">
                <Plus />
                Nova compra
              </Link>
            </Button>
          </div>
        }
      />

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4">
        <div className="bg-paper px-4 py-4 lg:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">
            Compras no mês
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(monthCount)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Custo no mês
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(monthCost)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Pagamentos pendentes
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium text-citrus-ink">
            {formatInt(pending.length)}
          </dd>
          <dd className="num mt-1 text-[10.5px] text-ink-soft">
            {formatMoney(pendingCost)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Histórico</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(historyCount)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-xs">
        <span className="text-ink-soft">Pagamento</span>
        {(
          [
            ["all", "Todas"],
            ["pending", "Pendentes"],
            ["paid", "Pagas"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            asChild
            variant={status === value ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-[11px]"
          >
            <Link href={statusHref(value)}>{label}</Link>
          </Button>
        ))}
      </div>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered ? "Nenhuma compra neste filtro" : "Nenhuma compra registrada"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Troque o filtro de pagamento para ver as outras compras."
                : "Registre a entrada de produtos para começar o controle de custo."}
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/compras">Ver todas</Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="font-bold">
              <Link href="/compras/nova">Nova compra</Link>
            </Button>
          )}
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Fornecedor / nota
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Pagamento
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft lg:table-cell">
                    Destino
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft md:table-cell">
                    Itens
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Custo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow
                    key={purchase.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="num border-l-[3px] border-l-moss py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                      {formatDate(purchase.purchased_on)}
                    </TableCell>
                    <TableCell className="max-w-[280px] px-2 py-2.5 text-[13px]">
                      <Link
                        href={`/compras/${purchase.id}`}
                        className="block truncate font-medium underline-offset-2 hover:underline"
                      >
                        {purchase.supplier_name ?? "Compra"}
                      </Link>
                      <span className="block truncate text-[11px] text-ink-soft">
                        {purchase.invoice_no ?? "Sem nota/referência"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 sm:table-cell">
                      <PurchasePaymentBadge
                        paidOn={purchase.paid_on}
                        isCreditCard={purchase.is_credit_card}
                      />
                      {purchase.account_name ? (
                        <span className="mt-0.5 block truncate text-[10px] text-ink-soft">
                          {purchase.account_name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-[12px] text-ink-soft lg:table-cell">
                      {purchase.location_code}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] text-ink-soft md:table-cell">
                      {formatInt(Number(purchase.item_count))}
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 pr-3 text-right text-[13px] whitespace-nowrap">
                      {formatMoney(purchase.total_cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)} {total === 1 ? "compra" : "compras"} · página{" "}
              {page} de {totalPages}
            </p>

            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={pageHref(page - 1)}>Anterior</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8" disabled>
                  Anterior
                </Button>
              )}
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={pageHref(page + 1)}>Próxima</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8" disabled>
                  Próxima
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
