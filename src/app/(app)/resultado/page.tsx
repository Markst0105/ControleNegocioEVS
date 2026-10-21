import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LockKeyhole, Plus } from "lucide-react";
import { Suspense } from "react";

import { ExpenseScopeBadge } from "@/components/app/expense-badges";
import { FlashToast } from "@/components/app/flash-toast";
import { Button } from "@/components/ui/button";
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
import { expenseScopeOrder, isBusinessScope } from "@/lib/expenses";
import {
  currentMonthISO,
  formatDecimal,
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

import { StatementForm } from "./statement-form";

export const metadata: Metadata = {
  title: "Resultado",
};

type SearchParams = Promise<{
  mes?: string;
  ok?: string;
}>;

type StatementRow = {
  royalty_usd: number | null;
  royalty_fx: number | null;
  bonus_usd: number | null;
  bonus_fx: number | null;
};

type BreakdownRow = {
  key: string;
  categoryId: string | null;
  categoryName: string;
  scope: string | null;
  count: number;
  amount: number;
};

export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  const role = session?.profile?.role ?? "operator";
  const isAdmin = role === "admin";

  const currentMonth = currentMonthISO();
  const mes = isMonthISO(params.mes) ? params.mes : currentMonth;
  const from = monthFirstDay(mes);
  const to = nextMonthFirstDay(mes);

  const supabase = await createClient();

  const statementPromise = isAdmin
    ? supabase
        .from("herbalife_statements")
        .select("royalty_usd, royalty_fx, bonus_usd, bonus_fx")
        .eq("month", from)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const closingPromise = isAdmin
    ? supabase
        .from("month_closings")
        .select("status")
        .eq("month", from)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    pnlResult,
    expensesResult,
    categoriesResult,
    statementResult,
    closingResult,
  ] = await Promise.all([
    supabase.rpc("monthly_pnl", { p_month: from }).maybeSingle(),
    supabase
      .from("expenses")
      .select("id, category_id, scope, amount", { count: "exact" })
      .gte("incurred_on", from)
      .lt("incurred_on", to)
      .order("incurred_on"),
    supabase.from("expense_categories").select("id, name, scope").order("name"),
    statementPromise,
    closingPromise,
  ]);

  const firstError = [
    pnlResult.error,
    expensesResult.error,
    categoriesResult.error,
    statementResult.error,
    closingResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const pnl = pnlResult.data;
  const expenses = expensesResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const statement = (statementResult.data ?? null) as StatementRow | null;
  const closingStatus = closingResult.data?.status ?? null;
  const expenseCount = expensesResult.count ?? expenses.length;

  const ganhoVendas = Number(pnl?.ganho_vendas ?? 0);
  const royalties = Number(pnl?.royalties ?? 0);
  const bonus = Number(pnl?.bonus ?? 0);
  const custosFixos = Number(pnl?.custos_fixos ?? 0);
  const custosVariaveis = Number(pnl?.investimentos_promocoes ?? 0);
  const custosNegocio = custosFixos + custosVariaveis;
  const ganhoLiquido = Number(pnl?.ganho_liquido ?? 0);
  const despesasPessoais = Number(pnl?.despesas_pessoais ?? 0);
  const pvTotal = Number(pnl?.pv_total ?? 0);
  const hasBusinessExpenses = expenses.some((expense) =>
    isBusinessScope(expense.scope),
  );
  const resultPositive = ganhoLiquido >= 0;

  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  const breakdownMap = new Map<string, BreakdownRow>();
  for (const expense of expenses) {
    const categoryId = expense.category_id;
    const scope = expense.scope;
    const key = `${categoryId ?? "none"}:${scope ?? "none"}`;
    const current = breakdownMap.get(key);
    if (current) {
      current.count += 1;
      current.amount += Number(expense.amount);
    } else {
      breakdownMap.set(key, {
        key,
        categoryId,
        categoryName:
          (categoryId ? categoryNames.get(categoryId) : null) ??
          "Sem categoria",
        scope,
        count: 1,
        amount: Number(expense.amount),
      });
    }
  }

  const breakdown = Array.from(breakdownMap.values()).sort(
    (a, b) =>
      expenseScopeOrder(a.scope) - expenseScopeOrder(b.scope) ||
      b.amount - a.amount,
  );

  const monthLabel = formatMonth(mes);
  const [monthNameRaw = monthLabel, year = ""] = monthLabel.split(" de ");
  const monthName =
    monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
  const previousMonth = shiftMonth(mes, -1);
  const nextMonth = shiftMonth(mes, 1);
  const okMessage =
    params.ok === "extrato"
      ? "Extrato atualizado."
      : params.ok === "extrato_removido"
        ? "Extrato removido."
        : null;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <header className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-soft">
            Resultado · fechamento mensal
          </p>
          <h1 className="mt-1.5 font-display text-[42px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[54px]">
            <mark className="month-mark">{monthName}</mark>{" "}
            <span className="text-[19px] font-normal tracking-[-0.02em] text-ink-soft sm:text-[22px]">
              {year}
            </span>
          </h1>
          <p className="mt-1.5 text-[12px] text-ink-soft">
            {isAdmin
              ? "Vendas, royalties, custos e despesas pessoais do mês."
              : "Ganho de vendas e custos do negócio no mês."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button asChild variant="outline" size="icon-sm" className="h-9 w-9">
            <Link
              href={`/resultado?mes=${previousMonth}`}
              aria-label="Mês anterior"
            >
              <ChevronLeft />
            </Link>
          </Button>

          <form
            method="get"
            action="/resultado"
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
                defaultValue={mes}
                className="num h-9 w-40 bg-surface text-[12px]"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-9">
              Aplicar
            </Button>
          </form>

          <Button asChild variant="outline" size="icon-sm" className="h-9 w-9">
            <Link
              href={`/resultado?mes=${nextMonth}`}
              aria-label="Próximo mês"
            >
              <ChevronRight />
            </Link>
          </Button>

          {mes !== currentMonth ? (
            <Button asChild variant="ghost" className="h-9">
              <Link href="/resultado">Mês atual</Link>
            </Button>
          ) : null}

          {isAdmin ? (
            <Button asChild variant="outline" className="h-9">
              <Link href={`/financeiro/fechamento?mes=${mes}`}>
                <LockKeyhole />
                {closingStatus === "closed" ? "Fechado" : "Fechamento"}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <dl
        className={cn(
          "grid grid-cols-2 gap-px border-y border-line bg-line",
          isAdmin
            ? "lg:grid-cols-[2.05fr_1fr_1fr_1fr]"
            : "lg:grid-cols-[2.05fr_1fr_1fr]",
        )}
      >
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            {isAdmin ? "Resultado do mês" : "Resultado operacional"}
          </dt>
          <dd
            className={cn(
              "mt-2 font-display text-[32px] leading-none font-semibold tracking-[-0.035em] whitespace-nowrap sm:text-[38px]",
              !hasBusinessExpenses || resultPositive
                ? "text-moss-ink"
                : "text-rust-ink",
            )}
          >
            {hasBusinessExpenses ? formatMoney(ganhoLiquido) : "—"}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {!hasBusinessExpenses
              ? "Aguardando despesas do mês"
              : isAdmin
                ? statement
                  ? "Ganho de vendas + royalties/bônus − custos"
                  : "Ganho de vendas − custos · sem extrato no mês"
                : "Ganho de vendas − custos do negócio"}
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Ganho de vendas
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(ganhoVendas)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {formatDecimal(pvTotal)} PV
          </p>
        </div>

        {isAdmin ? (
          <div className="bg-paper px-4 py-5 sm:px-5">
            <dt className="text-[11.5px] font-medium text-ink-soft">
              Royalties + bônus
            </dt>
            <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
              {statement ? formatMoney(royalties + bonus) : "—"}
            </dd>
            <p className="mt-2 text-[10.5px] text-ink-soft">
              {statement
                ? `Royalties ${formatMoney(royalties)} · Bônus ${formatMoney(bonus)}`
                : "sem extrato no mês"}
            </p>
          </div>
        ) : null}

        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Custos do mês
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {hasBusinessExpenses ? formatMoney(custosNegocio) : "—"}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {hasBusinessExpenses
              ? `Fixos ${formatMoney(custosFixos)} · Variáveis ${formatMoney(custosVariaveis)}`
              : "sem despesas lançadas"}
          </p>
        </div>
      </dl>

      {isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <div>
            <p className="text-[11.5px] font-medium text-ink-soft">
              Despesas pessoais
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-soft">
              Não entram no resultado do negócio.
            </p>
          </div>
          <p className="num text-[18px] font-medium">
            {formatMoney(despesasPessoais)}
          </p>
        </div>
      ) : null}

      {!hasBusinessExpenses ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-citrus/30 bg-citrus-soft px-4 py-3">
          <div>
            <p className="text-[12.5px] font-medium text-citrus-ink">
              Despesas do negócio de {formatMonth(mes)} ainda não lançadas.
            </p>
            <p className="mt-0.5 text-[11px] text-citrus-ink/85">
              O resultado do mês fica incompleto até os custos serem
              registrados.
              {mes > "2023-07"
                ? " O histórico importado da planilha cobre despesas apenas em julho de 2023."
                : null}
            </p>
          </div>
          <Button asChild size="sm" className="h-8">
            <Link href={`/despesas/nova?mes=${mes}`}>
              <Plus />
              Lançar despesa
            </Link>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="resultado-categorias">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="resultado-categorias"
              className="font-serif text-[24px] leading-none font-normal"
            >
              Despesas por categoria
            </h2>
            <p className="mt-1 text-[11.5px] text-ink-soft">
              {formatInt(expenseCount)}{" "}
              {expenseCount === 1 ? "lançamento" : "lançamentos"} no mês
              {isAdmin && despesasPessoais !== 0
                ? " · inclui despesas pessoais"
                : ""}
              .
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={`/despesas?mes=${mes}`}>Ver lançamentos</Link>
          </Button>
        </div>

        {breakdown.length === 0 ? (
          <p className="border-y border-line py-8 text-center text-sm text-ink-soft">
            As despesas do mês aparecerão aqui depois do primeiro lançamento.
          </p>
        ) : (
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Categoria
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Tipo
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft sm:table-cell">
                    Lançamentos
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((row) => (
                  <TableRow
                    key={row.key}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="max-w-[360px] border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px]">
                      {row.categoryId ? (
                        <Link
                          href={`/despesas?mes=${mes}&categoria=${row.categoryId}`}
                          className="block truncate font-medium underline-offset-2 hover:underline"
                        >
                          {row.categoryName}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium">
                          {row.categoryName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2.5">
                      <ExpenseScopeBadge scope={row.scope} />
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] text-ink-soft sm:table-cell">
                      {formatInt(row.count)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num px-2 py-2.5 pr-3 text-right text-[13px] font-medium whitespace-nowrap",
                        row.amount < 0 ? "text-rust-ink" : "text-ink",
                      )}
                    >
                      {formatMoney(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {isAdmin ? (
        <section
          aria-labelledby="resultado-extrato"
          className="grid gap-5 border-t border-line pt-5 lg:grid-cols-[1fr_1.2fr]"
        >
          <div>
            <h2
              id="resultado-extrato"
              className="font-serif text-[24px] leading-none font-normal"
            >
              Extrato Herbalife
            </h2>
            <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-ink-soft">
              Registre royalties e bônus em dólar. O resultado usa o câmbio
              informado para converter os valores para reais.
            </p>
            {!statement ? (
              <p className="mt-3 text-[11px] text-ink-soft">
                Nenhum extrato salvo para {formatMonth(mes)}.
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <StatementForm
              month={mes}
              initial={
                statement
                  ? {
                      royalty_usd: statement.royalty_usd,
                      royalty_fx: statement.royalty_fx,
                      bonus_usd: statement.bonus_usd,
                      bonus_fx: statement.bonus_fx,
                    }
                  : null
              }
            />
          </div>
        </section>
      ) : null}

      <p className="text-[10.5px] leading-relaxed text-ink-soft">
        Vendas usam o lucro registrado em cada lançamento. Custos fixos e
        variáveis vêm das despesas do negócio; despesas pessoais não alteram o
        resultado.
        {!isAdmin
          ? " Royalties e bônus são visíveis apenas para administradores."
          : null}
      </p>
    </div>
  );
}
