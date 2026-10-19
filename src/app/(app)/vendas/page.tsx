import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Search } from "lucide-react";

import { DealBadge, OriginBadge } from "@/components/app/badges";
import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  formatMonth,
  monthFirstDay,
  nextMonthFirstDay,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Vendas",
};

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  mes?: string;
  q?: string;
  pagina?: string;
  ok?: string;
}>;

export default async function VendasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const currentMonth = currentMonthISO();
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "")
    ? (params.mes as string)
    : currentMonth;
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const from = monthFirstDay(mes);
  const to = nextMonthFirstDay(mes);

  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();

  let query = supabase
    .from("sales")
    .select(
      "id, sold_on, client_name_raw, product_name_raw, deal_type_code, discount_pct, origin, amount_received, profit",
      { count: "exact" },
    )
    .gte("sold_on", from)
    .lt("sold_on", to)
    .order("sold_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    query = query.or(
      `client_name_raw.ilike."%${search}%",product_name_raw.ilike."%${search}%"`,
    );
  }

  const [{ data: sales, count, error }, dealTypesResult] = await Promise.all([
    query,
    supabase.from("deal_types").select("code, label"),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dealLabels = new Map(
    (dealTypesResult.data ?? []).map((deal) => [deal.code, deal.label]),
  );
  const filtered = Boolean(params.q?.trim()) || mes !== currentMonth;

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    sp.set("mes", mes);
    if (q) sp.set("q", q);
    if (target > 1) sp.set("pagina", String(target));
    return `/vendas?${sp.toString()}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {params.ok ? <FlashToast message="Venda registrada." /> : null}
      </Suspense>

      <PageHeader
        title="Vendas"
        description={formatMonth(mes)}
        actions={
          <Button asChild className="hidden lg:inline-flex">
            <Link href="/vendas/nova">
              <Plus />
              Lançar venda
            </Link>
          </Button>
        }
      />

      <form
        method="get"
        action="/vendas"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid gap-1.5">
          <Label
            htmlFor="mes"
            className="text-[11px] font-medium text-ink-soft"
          >
            Mês
          </Label>
          <Input
            id="mes"
            type="month"
            name="mes"
            defaultValue={mes}
            className="num h-9 w-40"
          />
        </div>

        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="q" className="text-[11px] font-medium text-ink-soft">
            Buscar
          </Label>
          <Input
            id="q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cliente ou produto…"
            className="h-9"
          />
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {filtered ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/vendas">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {total === 0 ? (
        <Empty className="border border-line bg-surface">
          <EmptyHeader>
            <EmptyTitle>
              {filtered ? "Nenhum resultado" : "Nenhum lançamento neste mês"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste o mês ou a busca para encontrar os lançamentos."
                : "Registre a primeira venda do mês para começar."}
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm">
            <Link href="/vendas/nova">Lançar venda</Link>
          </Button>
        </Empty>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 pl-3 text-[11px] font-medium text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-8 text-[11px] font-medium text-ink-soft">
                    Cliente
                  </TableHead>
                  <TableHead className="hidden h-8 text-[11px] font-medium text-ink-soft md:table-cell">
                    Produto
                  </TableHead>
                  <TableHead className="hidden h-8 text-[11px] font-medium text-ink-soft lg:table-cell">
                    Negócio
                  </TableHead>
                  <TableHead className="h-8 text-[11px] font-medium text-ink-soft">
                    Origem
                  </TableHead>
                  <TableHead className="h-8 text-right text-[11px] font-medium text-ink-soft">
                    Valor
                  </TableHead>
                  <TableHead className="hidden h-8 pr-3 text-right text-[11px] font-medium text-ink-soft sm:table-cell">
                    Lucro
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales?.map((sale) => {
                  const profit = sale.profit;
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="num px-2 py-1.5 pl-3 text-[13px] whitespace-nowrap text-ink-soft">
                        {formatDate(sale.sold_on)}
                      </TableCell>
                      <TableCell className="max-w-[190px] px-2 py-1.5 text-[13px]">
                        <span
                          className={
                            sale.client_name_raw
                              ? "block truncate font-medium"
                              : "block truncate text-ink-soft"
                          }
                        >
                          {sale.client_name_raw ?? "Balcão"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-[240px] px-2 py-1.5 text-[13px] text-ink-soft md:table-cell">
                        <span className="block truncate">
                          {sale.product_name_raw ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden px-2 py-1.5 lg:table-cell">
                        <DealBadge
                          label={
                            sale.deal_type_code
                              ? dealLabels.get(sale.deal_type_code)
                              : null
                          }
                          discountPct={sale.discount_pct}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <OriginBadge origin={sale.origin} />
                      </TableCell>
                      <TableCell className="num px-2 py-1.5 text-right text-[13px] whitespace-nowrap">
                        {formatMoney(sale.amount_received)}
                      </TableCell>
                      <TableCell
                        className={
                          profit !== null && profit < 0
                            ? "num hidden px-2 py-1.5 pr-3 text-right text-[13px] whitespace-nowrap text-rust-ink sm:table-cell"
                            : "num hidden px-2 py-1.5 pr-3 text-right text-[13px] whitespace-nowrap text-ink-soft sm:table-cell"
                        }
                      >
                        {formatMoney(profit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)} {total === 1 ? "lançamento" : "lançamentos"} ·
              página {page} de {totalPages}
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
