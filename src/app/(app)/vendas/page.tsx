import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";

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
  currentMonthISO,
  formatDate,
  formatDecimal,
  formatInt,
  formatMoney,
  formatMonth,
  formatPercent,
  isMonthISO,
  monthFirstDay,
  nextMonthFirstDay,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Vendas",
};

const PAGE_SIZE = 12;

type SearchParams = Promise<{
  mes?: string;
  q?: string;
  pagina?: string;
  ok?: string;
}>;

type PurchaseItem = {
  name: string;
  qty: number;
  amount: number;
};

function parseItems(value: Json | null): PurchaseItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    return [
      {
        name: typeof entry.name === "string" ? entry.name : "—",
        qty: typeof entry.qty === "number" ? entry.qty : 1,
        amount: typeof entry.amount === "number" ? entry.amount : 0,
      },
    ];
  });
}

function PaymentBadge({
  code,
  label,
}: {
  code: string | null;
  label: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-paper px-2 py-1">
      <span className="num text-[11px] font-semibold tracking-wide">
        {code ?? "—"}
      </span>
      {label ? (
        <span className="text-[10.5px] whitespace-nowrap text-ink-soft">
          {label}
        </span>
      ) : null}
    </span>
  );
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const currentMonth = currentMonthISO();
  const mes = isMonthISO(params.mes) ? params.mes : currentMonth;
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const from = monthFirstDay(mes);
  const to = nextMonthFirstDay(mes);

  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();

  let query = supabase
    .from("v_sale_purchases")
    .select(
      "id, sold_on, client_id, client_name, payment_method_code, payment_label, item_count, total_amount, total_profit, total_pv, discount_pct, origins, deal_codes, items",
      { count: "exact" },
    )
    .gte("sold_on", from)
    .lt("sold_on", to)
    .order("sold_on", { ascending: false })
    .order("client_name", { ascending: true })
    .order("payment_method_code", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    query = query.or(
      `client_name.ilike."%${search}%",products_text.ilike."%${search}%"`,
    );
  }

  const [{ data: purchases, count, error }, dealTypesResult] = await Promise.all([
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

      <PageHeader title="Vendas" description={formatMonth(mes)} />

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
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered ? "Nenhum resultado" : "Nenhum lançamento neste mês"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste o mês ou a busca para encontrar os lançamentos."
                : "Registre a primeira venda do mês para começar."}
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" className="font-bold">
            <Link href="/vendas/nova">Lançar venda</Link>
          </Button>
        </Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {purchases?.map((purchase) => {
              const items = parseItems(purchase.items);
              const origins = purchase.origins ?? [];
              const dealCodes = purchase.deal_codes ?? [];
              const profit = Number(purchase.total_profit);

              return (
                <article
                  key={purchase.id}
                  className="flex flex-col rounded-lg border border-line bg-surface"
                >
                  <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                    <time
                      dateTime={purchase.sold_on}
                      className="num text-[11px] tracking-[0.01em] text-ink-soft"
                    >
                      {formatDate(purchase.sold_on)}
                    </time>
                    <PaymentBadge
                      code={purchase.payment_method_code}
                      label={purchase.payment_label}
                    />
                  </header>

                  <div className="flex flex-1 flex-col gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <h2
                        className="truncate text-[15px] leading-tight font-medium"
                        title={purchase.client_name}
                      >
                        {purchase.client_name}
                      </h2>
                      <p className="mt-0.5 text-[10.5px] text-ink-soft">
                        {formatInt(purchase.item_count)}{" "}
                        {purchase.item_count === 1 ? "item" : "itens"}
                      </p>
                    </div>

                    <ul className="grid gap-1">
                      {items.map((item, index) => (
                        <li
                          key={`${item.name}-${index}`}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <span className="min-w-0 truncate text-[12px] text-ink-soft">
                            {item.name}
                            {item.qty > 1 ? (
                              <span className="num text-ink-soft">
                                {" "}
                                ×{formatInt(item.qty)}
                              </span>
                            ) : null}
                          </span>
                          <span className="num text-[12px] whitespace-nowrap">
                            {formatMoney(item.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/70 pt-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] tracking-[0.01em] text-ink-soft">
                          Negócio
                        </span>
                        {dealCodes.length === 0 ? (
                          <DealBadge label={null} />
                        ) : (
                          dealCodes.map((code) => (
                            <DealBadge
                              key={code}
                              label={dealLabels.get(code) ?? code}
                            />
                          ))
                        )}
                        {purchase.discount_pct > 0 ? (
                          <span className="num inline-flex items-center rounded-sm bg-citrus-soft px-1.5 py-px text-[10px] font-medium text-citrus-ink">
                            −{formatPercent(purchase.discount_pct)}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] tracking-[0.01em] text-ink-soft">
                          Origem
                        </span>
                        {origins.length === 0 ? (
                          <OriginBadge origin={null} />
                        ) : (
                          origins.map((origin) => (
                            <OriginBadge key={origin} origin={origin} />
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <dl className="grid grid-cols-3 divide-x divide-line/70 border-t border-line">
                    <div className="px-3 py-2.5">
                      <dt className="text-[10px] text-ink-soft">PV</dt>
                      <dd className="num mt-0.5 text-[13px] font-medium whitespace-nowrap">
                        {formatDecimal(purchase.total_pv)}
                      </dd>
                    </div>
                    <div className="px-3 py-2.5">
                      <dt className="text-[10px] text-ink-soft">Total</dt>
                      <dd className="num mt-0.5 text-[13px] font-medium whitespace-nowrap">
                        {formatMoney(purchase.total_amount)}
                      </dd>
                    </div>
                    <div className="px-3 py-2.5">
                      <dt className="text-[10px] text-ink-soft">Lucro</dt>
                      <dd
                        className={cn(
                          "num mt-0.5 text-[13px] font-medium whitespace-nowrap",
                          profit < 0 ? "text-rust-ink" : "text-ink",
                        )}
                      >
                        {formatMoney(profit)}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
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
