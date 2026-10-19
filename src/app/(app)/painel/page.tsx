import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { DealBadge, OriginBadge } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
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
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Painel"
        description={`Mês atual · ${formatMonth(month)}`}
        actions={
          <Button asChild className="hidden lg:inline-flex">
            <Link href="/vendas/nova">
              <Plus />
              Lançar venda
            </Link>
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <div className="bg-surface p-4">
          <dt className="text-xs font-medium text-ink-soft">Ganho líquido</dt>
          <dd
            className={
              ganhoPositive
                ? "num mt-1.5 text-[22px] font-medium tracking-tight text-moss-ink"
                : "num mt-1.5 text-[22px] font-medium tracking-tight text-rust-ink"
            }
          >
            {formatMoney(ganho)}
          </dd>
          <p className="mt-1 text-[11px] text-ink-soft">
            Vendas + bônus − custos do mês
          </p>
        </div>

        <div className="bg-surface p-4">
          <dt className="text-xs font-medium text-ink-soft">Vendas no mês</dt>
          <dd className="num mt-1.5 text-[22px] font-medium tracking-tight">
            {formatInt(salesCount)}
          </dd>
          <p className="mt-1 text-[11px] text-ink-soft">lançamentos registrados</p>
        </div>

        <div className="bg-surface p-4">
          <dt className="text-xs font-medium text-ink-soft">PV no mês</dt>
          <dd className="num mt-1.5 text-[22px] font-medium tracking-tight">
            {formatDecimal(pnl?.pv_total ?? 0)}
          </dd>
          <p className="mt-1 text-[11px] text-ink-soft">pontos de volume</p>
        </div>

        <div className="bg-surface p-4">
          <dt className="text-xs font-medium text-ink-soft">A receber</dt>
          <dd className="num mt-1.5 text-[22px] font-medium tracking-tight">
            {formatMoney(openReceivables)}
          </dd>
          <p className="mt-1 text-[11px] text-ink-soft">parcelas em aberto</p>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-tight">
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
          <Empty className="border border-line bg-surface">
            <EmptyHeader>
              <EmptyTitle>Nenhum lançamento ainda</EmptyTitle>
              <EmptyDescription>
                Registre a primeira venda para começar o controle.
              </EmptyDescription>
            </EmptyHeader>
            <Button asChild size="sm">
              <Link href="/vendas/nova">Lançar venda</Link>
            </Button>
          </Empty>
        ) : (
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
                  <TableHead className="hidden h-8 text-[11px] font-medium text-ink-soft sm:table-cell">
                    Negócio
                  </TableHead>
                  <TableHead className="h-8 text-[11px] font-medium text-ink-soft">
                    Origem
                  </TableHead>
                  <TableHead className="h-8 pr-3 text-right text-[11px] font-medium text-ink-soft">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((sale) => (
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
                    <TableCell className="hidden px-2 py-1.5 sm:table-cell">
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
                    <TableCell className="num px-2 py-1.5 pr-3 text-right text-[13px] whitespace-nowrap">
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
