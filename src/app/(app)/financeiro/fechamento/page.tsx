import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";

import { FlashToast } from "@/components/app/flash-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession } from "@/lib/auth";
import {
  addDays,
  currentMonthISO,
  formatDate,
  formatDateTime,
  formatInt,
  formatMoney,
  formatMonth,
  isMonthISO,
  monthFirstDay,
  nextMonthFirstDay,
  shiftMonth,
} from "@/lib/format";
import {
  monthCloseChanges,
  monthCloseStatusLabel,
  monthCloseWarnings,
  type MonthCloseChange,
  type MonthCloseSnapshot,
  type MonthCloseSummary,
} from "@/lib/month-close";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { CloseMonthForm, ReopenMonthForm } from "./month-close-forms";

export const metadata: Metadata = {
  title: "Fechamento",
};

const OK_MESSAGES: Record<string, string> = {
  fechado: "Mês fechado. O snapshot foi registrado.",
  reaberto: "Mês reaberto. O último snapshot foi preservado.",
};

type SearchParams = Promise<{
  mes?: string;
  ok?: string;
}>;

function changeValue(
  value: number | boolean,
  format: MonthCloseChange["format"],
): string {
  if (format === "boolean") return value ? "Sim" : "Não";
  if (format === "int") return formatInt(Number(value));
  return formatMoney(Number(value));
}

function LedgerRow({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "muted";
  detail?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <div>
        <dt className="text-[12px]">{label}</dt>
        {detail ? (
          <p className="mt-0.5 text-[10.5px] text-ink-soft">{detail}</p>
        ) : null}
      </div>
      <dd
        className={cn(
          "num text-right text-[12.5px] font-medium whitespace-nowrap",
          tone === "positive" && "text-moss-ink",
          tone === "negative" && "text-rust-ink",
          tone === "muted" && "text-ink-soft",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (session?.profile?.role !== "admin") redirect("/painel");

  const currentMonth = currentMonthISO();
  const month =
    isMonthISO(params.mes) && params.mes <= currentMonth
      ? params.mes
      : currentMonth;
  const from = monthFirstDay(month);
  const supabase = await createClient();

  const [summaryResult, closingResult] = await Promise.all([
    supabase.rpc("month_close_summary", { p_month: from }).maybeSingle(),
    supabase
      .from("month_closings")
      .select(
        "id, month, status, closed_at, closed_by, close_note, snapshot, reopened_at, reopened_by, reopen_note, created_at, updated_at",
      )
      .eq("month", from)
      .maybeSingle(),
  ]);

  const firstError = [summaryResult.error, closingResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const summary = summaryResult.data as MonthCloseSummary | null;
  if (!summary) throw new Error("Não foi possível carregar o resumo do mês.");

  const closing = closingResult.data;
  const profileIds = [closing?.closed_by, closing?.reopened_by].filter(
    (value): value is string => Boolean(value),
  );

  const profilesResult = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, name")
        .in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new Error(profilesResult.error.message);

  const profileNames = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.name]),
  );
  const closedByName = closing?.closed_by
    ? (profileNames.get(closing.closed_by) ?? "—")
    : null;
  const reopenedByName = closing?.reopened_by
    ? (profileNames.get(closing.reopened_by) ?? "—")
    : null;

  const snapshot = (closing?.snapshot ?? null) as MonthCloseSnapshot | null;
  const isClosed = closing?.status === "closed";
  const wasReopened = closing?.status === "open";
  const changes =
    isClosed && snapshot ? monthCloseChanges(snapshot, summary) : [];
  const warnings = monthCloseWarnings(summary, month, currentMonth);
  const statusLabel = monthCloseStatusLabel(closing);

  const ganhoVendas = Number(summary.ganho_vendas);
  const royalties = Number(summary.royalties);
  const bonus = Number(summary.bonus);
  const ganhoBruto = Number(summary.ganho_bruto);
  const custosFixos = Number(summary.custos_fixos);
  const custosVariaveis = Number(summary.custos_variaveis);
  const ganhoLiquido = Number(summary.ganho_liquido);
  const despesasPessoais = Number(summary.despesas_pessoais);
  const cashIn = Number(summary.cash_in);
  const businessExpenses = Number(summary.business_expenses_total);
  const personalExpenses = Number(summary.personal_expenses_total);
  const purchasesTotal = Number(summary.purchases_total);
  const netCash = Number(summary.net_cash);
  const openReceivables = Number(summary.open_receivables);
  const overdueReceivables = Number(summary.overdue_receivables);
  const openReceivablesCount = Number(summary.open_receivables_count);
  const salesCount = Number(summary.sales_count);
  const businessExpenseCount = Number(summary.business_expense_count);

  const monthLabel = formatMonth(month);
  const [monthNameRaw = monthLabel, year = ""] = monthLabel.split(" de ");
  const monthName =
    monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const monthEnd = formatDate(addDays(nextMonthFirstDay(month), -1));
  const okMessage = params.ok ? OK_MESSAGES[params.ok] : null;

  const stampTone =
    isClosed
      ? "border-moss/60 bg-moss-soft text-moss-ink"
      : wasReopened
        ? "border-citrus/50 bg-citrus-soft text-citrus-ink"
        : "border-line bg-paper text-ink-soft";

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <header className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-soft">
            Financeiro · fechamento mensal
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[42px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[54px]">
              <mark className="month-mark">{monthName}</mark>{" "}
              <span className="text-[19px] font-normal tracking-[-0.02em] text-ink-soft sm:text-[22px]">
                {year}
              </span>
            </h1>
            <span
              className={cn(
                "-rotate-2 border-2 px-2.5 py-1 font-display text-[11px] font-semibold tracking-[0.14em] uppercase",
                stampTone,
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-[12px] text-ink-soft">
            Conferência de resultado, caixa e recebíveis até {monthEnd}. O
            fechamento é uma fotografia: não bloqueia lançamentos posteriores.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button asChild variant="outline" size="icon-sm" className="h-9 w-9">
            <Link
              href={`/financeiro/fechamento?mes=${previousMonth}`}
              aria-label="Mês anterior"
            >
              <ChevronLeft />
            </Link>
          </Button>

          <form
            method="get"
            action="/financeiro/fechamento"
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
                max={currentMonth}
                className="num h-9 w-40 bg-surface text-[12px]"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-9">
              Aplicar
            </Button>
          </form>

          {nextMonth <= currentMonth ? (
            <Button asChild variant="outline" size="icon-sm" className="h-9 w-9">
              <Link
                href={`/financeiro/fechamento?mes=${nextMonth}`}
                aria-label="Próximo mês"
              >
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-9 w-9"
              disabled
              aria-label="Próximo mês"
            >
              <ChevronRight />
            </Button>
          )}

          {month !== currentMonth ? (
            <Button asChild variant="ghost" className="h-9">
              <Link href="/financeiro/fechamento">Mês atual</Link>
            </Button>
          ) : null}

          <Button asChild variant="outline" className="h-9">
            <Link href={`/financeiro/caixa?mes=${month}`}>Ver caixa</Link>
          </Button>
        </div>
      </header>

      {isClosed && changes.length > 0 ? (
        <div className="rounded-md border border-citrus/35 bg-citrus-soft px-4 py-3 text-citrus-ink">
          <p className="flex items-center gap-2 text-[12.5px] font-medium">
            <AlertTriangle className="size-4" />
            Dados alterados depois do fechamento
          </p>
          <p className="mt-0.5 text-[11px] text-citrus-ink/85">
            Compare com o snapshot e reabra o mês se precisar registrar um novo
            fechamento.
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {changes.map((change) => (
              <li
                key={change.key}
                className="flex items-baseline justify-between gap-3 text-[11px]"
              >
                <span>{change.label}</span>
                <span className="num whitespace-nowrap">
                  {changeValue(change.before, change.format)} →{" "}
                  <strong className="font-semibold">
                    {changeValue(change.after, change.format)}
                  </strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : isClosed ? (
        <p className="flex items-center gap-2 rounded-md border border-moss/30 bg-moss-soft px-4 py-3 text-[12px] text-moss-ink">
          <Check className="size-4" />
          O fechamento confere com os dados atuais.
        </p>
      ) : null}

      {wasReopened && closing?.reopened_at ? (
        <p className="rounded-md border border-citrus/30 bg-citrus-soft px-4 py-3 text-[12px] leading-relaxed text-citrus-ink">
          Mês reaberto em {formatDateTime(closing.reopened_at)}
          {reopenedByName ? ` por ${reopenedByName}` : ""}. O último snapshot
          continua disponível para comparação.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-[1.35fr_1fr_1fr_1.15fr]">
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Resultado líquido
          </dt>
          <dd
            className={cn(
              "num mt-2 text-[26px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[30px]",
              ganhoLiquido >= 0 ? "text-moss-ink" : "text-rust-ink",
            )}
          >
            {formatMoney(ganhoLiquido)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            ganho de vendas + royalties/bônus − custos
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Entradas de caixa
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(cashIn)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {formatInt(Number(summary.receipts_count))}{" "}
            {Number(summary.receipts_count) === 1
              ? "recebimento"
              : "recebimentos"}
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Saídas de caixa
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap text-rust-ink sm:text-[21px]">
            {formatMoney(Number(summary.cash_out_total))}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            saldo {formatMoney(netCash)}
          </p>
        </div>

        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Recebíveis em aberto
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(openReceivables)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {overdueReceivables > 0
              ? `${formatMoney(overdueReceivables)} vencidos no fim do mês`
              : "nada vencido no fim do mês"}
          </p>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,1fr)]">
        <div className="flex flex-col gap-6">
          <section className="overflow-hidden rounded-lg border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <h2 className="font-serif text-[20px] leading-none font-normal">
                Resultado do mês
              </h2>
              <p className="mt-1 text-[10.5px] text-ink-soft">
                Competência: vendas, royalties/bônus e custos do negócio.
              </p>
            </header>
            <dl className="divide-y divide-line/70">
              <LedgerRow
                label="Ganho de vendas"
                value={formatMoney(ganhoVendas)}
                detail={`${formatInt(salesCount)} ${salesCount === 1 ? "venda" : "vendas"}`}
              />
              <LedgerRow label="Royalties" value={formatMoney(royalties)} />
              <LedgerRow label="Bônus" value={formatMoney(bonus)} />
              <LedgerRow label="Ganho bruto" value={formatMoney(ganhoBruto)} />
              <LedgerRow
                label="Custos fixos"
                value={`− ${formatMoney(custosFixos)}`}
                tone="negative"
              />
              <LedgerRow
                label="Investimentos e promoções"
                value={`− ${formatMoney(custosVariaveis)}`}
                tone="negative"
              />
              <LedgerRow
                label="Resultado líquido"
                value={formatMoney(ganhoLiquido)}
                tone={ganhoLiquido >= 0 ? "positive" : "negative"}
              />
            </dl>
            {despesasPessoais > 0 ? (
              <p className="border-t border-line px-4 py-2.5 text-[10.5px] text-ink-soft">
                Fora do resultado do negócio: {formatMoney(despesasPessoais)} em
                despesas pessoais.
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <h2 className="font-serif text-[20px] leading-none font-normal">
                Caixa do mês
              </h2>
              <p className="mt-1 text-[10.5px] text-ink-soft">
                Recebimentos pela data da baixa; despesas e compras pela data do
                lançamento.
              </p>
            </header>
            <dl className="divide-y divide-line/70">
              <LedgerRow
                label="Recebimentos"
                value={`+ ${formatMoney(cashIn)}`}
                tone="positive"
              />
              <LedgerRow
                label="Despesas do negócio"
                value={`− ${formatMoney(businessExpenses)}`}
                tone="negative"
                detail={`${formatInt(businessExpenseCount)} ${businessExpenseCount === 1 ? "lançamento" : "lançamentos"}`}
              />
              <LedgerRow
                label="Despesas pessoais"
                value={`− ${formatMoney(personalExpenses)}`}
                tone="negative"
              />
              <LedgerRow
                label="Compras de estoque"
                value={`− ${formatMoney(purchasesTotal)}`}
                tone="negative"
              />
              <LedgerRow
                label="Saldo de caixa"
                value={formatMoney(netCash)}
                tone={netCash >= 0 ? "positive" : "negative"}
              />
            </dl>
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-surface">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="font-serif text-[20px] leading-none font-normal">
                  Recebíveis no fechamento
                </h2>
                <p className="mt-1 text-[10.5px] text-ink-soft">
                  Saldo com vencimento até {monthEnd}, após os eventos até essa
                  data.
                </p>
              </div>
              <Link
                href="/financeiro/recebiveis?situacao=vencidos"
                className="text-[11px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                Ver recebíveis
              </Link>
            </header>
            <dl className="grid grid-cols-3 divide-x divide-line/70">
              <div className="px-4 py-4">
                <dt className="text-[10.5px] text-ink-soft">Em aberto</dt>
                <dd className="num mt-1.5 text-[16px] font-medium whitespace-nowrap">
                  {formatMoney(openReceivables)}
                </dd>
              </div>
              <div className="px-4 py-4">
                <dt className="text-[10.5px] text-ink-soft">Vencido</dt>
                <dd
                  className={cn(
                    "num mt-1.5 text-[16px] font-medium whitespace-nowrap",
                    overdueReceivables > 0 ? "text-rust-ink" : "text-ink",
                  )}
                >
                  {formatMoney(overdueReceivables)}
                </dd>
              </div>
              <div className="px-4 py-4">
                <dt className="text-[10.5px] text-ink-soft">Parcelas</dt>
                <dd className="num mt-1.5 text-[16px] font-medium whitespace-nowrap">
                  {formatInt(openReceivablesCount)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="font-serif text-[20px] leading-none font-normal">
                  Conferência
                </h2>
                <p className="mt-1 text-[10.5px] text-ink-soft">
                  Pendências não impedem o fechamento, mas ficam registradas.
                </p>
              </div>
              <span className="num text-[11px] text-ink-soft">
                {formatInt(businessExpenseCount)}{" "}
                {businessExpenseCount === 1 ? "despesa" : "despesas"} ·{" "}
                {summary.statement_present ? "com extrato" : "sem extrato"}
              </span>
            </header>

            {warnings.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-4 text-[12px] text-moss-ink">
                <Check className="size-4" />
                Nenhuma pendência encontrada para este mês.
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {warnings.map((warning) => (
                  <li
                    key={warning}
                    className="flex items-start gap-2 px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-soft"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-citrus-ink" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <section className="overflow-hidden rounded-lg border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <p className="text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                Situação do mês
              </p>
              <h2 className="mt-1 font-serif text-[20px] leading-none font-normal">
                {isClosed ? "Fechamento registrado" : "Aberto para fechar"}
              </h2>
            </header>

            <div className="grid gap-3 px-4 py-4">
              {closing?.closed_at ? (
                <div>
                  <p className="text-[10.5px] text-ink-soft">
                    {isClosed ? "Fechado em" : "Último fechamento"}
                  </p>
                  <p className="mt-0.5 text-[11.5px]">
                    {formatDateTime(closing.closed_at)}
                    {closedByName ? ` · ${closedByName}` : ""}
                  </p>
                  {closing.close_note ? (
                    <p className="mt-1 rounded-sm bg-paper px-2 py-1.5 text-[11px] leading-relaxed text-ink-soft">
                      {closing.close_note}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-ink-soft">
                  Este mês ainda não foi fechado. O snapshot será criado com os
                  valores atuais.
                </p>
              )}

              {wasReopened && closing?.reopened_at ? (
                <div className="border-t border-line pt-3">
                  <p className="text-[10.5px] text-ink-soft">Reaberto em</p>
                  <p className="mt-0.5 text-[11.5px]">
                    {formatDateTime(closing.reopened_at)}
                    {reopenedByName ? ` · ${reopenedByName}` : ""}
                  </p>
                  {closing.reopen_note ? (
                    <p className="mt-1 rounded-sm bg-paper px-2 py-1.5 text-[11px] leading-relaxed text-ink-soft">
                      {closing.reopen_note}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {changes.length > 0 ? (
                <p className="rounded-sm border border-citrus/30 bg-citrus-soft px-2 py-1.5 text-[10.5px] leading-relaxed text-citrus-ink">
                  {changes.length}{" "}
                  {changes.length === 1
                    ? "indicador mudou"
                    : "indicadores mudaram"}{" "}
                  desde o snapshot.
                </p>
              ) : null}
            </div>

            <div className="border-t border-line px-4 py-4">
              {isClosed ? (
                <ReopenMonthForm month={month} changed={changes.length > 0} />
              ) : (
                <CloseMonthForm month={month} warningCount={warnings.length} />
              )}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-paper px-4 py-3">
            <p className="flex items-center gap-2 text-[11px] font-medium text-ink-soft">
              <LockKeyhole className="size-3.5" />
              Fechamento com trilha
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-soft">
              O snapshot inclui resultado, caixa, recebíveis e a contagem de
              lançamentos. Cada fechamento e reabertura fica registrado na
              auditoria.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
