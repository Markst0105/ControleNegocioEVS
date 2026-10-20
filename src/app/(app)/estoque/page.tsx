import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ClipboardCheck, Plus, Search } from "lucide-react";

import {
  LocationStockChips,
  StockStatusBadge,
  StockValue,
} from "@/components/app/inventory-badges";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDecimal, formatInt, formatMoney } from "@/lib/format";
import {
  LOW_STOCK_THRESHOLD,
  getInventorySummary,
  getStockLocations,
} from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Estoque",
};

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  q?: string;
  status?: string;
  pagina?: string;
}>;

type StockStatusFilter = "all" | "low" | "out";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const status: StockStatusFilter =
    params.status === "low" || params.status === "out" ? params.status : "all";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();

  const supabase = await createClient();

  let productsQuery = supabase
    .from("v_stock_product_totals")
    .select(
      "product_id, sku, name, kind, is_active, qty_on_hand, unit_cost, stock_value",
      { count: "exact" },
    )
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    productsQuery = productsQuery.or(
      `name.ilike."%${search}%",sku.ilike."%${search}%"`,
    );
  }

  if (status === "low") {
    productsQuery = productsQuery
      .gt("qty_on_hand", 0)
      .lte("qty_on_hand", LOW_STOCK_THRESHOLD);
  } else if (status === "out") {
    productsQuery = productsQuery.lte("qty_on_hand", 0);
  }

  const [productsResult, summary] = await Promise.all([
    productsQuery,
    getInventorySummary(supabase, search),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);

  const products = productsResult.data ?? [];
  const total = productsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stockByProduct = await getStockLocations(
    supabase,
    products.map((product) => product.product_id),
  );
  const filtered = Boolean(q) || status !== "all";

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status !== "all") sp.set("status", status);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString ? `/estoque?${queryString}` : "/estoque";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Estoque"
        description="Saldo por produto e local, com custo e valor de reposição."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="h-9 font-bold">
              <Link href="/compras/nova">
                <Plus />
                Nova compra
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href="/estoque/movimentacoes/nova">
                <ArrowLeftRight />
                Movimentar
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-9">
              <Link href="/estoque/contagens/nova">
                <ClipboardCheck />
                Contagem
              </Link>
            </Button>
          </div>
        }
      />

      <nav
        aria-label="Seções do estoque"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line pb-2 text-xs"
      >
        <span className="font-medium text-ink">Visão geral</span>
        <Link
          href="/estoque/movimentacoes"
          className="text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Movimentações
        </Link>
        <Link
          href="/estoque/contagens"
          className="text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Contagens
        </Link>
        <Link
          href="/compras"
          className="text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Compras
        </Link>
      </nav>

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-5">
        <div className="bg-paper px-4 py-4 lg:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Produtos</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(summary.total_products)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Unidades</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatDecimal(summary.total_units)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Estoque baixo</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium text-citrus-ink">
            {formatInt(summary.low_stock)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Sem estoque</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium text-rust-ink">
            {formatInt(summary.out_of_stock)}
          </dd>
        </div>
        <div className="col-span-2 bg-paper px-4 py-4 lg:col-span-1">
          <dt className="text-[11px] font-medium text-ink-soft">Valor</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(summary.stock_value)}
          </dd>
        </div>
      </dl>

      <form method="get" action="/estoque" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="status" className="text-[11px] font-medium text-ink-soft">
            Situação
          </Label>
          <Select name="status" defaultValue={status}>
            <SelectTrigger id="status" className="h-9 w-44 bg-surface">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="low">Estoque baixo</SelectItem>
              <SelectItem value="out">Sem estoque</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="q" className="text-[11px] font-medium text-ink-soft">
            Buscar produto
          </Label>
          <Input
            id="q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nome ou SKU…"
            className="h-9"
          />
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {filtered ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/estoque">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered ? "Nenhum produto encontrado" : "Nenhum produto no estoque"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste a busca ou a situação para ver outros produtos."
                : "Registre uma compra para começar o controle de estoque."}
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" className="font-bold">
            <Link href="/compras/nova">Nova compra</Link>
          </Button>
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Produto
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft md:table-cell">
                    Locais
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Saldo
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Custo
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow
                    key={product.product_id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="max-w-[300px] border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link
                          href={`/estoque/${product.product_id}`}
                          className="truncate font-medium underline-offset-2 hover:underline"
                        >
                          {product.name}
                        </Link>
                        {product.is_active === false ? (
                          <span className="shrink-0 rounded-sm border border-line bg-surface px-1 py-px text-[9px] text-ink-soft">
                            Inativo
                          </span>
                        ) : null}
                      </div>
                      <span className="num block truncate text-[11px] text-ink-soft">
                        {product.sku}
                      </span>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 md:table-cell">
                      <LocationStockChips
                        rows={stockByProduct.get(product.product_id)}
                      />
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 text-right whitespace-nowrap">
                      <span className="mr-1.5 text-[13px] font-medium">
                        {formatDecimal(product.qty_on_hand)}
                      </span>
                      <StockStatusBadge qty={Number(product.qty_on_hand)} />
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] whitespace-nowrap text-ink-soft sm:table-cell">
                      <StockValue value={product.unit_cost} />
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 pr-3 text-right text-[12px] whitespace-nowrap">
                      {formatMoney(product.stock_value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)} {total === 1 ? "produto" : "produtos"} · página{" "}
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
