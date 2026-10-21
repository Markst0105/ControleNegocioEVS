import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Pencil, Plus } from "lucide-react";
import { Suspense } from "react";

import { FlashToast } from "@/components/app/flash-toast";
import {
  MdoBreakdownTable,
  type MdoBreakdownRow,
} from "@/components/app/mdo-breakdown-table";
import { MdoMetricGrid } from "@/components/app/mdo-metric-grid";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDays,
  currentMonthISO,
  formatDate,
  formatDateLong,
  formatInt,
  formatMonth,
  nextMonthFirstDay,
  parseDateInput,
  todayISO,
} from "@/lib/format";
import {
  buildDailyBreakdown,
  buildMonthlyBreakdown,
  eachDay,
  emptyMdoMetrics,
  sumMdoMetrics,
  type MdoKpiRow,
  type MdoSaleContext,
  type MdoSaleRow,
} from "@/lib/mdo-metrics";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "MDO",
};

type SearchParams = Promise<{
  aba?: string;
  de?: string;
  ate?: string;
  ok?: string;
}>;

type Supabase = Awaited<ReturnType<typeof createClient>>;

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MAX_RANGE_DAYS = 366;
const SALES_PAGE_SIZE = 1000;

function weekdayShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

async function fetchSalesInRange(
  supabase: Supabase,
  from: string,
  to: string,
): Promise<MdoSaleRow[]> {
  const rows: MdoSaleRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select("sold_on, product_id, deal_type_code, amount_received, profit, pv")
      .gte("sold_on", from)
      .lte("sold_on", to)
      .order("sold_on")
      .order("id")
      .range(offset, offset + SALES_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as MdoSaleRow[];
    rows.push(...batch);
    if (batch.length < SALES_PAGE_SIZE) break;
    offset += batch.length;
  }

  return rows;
}

async function loadMdoRange(
  supabase: Supabase,
  from: string,
  to: string,
  dates: string[],
): Promise<{
  dailyRows: ReturnType<typeof buildDailyBreakdown>;
  kpiByDate: Map<string, MdoKpiRow>;
}> {
  const [kpiResult, dealTypesResult, sales] = await Promise.all([
    supabase
      .from("daily_kpis")
      .select("kpi_date, acesso_total, cartelas, cortesias, consumo_proprio")
      .gte("kpi_date", from)
      .lte("kpi_date", to)
      .order("kpi_date"),
    supabase.from("deal_types").select("code, kind"),
    fetchSalesInRange(supabase, from, to),
  ]);

  const firstError = [kpiResult.error, dealTypesResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const kpis = (kpiResult.data ?? []) as MdoKpiRow[];
  const kpiByDate = new Map(kpis.map((kpi) => [kpi.kpi_date, kpi]));

  const productIds = Array.from(
    new Set(
      sales
        .map((sale) => sale.product_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const productsResult =
    productIds.length > 0
      ? await supabase
          .from("products")
          .select("id, item_class")
          .in("id", productIds)
      : { data: [], error: null };

  if (productsResult.error) throw new Error(productsResult.error.message);

  const context: MdoSaleContext = {
    productItemClass: new Map(
      (productsResult.data ?? []).map((product) => [
        product.id,
        product.item_class,
      ]),
    ),
    dealKind: new Map(
      (dealTypesResult.data ?? []).map((deal) => [deal.code, deal.kind]),
    ),
  };

  const salesByDate = new Map<string, MdoSaleRow[]>();
  for (const sale of sales) {
    const rows = salesByDate.get(sale.sold_on);
    if (rows) rows.push(sale);
    else salesByDate.set(sale.sold_on, [sale]);
  }

  return {
    dailyRows: buildDailyBreakdown(dates, kpiByDate, salesByDate, context),
    kpiByDate,
  };
}

export default async function MdoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tab = params.aba === "mes" ? "mes" : "semana";
  const today = todayISO();
  const currentMonth = currentMonthISO();
  const monthStart = `${currentMonth}-01`;
  const monthEnd = addDays(nextMonthFirstDay(currentMonth), -1);

  let from = parseDateInput(params.de ?? null) ?? monthStart;
  let to = parseDateInput(params.ate ?? null) ?? monthEnd;
  if (from > to) [from, to] = [to, from];

  let dates = eachDay(from, to);
  let rangeCapped = false;
  if (dates.length > MAX_RANGE_DAYS) {
    dates = dates.slice(-MAX_RANGE_DAYS);
    from = dates[0];
    rangeCapped = true;
  }

  const weekFrom = addDays(today, -6);
  const activeFrom = tab === "semana" ? weekFrom : from;
  const activeTo = tab === "semana" ? today : to;
  const activeDates = tab === "semana" ? eachDay(weekFrom, today) : dates;

  const supabase = await createClient();
  const { dailyRows, kpiByDate } = await loadMdoRange(
    supabase,
    activeFrom,
    activeTo,
    activeDates,
  );

  const totals = sumMdoMetrics(dailyRows.map((row) => row.metrics));
  const kpiDays = dailyRows.filter((row) => row.hasKpi).length;
  const todayRow = dailyRows.find((row) => row.date === today) ?? null;
  const todayHasKpi = Boolean(kpiByDate.get(today));

  const monthRows = tab === "mes" ? buildMonthlyBreakdown(dailyRows, from, to, today) : [];
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const monthLabel = sameMonth ? formatMonth(from.slice(0, 7)) : null;
  const [monthName, year] = monthLabel?.split(" de ") ?? [];
  const monthTabHref =
    tab === "mes"
      ? `/mdo?aba=mes&de=${from}&ate=${to}`
      : "/mdo?aba=mes";

  const daySublabel = (date: string, hasKpi: boolean) =>
    `${weekdayShort(date)}${hasKpi ? "" : " · sem MDO"}`;

  const weekRows: MdoBreakdownRow[] = dailyRows.map((row) => ({
    key: row.date,
    label: String(Number(row.date.slice(8, 10))).padStart(2, "0"),
    sublabel: daySublabel(row.date, row.hasKpi),
    href: `/mdo/${row.date}`,
    metrics: row.metrics,
    kpiDays: row.hasKpi ? 1 : 0,
    days: 1,
  }));

  const weekTotals: MdoBreakdownRow = {
    key: "semana",
    label: "Semana",
    sublabel: `${formatInt(kpiDays)} de 7 dias com MDO`,
    metrics: totals,
    kpiDays,
    days: 7,
  };

  const periodTotals: MdoBreakdownRow = {
    key: "periodo",
    label: "Período",
    sublabel: `${formatInt(kpiDays)} de ${formatInt(activeDates.length)} dias com MDO`,
    metrics: totals,
    kpiDays,
    days: activeDates.length,
  };

  const dailyDetailRows: MdoBreakdownRow[] = dailyRows.map((row) => {
    const day = String(Number(row.date.slice(8, 10))).padStart(2, "0");
    return {
      key: row.date,
      label: tab === "mes" && !sameMonth ? `${day}/${row.date.slice(5, 7)}` : day,
      sublabel: daySublabel(row.date, row.hasKpi),
      href: `/mdo/${row.date}`,
      metrics: row.metrics,
      kpiDays: row.hasKpi ? 1 : 0,
      days: 1,
    };
  });

  const monthBreakdownRows: MdoBreakdownRow[] = monthRows.map((row) => {
    const [name, rowYear] = formatMonth(row.month).split(" de ");
    const flags = [
      `${formatInt(row.kpiDays)}/${formatInt(row.days)} dias com MDO`,
      row.partial ? "parcial" : null,
      row.ongoing ? "em andamento" : null,
    ].filter(Boolean);

    return {
      key: row.month,
      label: name ?? row.month,
      sublabel: `${rowYear ?? ""} · ${flags.join(" · ")}`,
      metrics: row.metrics,
      kpiDays: row.kpiDays,
      days: row.days,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {params.ok === "salvo" ? <FlashToast message="Dia do MDO salvo." /> : null}
      </Suspense>

      <PageHeader
        title="MDO"
        description="Rotina diária, movimento de clientes e resultado das vendas."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href={`/mdo/${today}`}>
              <CalendarPlus />
              Abrir hoje
            </Link>
          </Button>
        }
      />

      <nav
        aria-label="Visão do MDO"
        className="flex w-fit items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
      >
        <Link
          href="/mdo"
          aria-current={tab === "semana" ? "page" : undefined}
          className={cn(
            "rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
            tab === "semana"
              ? "bg-ink text-paper"
              : "text-ink-soft hover:bg-moss-soft/40 hover:text-ink",
          )}
        >
          Semana
        </Link>
        <Link
          href={monthTabHref}
          aria-current={tab === "mes" ? "page" : undefined}
          className={cn(
            "rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
            tab === "mes"
              ? "bg-ink text-paper"
              : "text-ink-soft hover:bg-moss-soft/40 hover:text-ink",
          )}
        >
          Mês
        </Link>
      </nav>

      {tab === "semana" ? (
        <>
          <section aria-labelledby="mdo-hoje">
            <div className="flex flex-wrap items-end justify-between gap-3 border-y border-line py-4">
              <div>
                <p className="text-[10.5px] font-medium tracking-[0.16em] text-ink-soft uppercase">
                  MDO de hoje
                </p>
                <h2
                  id="mdo-hoje"
                  className="mt-1.5 flex items-baseline gap-3 font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.045em]"
                >
                  <span className="num">
                    {String(Number(today.slice(8, 10))).padStart(2, "0")}
                  </span>
                  <span className="font-sans text-[13px] font-normal tracking-normal text-ink-soft">
                    {formatDateLong(today).split(",")[0]}
                  </span>
                </h2>
                <p className="mt-1 text-[11.5px] text-ink-soft">
                  {formatMonth(today.slice(0, 7))}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-sm px-2 py-1 text-[10.5px] font-medium",
                    todayHasKpi
                      ? "bg-moss-soft text-moss-ink"
                      : "bg-citrus-soft text-citrus-ink",
                  )}
                >
                  {todayHasKpi ? "Registrado" : "Pendente"}
                </span>
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={`/mdo/${today}`}>
                    {todayHasKpi ? <Pencil /> : <Plus />}
                    {todayHasKpi ? "Editar dia" : "Registrar dia"}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <MdoMetricGrid
                metrics={todayRow?.metrics ?? emptyMdoMetrics()}
                kpiDays={todayHasKpi ? 1 : 0}
                days={1}
              />
            </div>
            <p className="mt-2 text-[10.5px] text-ink-soft">
              Acessos, créditos, cortesias e consumo vêm do MDO do dia. Extras,
              trocas, unidades e valores vêm das vendas registradas.
            </p>
          </section>

          <section aria-labelledby="mdo-semana">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  id="mdo-semana"
                  className="font-serif text-[24px] leading-none font-normal"
                >
                  Últimos 7 dias
                </h2>
                <p className="mt-1 text-[11.5px] text-ink-soft">
                  {formatDate(weekFrom)} a {formatDate(today)} ·{" "}
                  {formatInt(kpiDays)} de 7 dias com MDO
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-8">
                <Link href={monthTabHref}>Ver mês</Link>
              </Button>
            </div>

            <MdoBreakdownTable
              rows={weekRows}
              totals={weekTotals}
              labelHeading="Dia"
            />
            {kpiDays > 0 && kpiDays < 7 ? (
              <p className="mt-2 text-[10.5px] text-ink-soft">
                Campos manuais somam apenas os dias com MDO registrado.
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <section className="flex flex-wrap items-end justify-between gap-4 border-y border-line py-4">
            <div>
              <p className="text-[10.5px] font-medium tracking-[0.16em] text-ink-soft uppercase">
                MDO do mês
              </p>
              <h2 className="mt-1.5 font-display text-[36px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[44px]">
                {sameMonth ? (
                  <>
                    <mark className="month-mark">{monthName}</mark>{" "}
                    <span className="font-normal text-ink-soft">{year}</span>
                  </>
                ) : (
                  <span>Período selecionado</span>
                )}
              </h2>
              <p className="mt-1 text-[12px] text-ink-soft">
                {formatDate(from)} a {formatDate(to)} ·{" "}
                {formatInt(dates.length)} dias
              </p>
            </div>

            <form
              method="get"
              action="/mdo"
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="aba" value="mes" />
              <div className="grid gap-1">
                <Label
                  htmlFor="de"
                  className="text-[10.5px] font-medium text-ink-soft"
                >
                  De
                </Label>
                <Input
                  id="de"
                  name="de"
                  type="date"
                  defaultValue={from}
                  className="num h-9 w-[142px] bg-surface text-[12px]"
                />
              </div>
              <div className="grid gap-1">
                <Label
                  htmlFor="ate"
                  className="text-[10.5px] font-medium text-ink-soft"
                >
                  Até
                </Label>
                <Input
                  id="ate"
                  name="ate"
                  type="date"
                  defaultValue={to}
                  className="num h-9 w-[142px] bg-surface text-[12px]"
                />
              </div>
              <Button type="submit" variant="secondary" className="h-9">
                Aplicar
              </Button>
              {from !== monthStart || to !== monthEnd ? (
                <Button asChild variant="ghost" className="h-9">
                  <Link href="/mdo?aba=mes">Mês atual</Link>
                </Button>
              ) : null}
            </form>
          </section>

          {rangeCapped ? (
            <p
              role="alert"
              className="rounded-md border border-citrus/30 bg-citrus-soft px-3 py-2 text-[12px] text-citrus-ink"
            >
              O intervalo máximo é de {MAX_RANGE_DAYS} dias. Ajustamos o início
              para {formatDate(from)}.
            </p>
          ) : null}

          <section aria-labelledby="mdo-resumo">
            <div className="mb-2">
              <h2
                id="mdo-resumo"
                className="font-serif text-[24px] leading-none font-normal"
              >
                Resumo do período
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-soft">
                {formatInt(kpiDays)} de {formatInt(dates.length)} dias com MDO
                registrado.
              </p>
            </div>
            <MdoMetricGrid
              metrics={totals}
              kpiDays={kpiDays}
              days={dates.length}
            />
          </section>

          <section aria-labelledby="mdo-meses">
            <div className="mb-2">
              <h2
                id="mdo-meses"
                className="font-serif text-[24px] leading-none font-normal"
              >
                Resumo por mês
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-soft">
                Meses incluídos no intervalo, mesmo quando cobertos em parte.
              </p>
            </div>
            <MdoBreakdownTable
              rows={monthBreakdownRows}
              totals={periodTotals}
              labelHeading="Mês"
            />
          </section>

          <section aria-labelledby="mdo-diario">
            <div className="mb-2">
              <h2
                id="mdo-diario"
                className="font-serif text-[24px] leading-none font-normal"
              >
                Detalhamento diário
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-soft">
                Abra um dia para atualizar os campos manuais do MDO.
              </p>
            </div>
            <MdoBreakdownTable
              rows={dailyDetailRows}
              totals={periodTotals}
              labelHeading="Dia"
            />
          </section>
        </>
      )}
    </div>
  );
}
