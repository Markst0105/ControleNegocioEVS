import type { Metadata } from "next";
import Link from "next/link";

import { DealBadge, OriginBadge } from "@/components/app/badges";
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
  formatDecimal,
  formatInt,
  formatMoney,
  formatMonth,
  monthFirstDay,
  nextMonthFirstDay,
  todayISO,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Painel",
};

export default async function PainelPage() {
  const supabase = await createClient();

  const month = currentMonthISO();
  const from = monthFirstDay(month);
  const to = nextMonthFirstDay(month);

  const [pnlResult, countResult, receivablesResult, recentResult, dealTypesResult] =
    await Promise.all([
      supabase.from("v_monthly_pnl").select("*").eq("month", from).maybeSingle(),
      supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .gte("sold_on", from)
        .lt("sold_on", to),
      supabase.rpc("open_receivables_total"),
      supabase
        .from("sales")
        .select(
          "id, sold_on, client_name_raw, product_name_raw, deal_type_code, discount_pct, origin, amount_received",
        )
        .order("sold_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("deal_types").select("code, label"),
    ]);

  const firstError = [
    pnlResult.error,
    countResult.error,
    recentResult.error,
    dealTypesResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  // Não derruba o Painel se a migração da função ainda não foi aplicada.
  if (receivablesResult.error) {
    console.error("painel: falha ao calcular valores a receber", receivablesResult.error);
  }

  const pnl = pnlResult.data;
  const salesCount = countResult.count ?? 0;
  const openReceivables = receivablesResult.error
    ? null
    : Number(receivablesResult.data ?? 0);
  const recent = recentResult.data ?? [];
  const dealLabels = new Map(
    (dealTypesResult.data ?? []).map((deal) => [deal.code, deal.label]),
  );

  const ganho = pnl?.ganho_liquido ?? 0;
  const ganhoPositive = ganho >= 0;

  const monthLabel = formatMonth(month);
  const [monthNameRaw = monthLabel, year = ""] = monthLabel.split(" de ");
  const monthName =
    monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-soft">
            Painel · mês corrente
          </p>
          <h1 className="mt-1.5 font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[58px]">
            <mark className="marker px-1.5 text-inherit">{monthName}</mark>{" "}
            <span className="text-[20px] font-normal tracking-[-0.02em] text-ink-soft sm:text-[23px]">
              {year}
            </span>
          </h1>
        </div>

        <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-moss/35 px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-moss-ink uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-citrus" />
            Em aberto
          </span>
          <span className="num text-[10.5px] text-ink-soft">
            atualizado em {formatDate(todayISO())}
          </span>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-[2.05fr_1fr_1fr_1fr]">
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Ganho líquido
          </dt>
          <dd
            className={cn(
              "mt-2 font-display text-[32px] leading-none font-semibold tracking-[-0.035em] whitespace-nowrap sm:text-[38px]",
              ganhoPositive ? "text-moss-ink" : "text-rust-ink",
            )}
          >
            {formatMoney(ganho)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            Vendas + bônus − custos do mês
          </p>
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
          <p className="mt-2 text-[10.5px] text-ink-soft">parcelas em aberto</p>
        </div>
      </dl>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-[25px] leading-none font-normal tracking-[-0.01em] sm:text-[28px]">
            Últimos lançamentos
          </h2>
          <Link
            href="/vendas"
            className="text-xs font-medium text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Ver todas
          </Link>
        </div>

        {recent.length === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                Nenhum lançamento ainda
              </EmptyTitle>
              <EmptyDescription>
                Registre a primeira venda para começar o controle.
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
