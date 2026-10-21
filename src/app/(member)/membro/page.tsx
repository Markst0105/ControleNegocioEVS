import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PriceTierBadge } from "@/components/app/price-tier-badge";
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
import { getSession } from "@/lib/auth";
import { formatDecimal, formatInt, formatMoney } from "@/lib/format";
import { priceTier } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Catálogo",
};

const PAGE_SIZE = 30;

type SearchParams = Promise<{ q?: string; pagina?: string }>;

export default async function MembroCatalogoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  const q = (params.q ?? "").trim().slice(0, 80);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("v_catalog_member")
    .select(
      "id, name, sku, kind, portions_per_pack, portion_label, retail_price, pv, member_tier_code, member_price",
      { count: "exact" },
    )
    .eq("is_active", true)
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    query = query.or(`name.ilike."%${search}%",sku.ilike."%${search}%"`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const products = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tier = priceTier(
    session?.profile?.price_tier ?? products[0]?.member_tier_code ?? "retail",
  );
  const firstName = session?.profile?.name.trim().split(/\s+/)[0] ?? "membro";

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString ? `/membro?${queryString}` : "/membro";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Catálogo"
        description={`Olá, ${firstName}. Consulte os produtos e os preços da sua faixa.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <div className="flex items-center gap-2 text-[12px] text-ink-soft">
          <span>Sua faixa de preço</span>
          {tier ? <PriceTierBadge code={tier.code} /> : null}
        </div>
        <form
          method="get"
          action="/membro"
          className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
        >
          <div className="grid min-w-0 flex-1 gap-1 sm:flex-none">
            <Label htmlFor="q" className="sr-only">
              Buscar produto
            </Label>
            <Input
              id="q"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome ou SKU…"
              className="h-9 w-full bg-surface text-[12px] sm:w-[230px]"
            />
          </div>
          <Button type="submit" variant="secondary" className="h-9">
            <Search />
            Buscar
          </Button>
          {q ? (
            <Button asChild variant="ghost" className="h-9">
              <Link href="/membro">Limpar</Link>
            </Button>
          ) : null}
        </form>
      </div>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {q ? "Nenhum produto encontrado" : "Catálogo sem produtos"}
            </EmptyTitle>
            <EmptyDescription>
              {q
                ? "Tente outro nome ou SKU."
                : "A loja ainda não publicou produtos com preço."}
            </EmptyDescription>
          </EmptyHeader>
          {q ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/membro">Limpar busca</Link>
            </Button>
          ) : null}
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
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    PV
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Seu preço
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const memberPrice = product.member_price ?? product.retail_price;
                  const hasDiscount =
                    product.retail_price != null &&
                    memberPrice != null &&
                    memberPrice < product.retail_price;

                  return (
                    <TableRow
                      key={product.id}
                      className="border-line/80 hover:bg-moss-soft/25"
                    >
                      <TableCell className="max-w-[520px] border-l-[3px] border-l-transparent py-3 pl-3">
                        <span className="block truncate text-[13.5px] font-medium">
                          {product.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-ink-soft">
                          {[
                            product.sku,
                            product.portion_label,
                            product.portions_per_pack
                              ? `${formatInt(product.portions_per_pack)} porções`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </TableCell>
                      <TableCell className="num hidden px-2 py-3 text-right text-[12px] text-ink-soft sm:table-cell">
                        {formatDecimal(product.pv)}
                      </TableCell>
                      <TableCell className="num px-2 py-3 pr-3 text-right">
                        <span className="block text-[13px] font-medium whitespace-nowrap">
                          {formatMoney(memberPrice)}
                        </span>
                        {hasDiscount ? (
                          <span className="block text-[10px] text-ink-soft line-through">
                            {formatMoney(product.retail_price)}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
