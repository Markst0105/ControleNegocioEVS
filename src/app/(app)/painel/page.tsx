import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { DealBadge, OriginBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  addDays,
  currentMonthISO,
  formatDate,
  formatDecimal,
  formatInt,
  formatMoney,
  formatMonth,
  isMonthISO,
  monthFirstDay,
  nextMonthFirstDay,
  shiftMonth,
  todayISO,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Painel",
};

type SearchParams = Promise<{ mes?: string }>;

export default async function PainelPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const currentMonth = currentMonthISO();
  const requestedMonth = isMonthISO(params.mes) ? params.mes : currentMonth;
  const month = requestedMonth > currentMonth ? currentMonth : requestedMonth;
  const isCurrentMonth = month === currentMonth;
  const from = monthFirstDay(month);
  const to = nextMonthFirstDay(month);
  const receivablesAsOf = isCurrentMonth ? todayISO() : addDays(to, -1);

  const [
    pnlResult,
    countResult,
    expensesCountResult,
    receivablesResult,
    recentResult,
    dealTypesResult,
  ] = await Promise.all([
    supabase.rpc("monthly_pnl", { p_month: from }).maybeSingle(),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .gte("sold_on", from)
      .lt("sold_on", to),
    supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .gte("incurred_on", from)
      .lt("incurred_on", to)
      .in("scope", ["negocio_fixo", "negocio_variavel"]),
    supabase
      .rpc("open_receivables_as_of", { p_date: receivablesAsOf })
      .maybeSingle(),
    supabase
      .from("sales")
      .select(
        "id, sold_on, client_name_raw, product_name_raw, deal_type_code, discount_pct, origin, amount_received",
      )
      .gte("sold_on", from)
      .lt("sold_on", to)
      .order("sold_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("deal_types").select("code, label"),
  ]);

  const firstError = [
    pnlResult.error,
    countResult.error,
    expensesCountResult.error,
    recentResult.error,
    dealTypesResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  // Não derruba o Painel se a migração da função ainda não foi aplicada.
  let openReceivables: number | null = null;
  if (receivablesResult.error) {
    console.error(
      "painel: falha ao calcular valores a receber",
      receivablesResult.error,
    );
    if (isCurrentMonth) {
      const fallback = await supabase.rpc("open_receivables_total");
      if (!fallback.error) {
        openReceivables = Number(fallback.data ?? 0);
      }
    }
  } else {
    openReceivables = Number(receivablesResult.data?.open_total ?? 0);
  }

  const pnl = pnlResult.data;
  const salesCount = countResult.count ?? 0;
  const recent = recentResult.data ?? [];
  const dealLabels = new Map(
    (dealTypesResult.data ?? []).map((deal) => [deal.code, deal.label]),
  );

  const hasBusinessExpenses = (expensesCountResult.count ?? 0) > 0;
  const ganho = hasBusinessExpenses
    ? (pnl?.ganho_liquido ?? 0)
    : (pnl?.ganho_vendas ?? 0);
  const ganhoPositive = ganho >= 0;
  const ganhoLabel = hasBusinessExpenses
    ? "Ganho líquido"
    : "Ganho de vendas";
  const ganhoNote = hasBusinessExpenses
    ? "Ganho de vendas + royalties/bônus − custos"
    : "Sem despesas do negócio lançadas neste mês";

  const monthLabel = formatMonth(month);
  const [monthNameRaw = monthLabel, year = ""] = monthLabel.split(" de ");
  const monthName =
    monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

  function monthHref(ym: string) {
    return ym === currentMonth ? "/painel" : `/painel?mes=${ym}`;
  }

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-soft">
            Painel · {isCurrentMonth ? "mês corrente" : "histórico"}
          </p>
          <h1 className="mt-1.5 font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[58px]">
            <mark className="month-mark">{monthName}</mark>{" "}
            <span className="text-[20px] font-normal tracking-[-0.02em] text-ink-soft sm:text-[23px]">
              {year}
            </span>
          </h1>
        </div>

        <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          {isCurrentMonth ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-moss/35 px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-moss-ink uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-citrus" />
              Em aberto
            </span>
          ) : (
            <span className="inline-flex items-center rounded-sm border border-line px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-ink-soft uppercase">
              Histórico
            </span>
          )}
          <span className="num text-[10.5px] text-ink-soft">
            atualizado em {formatDate(todayISO())}
          </span>
        </div>
      </header>

      <div className="-mt-4 flex flex-wrap items-center justify-between gap-2 border-y border-line py-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm" className="h-8 w-8">
            <Link
              href={monthHref(shiftMonth(month, -1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft />
            </Link>
          </Button>
          <span className="num min-w-36 text-center text-[13px] font-medium">
            {formatMonth(month)}
          </span>
          {isCurrentMonth ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8"
              disabled
              aria-label="Próximo mês"
            >
              <ChevronRight />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon-sm" className="h-8 w-8">
              <Link
                href={monthHref(shiftMonth(month, 1))}
                aria-label="Próximo mês"
              >
                <ChevronRight />
              </Link>
            </Button>
          )}
          {!isCurrentMonth ? (
            <Button asChild variant="ghost" className="h-8">
              <Link href="/painel">Mês atual</Link>
            </Button>
          ) : null}
        </div>

        <form method="get" action="/painel" className="flex items-center gap-2">
          <Input
            type="month"
            name="mes"
            max={currentMonth}
            defaultValue={month}
            aria-label="Escolher mês"
            className="num h-8 w-40"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-8">
            Ir
          </Button>
        </form>
      </div>

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-[2.05fr_1fr_1fr_1fr]">
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            {ganhoLabel}
          </dt>
          <dd
            className={cn(
              "mt-2 font-display text-[32px] leading-none font-semibold tracking-[-0.035em] whitespace-nowrap sm:text-[38px]",
              ganhoPositive ? "text-moss-ink" : "text-rust-ink",
            )}
          >
            {formatMoney(ganho)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">{ganhoNote}</p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Vendas no mês
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatInt(salesCount)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            lançamentos registrados
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">PV no mês</dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatDecimal(pnl?.pv_total ?? 0)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">pontos de volume</p>
        </div>

        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
          <dt className="text-[11.5px] font-medium text-ink-soft">A receber</dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(openReceivables)}
          </dd>
          <Link
            href="/financeiro/recebiveis"
            className="mt-2 inline-block text-[10.5px] text-ink-soft underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {isCurrentMonth
              ? "parcelas em aberto"
              : `em aberto em ${formatDate(receivablesAsOf)}`}
          </Link>
        </div>
      </dl>

      {!hasBusinessExpenses ? (
        <p className="rounded-md border border-citrus/30 bg-citrus-soft px-4 py-3 text-[12px] text-citrus-ink">
          As despesas do negócio ainda não foram lançadas em{" "}
          {formatMonth(month)}. O valor acima considera apenas as vendas.{" "}
          <Link
            href={`/despesas/nova?mes=${month}`}
            className="font-medium underline underline-offset-2"
          >
            Lançar despesa
          </Link>
          .
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-[25px] leading-none font-normal tracking-[-0.01em] sm:text-[28px]">
            {isCurrentMonth ? "Últimos lançamentos" : "Lançamentos do mês"}
          </h2>
          <Link
            href={`/vendas?mes=${month}`}
            className="text-xs font-medium text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Ver todas
          </Link>
        </div>

        {recent.length === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                {isCurrentMonth
                  ? "Nenhum lançamento ainda"
                  : "Nenhum lançamento neste mês"}
              </EmptyTitle>
              <EmptyDescription>
                {isCurrentMonth
                  ? "Registre a primeira venda para começar o controle."
                  : "Navegue para outro mês ou registre uma venda."}
              </EmptyDescription>
            </EmptyHeader>
            <Button asChild size="sm" className="font-bold">
              <Link href="/vendas/nova">Lançar venda</Link>
            </Button>
          </Empty>
        ) : (
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Cliente
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft md:table-cell">
                    Produto
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft sm:table-cell">
                    Negócio
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Origem
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell
                      className={cn(
                        "num border-l-[3px] py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft",
                        sale.origin === "CASA"
                          ? "border-l-steel"
                          : sale.origin === "EVS"
                            ? "border-l-moss"
                            : "border-l-line-strong",
                      )}
                    >
                      {formatDate(sale.sold_on)}
                    </TableCell>
                    <TableCell className="max-w-[190px] px-2 py-2.5 text-[13px]">
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
                    <TableCell className="hidden max-w-[240px] px-2 py-2.5 text-[13px] text-ink-soft md:table-cell">
                      <span className="block truncate">
                        {sale.product_name_raw ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 sm:table-cell">
                      <DealBadge
                        label={
                          sale.deal_type_code
                            ? dealLabels.get(sale.deal_type_code)
                            : null
                        }
                        discountPct={sale.discount_pct}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2.5">
                      <OriginBadge origin={sale.origin} />
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 pr-3 text-right text-[13px] whitespace-nowrap">
                      {formatMoney(sale.amount_received)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
