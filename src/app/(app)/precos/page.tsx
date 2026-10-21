import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

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
import { getSession } from "@/lib/auth";
import { formatDate, formatDecimal, formatInt, todayISO } from "@/lib/format";
import {
  PRICE_SECTIONS,
  PRICE_TIERS,
  formatTablePrice,
  priceSectionKey,
  type PriceSectionKey,
} from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { PriceImportDialog } from "./price-import-dialog";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Tabela de preços",
};

type PriceRow = Database["public"]["Views"]["v_price_catalog"]["Row"];
type SectionFilter = "all" | PriceSectionKey;

type SearchParams = Promise<{
  q?: string;
  secao?: string;
}>;

function sectionFilter(value: string | undefined): SectionFilter {
  if (!value) return "all";
  return PRICE_SECTIONS.some((section) => section.key === value)
    ? (value as PriceSectionKey)
    : "all";
}

function matchesSearch(product: PriceRow, term: string): boolean {
  if (!term) return true;
  const haystack = `${product.name} ${product.sku}`.toLocaleLowerCase("pt-BR");
  return haystack.includes(term);
}

export default async function PricesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const search = q.toLocaleLowerCase("pt-BR");
  const section = sectionFilter(params.secao);

  const session = await getSession();
  const isAdmin = session?.profile?.role === "admin";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_price_catalog")
    .select(
      "id, sku, name, kind, item_class, pv, portions_per_pack, portion_label, is_active, print_name, retail_price, price_25, price_35, price_42, price_50, price_bronze, price_prata, price_ouro",
    )
    .eq("is_active", true)
    .not("retail_price", "is", null)
    .order("name")
    .limit(1000);

  if (error) throw new Error(error.message);

  const products = (data ?? []).filter(
    (product) =>
      matchesSearch(product, search) &&
      (section === "all" || priceSectionKey(product.item_class) === section),
  );

  const groups = PRICE_SECTIONS.map((item) => ({
    ...item,
    items: products.filter(
      (product) => priceSectionKey(product.item_class) === item.key,
    ),
  })).filter((group) => group.items.length > 0);

  const filtered = Boolean(q) || section !== "all";
  const updatedOn = formatDate(todayISO());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tabela de preços"
        description={`Preço de balcão, faixas de desconto e PV · atualizada em ${updatedOn}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {isAdmin ? <PriceImportDialog /> : null}
            <PrintButton />
          </div>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4 border-y border-line py-3 print:hidden">
        <form
          method="get"
          action="/precos"
          className="flex flex-wrap items-end gap-2"
        >
          <div className="grid gap-1.5">
            <Label
              htmlFor="secao"
              className="text-[11px] font-medium text-ink-soft"
            >
              Seção
            </Label>
            <Select name="secao" defaultValue={section}>
              <SelectTrigger id="secao" className="h-9 w-44 bg-surface">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PRICE_SECTIONS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid min-w-52 flex-1 gap-1.5">
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
              <Link href="/precos">Limpar</Link>
            </Button>
          ) : null}
        </form>

        <p className="max-w-sm text-[11px] leading-relaxed text-ink-soft">
          Valores em reais, arredondados para cima como na tabela impressa. O
          preço Cliente é o de balcão; a faixa Ouro valoriza o estoque.
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-px border-y border-line bg-line print:hidden">
        <div className="bg-paper px-4 py-4 sm:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Produtos</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(products.length)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Seções</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(groups.length)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Atualização</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {updatedOn}
          </dd>
        </div>
      </dl>

      {products.length === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              Nenhum produto encontrado
            </EmptyTitle>
            <EmptyDescription>
              Ajuste a seção ou a busca para ver outros itens da tabela.
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <Button asChild variant="outline" size="sm" className="font-bold">
              <Link href="/precos">Limpar filtros</Link>
            </Button>
          ) : null}
        </Empty>
      ) : (
        <section className="price-sheet">
          <div className="mb-3 hidden items-baseline justify-between gap-3 print:flex">
            <p className="font-display text-[19px] font-semibold tracking-[-0.03em]">
              Controle de Negócio
            </p>
            <p className="num text-[10px] text-ink-soft">
              Tabela de preços · R$ · {updatedOn}
            </p>
          </div>

          <div className="border-t border-ink/70">
            <Table
              aria-label="Tabela de preços por produto e faixa"
              className="price-table min-w-[860px] print:min-w-0"
            >
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 w-[31%] border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Produto
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    PV
                  </TableHead>
                  {PRICE_TIERS.map((tier) => (
                    <TableHead
                      key={tier.code}
                      className={cn(
                        "h-9 text-right text-[10.5px] font-medium text-ink-soft",
                        tier.code === "retail" &&
                          "border-x border-line bg-citrus-soft/45 text-ink",
                      )}
                    >
                      {tier.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              {groups.map((group) => (
                <TableBody key={group.key}>
                  <TableRow className="price-group border-line bg-surface hover:bg-surface print:bg-transparent">
                    <TableCell
                      colSpan={PRICE_TIERS.length + 2}
                      className="border-l-[3px] border-l-moss py-2.5 pl-3"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-serif text-[17px] leading-none font-normal">
                          {group.label}
                        </span>
                        <span className="num text-[10px] text-ink-soft">
                          {formatInt(group.items.length)}{" "}
                          {group.items.length === 1 ? "item" : "itens"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {group.items.map((product) => (
                    <TableRow
                      key={product.id}
                      className="border-line/80 hover:bg-moss-soft/25 print:break-inside-avoid print:hover:bg-transparent"
                    >
                      <TableCell className="max-w-[360px] border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px] print:max-w-none">
                        <span className="block truncate font-medium print:whitespace-normal">
                          {product.name}
                        </span>
                        <span className="num block text-[10.5px] text-ink-soft">
                          {product.sku}
                        </span>
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 text-right text-[12px] text-ink-soft">
                        {product.pv === null
                          ? "—"
                          : formatDecimal(product.pv)}
                      </TableCell>
                      {PRICE_TIERS.map((tier) => (
                        <TableCell
                          key={tier.column}
                          className={cn(
                            "num px-2 py-2.5 text-right text-[12px] whitespace-nowrap",
                            tier.code === "retail" &&
                              "border-x border-line bg-citrus-soft/30 font-medium",
                          )}
                        >
                          {formatTablePrice(product[tier.column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              ))}
            </Table>
          </div>

          <p className="mt-3 hidden text-[9.5px] leading-relaxed text-ink-soft print:block">
            Valores em reais (R$), arredondados para cima. Tabela sujeita a
            alteração sem aviso. Atualizada em {updatedOn}.
          </p>
        </section>
      )}

      <p className="text-[11px] text-ink-soft print:hidden">
        Os preços exatos de cada faixa ficam disponíveis no{" "}
        <Link
          href="/vendas/nova"
          className="underline underline-offset-2 hover:text-ink"
        >
          lançamento de venda
        </Link>
        .
      </p>
    </div>
  );
}
