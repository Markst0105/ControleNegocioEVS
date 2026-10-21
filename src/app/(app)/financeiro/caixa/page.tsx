import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Search,
} from "lucide-react";

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
import {
  CASH_DIRECTION_VALUES,
  CASH_ENTRY_FILTER_OPTIONS,
  cashEntryKindFromFilter,
  cashEntryKindLabel,
  isCashDirectionFilter,
  isCashEntryFilter,
  type CashDirectionFilter,
} from "@/lib/cash-flow";
import {
  currentMonthISO,
  formatDate,
  formatInt,
  formatMoney,
  formatMonth,
  isMonthISO,
  monthFirstDay,
  nextMonthFirstDay,
  shiftMonth,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Caixa",
};

const PAGE_SIZE = 50;

type SearchParams = Promise<{
  mes?: string;
  direcao?: string;
  tipo?: string;
  q?: string;
  pagina?: string;
}>;

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  const isAdmin = session?.profile?.role === "admin";

  const currentMonth = currentMonthISO();
  const month = isMonthISO(params.mes) ? params.mes : currentMonth;
  const direction: CashDirectionFilter = isCashDirectionFilter(params.direcao)
    ? params.direcao
    : "todas";
  const typeFilter = isCashEntryFilter(params.tipo) ? params.tipo : "todos";
  const q = (params.q ?? "").trim().slice(0, 80);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const from = monthFirstDay(month);
  const to = nextMonthFirstDay(month);

  const supabase = await createClient();

  let listQuery = supabase
    .from("v_cash_flow_entries")
    .select(
      "occurred_on, entry_kind, direction, amount, description, detail, account_name, category, method_label, scope, reference_id",
      { count: "exact" },
    )
    .gte("occurred_on", from)
    .lt("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (direction === "entradas") listQuery = listQuery.eq("direction", "in");
  if (direction === "saidas") listQuery = listQuery.eq("direction", "out");
  const kind = cashEntryKindFromFilter(typeFilter);
  if (kind) listQuery = listQuery.eq("entry_kind", kind);
  if (search) {
    listQuery = listQuery.or(
      `description.ilike."%${search}%",detail.ilike."%${search}%",category.ilike."%${search}%"`,
    );
  }

  const closingPromise = isAdmin
    ? supabase
        .from("month_closings")
        .select("status, closed_at")
        .eq("month", from)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [summaryResult, receivablesResult, listResult, closingResult] =
    await Promise.all([
      supabase
        .rpc("cash_flow_summary", { p_month: from })
        .maybeSingle(),
      supabase.rpc("open_receivables_summary").maybeSingle(),
      listQuery,
      closingPromise,
    ]);

  const firstError = [
    summaryResult.error,
    receivablesResult.error,
    listResult.error,
    closingResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const summary = summaryResult.data;
  const receivables = receivablesResult.data;
  const rows = listResult.data ?? [];
  const total = listResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const closing = closingResult.data;
  const isClosed = closing?.status === "closed";

  const cashIn = Number(summary?.cash_in ?? 0);
  const expensesTotal = Number(summary?.expenses_total ?? 0);
  const personalExpensesTotal = Number(
    summary?.personal_expenses_total ?? 0,
  );
  const purchasesTotal = Number(summary?.purchases_total ?? 0);
  const cashOutTotal = Number(summary?.cash_out_total ?? 0);
  const netCash = Number(summary?.net_cash ?? 0);
  const receiptsCount = Number(summary?.receipts_count ?? 0);
  const expensesCount = Number(summary?.expenses_count ?? 0);
  const purchasesCount = Number(summary?.purchases_count ?? 0);
  const openTotal = Number(receivables?.open_total ?? 0);
  const overdueTotal = Number(receivables?.overdue_total ?? 0);
  const overdueCount = Number(receivables?.overdue_count ?? 0);
  const netPositive = netCash >= 0;

  const monthLabel = formatMonth(month);
  const [monthNameRaw = monthLabel, year = ""] = monthLabel.split(" de ");
  const monthName =
    monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const hasFilters = Boolean(
    direction !== "todas" || typeFilter !== "todos" || q,
  );

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (month !== currentMonth) sp.set("mes", month);
    if (direction !== "todas") sp.set("direcao", direction);
    if (typeFilter !== "todos") sp.set("tipo", typeFilter);
    if (q) sp.set("q", q);
    if (target > 1) sp.set("pagina", String(target));
    const query = sp.toString();
    return query ? `/financeiro/caixa?${query}` : "/financeiro/caixa";
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-soft">
            Financeiro · fluxo de caixa
          </p>
          <h1 className="mt-1.5 font-display text-[42px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[54px]">
            <mark className="month-mark">{monthName}</mark>{" "}
            <span className="text-[19px] font-normal tracking-[-0.02em] text-ink-soft sm:text-[22px]">
              {year}
            </span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-[12px] text-ink-soft">
            Recebimentos pela data do recebimento; despesas e compras de
            estoque pela data do lançamento.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button asChild variant="outline" size="icon-sm" className="h-9 w-9">
            <Link
              href={`/financeiro/caixa?mes=${previousMonth}`}
              aria-label="Mês anterior"
            >
              <ChevronLeft />
            </Link>
          </Button>

          <form
            method="get"
            action="/financeiro/caixa"
            className="flex items-end gap-2"
          >
            <div className="grid gap-1">
              <Label
                htmlFor="mes"
                className="text-[10.5px] font-medium text-ink-soft"
              >
                Mês
              </Label>
              <Input
                id="mes"
                type="month"
                name="mes"
                defaultValue={month}
                className="num h-9 w-40 bg-surface text-[12px]"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-9">
              Aplicar
            </Button>
          </form>

          <Button asChild variant="outline" size="icon-sm" className="h-9 w-9">
            <Link
              href={`/financeiro/caixa?mes=${nextMonth}`}
              aria-label="Próximo mês"
            >
              <ChevronRight />
            </Link>
          </Button>

          {month !== currentMonth ? (
            <Button asChild variant="ghost" className="h-9">
              <Link href="/financeiro/caixa">Mês atual</Link>
            </Button>
          ) : null}

          {isAdmin ? (
            <Button asChild variant="outline" className="h-9">
              <Link href={`/financeiro/fechamento?mes=${month}`}>
                <LockKeyhole />
                Fechamento
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[24px] leading-none font-normal">
          Resumo
        </h2>
        <div className="flex items-center gap-2">
          {isClosed ? (
            <span className="rounded-sm border border-moss/40 bg-moss-soft px-1.5 py-px text-[10px] font-medium tracking-wide text-moss-ink">
              Mês fechado
            </span>
          ) : null}
          <p className="text-[11px] text-ink-soft">entradas e saídas do mês</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-[1.35fr_1fr_1fr_1.15fr]">
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Saldo do mês
          </dt>
          <dd
            className={cn(
              "num mt-2 text-[26px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[30px]",
              netPositive ? "text-moss-ink" : "text-rust-ink",
            )}
          >
            {formatMoney(netCash)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            entradas − saídas de caixa
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">Entradas</dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap text-moss-ink sm:text-[21px]">
            {formatMoney(cashIn)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {formatInt(receiptsCount)}{" "}
            {receiptsCount === 1 ? "recebimento" : "recebimentos"}
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">Saídas</dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap text-rust-ink sm:text-[21px]">
            {formatMoney(cashOutTotal)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {formatMoney(expensesTotal)} despesas ·{" "}
            {formatMoney(purchasesTotal)} compras
          </p>
        </div>

        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            A receber agora
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(openTotal)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {overdueTotal > 0
              ? `${formatMoney(overdueTotal)} vencidos · ${formatInt(overdueCount)} parcelas`
              : "nenhuma parcela vencida"}
          </p>
        </div>
      </dl>

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-ink-soft">
        <p>
          {formatInt(expensesCount)}{" "}
          {expensesCount === 1 ? "despesa lançada" : "despesas lançadas"} ·{" "}
          {formatInt(purchasesCount)}{" "}
          {purchasesCount === 1 ? "compra de estoque" : "compras de estoque"}
        </p>
        {isAdmin && personalExpensesTotal > 0 ? (
          <p>
            Saídas incluem {formatMoney(personalExpensesTotal)} em despesas
            pessoais.
          </p>
        ) : null}
      </div>

      <form
        method="get"
        action="/financeiro/caixa"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid gap-1.5">
          <Label
            htmlFor="direcao"
            className="text-[11px] font-medium text-ink-soft"
          >
            Direção
          </Label>
          <Select name="direcao" defaultValue={direction}>
            <SelectTrigger id="direcao" className="h-9 w-40 bg-surface">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              {CASH_DIRECTION_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "todas"
                    ? "Todas"
                    : value === "entradas"
                      ? "Entradas"
                      : "Saídas"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="tipo"
            className="text-[11px] font-medium text-ink-soft"
          >
            Tipo
          </Label>
          <Select name="tipo" defaultValue={typeFilter}>
            <SelectTrigger id="tipo" className="h-9 w-48 bg-surface">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              {CASH_ENTRY_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            placeholder="Cliente, descrição, conta…"
            className="h-9"
          />
        </div>

        <input type="hidden" name="mes" value={month} />

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {hasFilters ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href={`/financeiro/caixa?mes=${month}`}>
              Limpar filtros
            </Link>
          </Button>
        ) : null}
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2">
          <h2 className="font-serif text-[20px] leading-none font-normal">
            Movimentos
          </h2>
          <p className="text-[11px] text-ink-soft">
            {formatInt(total)}{" "}
            {total === 1 ? "lançamento no mês" : "lançamentos no mês"}
            {total > 0 ? ` · página ${page} de ${totalPages}` : ""}
          </p>
        </div>

        {total === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                {hasFilters ? "Nenhum resultado" : "Nenhum movimento no mês"}
              </EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? "Ajuste a direção, o tipo ou a busca."
                  : "Recebimentos, despesas e compras aparecem aqui quando forem lançados."}
              </EmptyDescription>
            </EmptyHeader>
            {hasFilters ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/financeiro/caixa?mes=${month}`}>
                  Limpar filtros
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/financeiro/recebiveis">
                  <Banknote />
                  Ver recebíveis
                </Link>
              </Button>
            )}
          </Empty>
        ) : (
          <>
            <div className="border-t border-ink/70">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-ink/70 hover:bg-transparent">
                    <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                      Data
                    </TableHead>
                    <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                      Lançamento
                    </TableHead>
                    <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                      Tipo
                    </TableHead>
                    <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft sm:table-cell">
                      Conta / categoria
                    </TableHead>
                    <TableHead className="h-9 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                      Valor
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const amount = Number(row.amount);
                    const signed = row.direction === "in" ? amount : -amount;
                    const inbound = signed >= 0;
                    return (
                      <TableRow
                        key={`${row.entry_kind}-${row.reference_id}`}
                        className="border-line/70"
                      >
                        <TableCell className="num py-3 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                          {formatDate(row.occurred_on)}
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="text-[12.5px] font-medium">
                            {row.description ?? "—"}
                          </p>
                          {row.detail ? (
                            <p className="mt-0.5 text-[10.5px] text-ink-soft">
                              {row.detail}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-sm border px-1.5 py-px text-[10.5px] font-medium",
                              row.entry_kind === "receipt"
                                ? "border-moss/40 bg-moss-soft text-moss-ink"
                                : row.entry_kind === "purchase"
                                  ? "border-citrus/40 bg-citrus-soft text-citrus-ink"
                                  : "border-line bg-paper text-ink-soft",
                            )}
                          >
                            {cashEntryKindLabel(row.entry_kind)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden py-3 text-[11.5px] text-ink-soft sm:table-cell">
                          <p>{row.account_name ?? row.category ?? "—"}</p>
                          {row.account_name && row.category ? (
                            <p className="mt-0.5 text-[10px]">
                              {row.category}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "num py-3 text-right text-[12.5px] font-medium whitespace-nowrap",
                            inbound ? "text-moss-ink" : "text-rust-ink",
                          )}
                        >
                          {inbound ? "+" : "−"}{" "}
                          {formatMoney(Math.abs(signed))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-ink-soft">
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
      </section>
    </div>
  );
}
