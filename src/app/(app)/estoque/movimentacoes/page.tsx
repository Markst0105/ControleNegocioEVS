import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Search } from "lucide-react";

import { FlashToast } from "@/components/app/flash-toast";
import {
  MovementTypeBadge,
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
import { formatDate, formatInt } from "@/lib/format";
import {
  MOVEMENT_TYPE_LABELS,
  formatMovementQty,
  movementRoute,
  signedMovementQty,
} from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Movimentações",
};

const PAGE_SIZE = 30;

type SearchParams = Promise<{
  q?: string;
  tipo?: string;
  pagina?: string;
  ok?: string;
}>;

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const typeFilter = MOVEMENT_TYPE_LABELS[params.tipo ?? ""]
    ? (params.tipo as string)
    : "";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();

  const supabase = await createClient();

  let productIds: string[] | null = null;
  if (search) {
    const { data: matching, error: productError } = await supabase
      .from("products")
      .select("id")
      .or(`name.ilike."%${search}%",sku.ilike."%${search}%"`)
      .limit(500);

    if (productError) throw new Error(productError.message);
    productIds = (matching ?? []).map((product) => product.id);
  }

  let movementsQuery = supabase
    .from("inventory_movements")
    .select(
      "id, product_id, moved_on, type, location_from, location_to, qty, event_label, notes, purchase_id, sale_id, created_at",
      { count: "exact" },
    )
    .order("moved_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (typeFilter) movementsQuery = movementsQuery.eq("type", typeFilter);
  if (productIds) {
    movementsQuery =
      productIds.length > 0
        ? movementsQuery.in("product_id", productIds)
        : movementsQuery.eq("product_id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: movementRows, count, error } = await movementsQuery;
  if (error) throw new Error(error.message);

  const movements = movementRows ?? [];
  const visibleProductIds = [...new Set(movements.map((row) => row.product_id))];
  const productsResult =
    visibleProductIds.length > 0
      ? await supabase
          .from("products")
          .select("id, name, sku")
          .in("id", visibleProductIds)
      : { data: [], error: null };

  if (productsResult.error) throw new Error(productsResult.error.message);

  const products = new Map(
    (productsResult.data ?? []).map((product) => [product.id, product]),
  );

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q) || Boolean(typeFilter);

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (typeFilter) sp.set("tipo", typeFilter);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString
      ? `/estoque/movimentacoes?${queryString}`
      : "/estoque/movimentacoes";
  }

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {params.ok ? <FlashToast message="Movimentação registrada." /> : null}
      </Suspense>

      <PageHeader
        title="Movimentações"
        description="Entradas, saídas, transferências, ajustes e contagens."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/estoque/movimentacoes/nova">
              <Plus />
              Nova movimentação
            </Link>
          </Button>
        }
      />

      <form
        method="get"
        action="/estoque/movimentacoes"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="tipo" className="text-[11px] font-medium text-ink-soft">
            Tipo
          </Label>
          <Select name="tipo" defaultValue={typeFilter || "todos"}>
            <SelectTrigger id="tipo" className="h-9 w-44 bg-surface">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
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
            <Link href="/estoque/movimentacoes">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered
                ? "Nenhuma movimentação encontrada"
                : "Nenhuma movimentação registrada"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste o tipo ou a busca para encontrar o histórico."
                : "Registre a primeira entrada ou transferência de estoque."}
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" className="font-bold">
            <Link href="/estoque/movimentacoes/nova">
              Nova movimentação
            </Link>
          </Button>
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
                    Produto
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Tipo
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft md:table-cell">
                    Local
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Qtd.
                  </TableHead>
                  <TableHead className="hidden h-9 pr-3 text-[10.5px] font-medium text-ink-soft lg:table-cell">
                    Observação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => {
                  const product = products.get(movement.product_id);
                  const signed = signedMovementQty(movement);

                  return (
                    <TableRow
                      key={movement.id}
                      className="border-line/80 hover:bg-moss-soft/25"
                    >
                      <TableCell className="num border-l-[3px] border-l-transparent py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                        {formatDate(movement.moved_on)}
                      </TableCell>
                      <TableCell className="max-w-[260px] px-2 py-2.5 text-[13px]">
                        <Link
                          href={`/estoque/${movement.product_id}`}
                          className="block truncate font-medium underline-offset-2 hover:underline"
                        >
                          {product?.name ?? "Produto"}
                        </Link>
                        <span className="num block truncate text-[11px] text-ink-soft">
                          {product?.sku ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden px-2 py-2.5 sm:table-cell">
                        <MovementTypeBadge type={movement.type} />
                      </TableCell>
                      <TableCell className="num hidden px-2 py-2.5 text-[11.5px] text-ink-soft md:table-cell">
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
                      <TableCell className="hidden max-w-[220px] px-2 py-2.5 pr-3 text-[11.5px] text-ink-soft lg:table-cell">
                        <span className="block truncate">
                          {movement.notes || movement.event_label || "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)}{" "}
              {total === 1 ? "movimentação" : "movimentações"} · página {page}{" "}
              de {totalPages}
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
