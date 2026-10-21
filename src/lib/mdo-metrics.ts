import type { MdoField } from "@/lib/mdo";
import {
  addDays,
  formatDecimal,
  formatInt,
  formatMoney,
  monthDays,
} from "@/lib/format";

export type MdoMetricKey =
  | "acessos"
  | "extras"
  | "creditos"
  | "trocas"
  | "un_fechadas"
  | "cortesias"
  | "consumo"
  | "faturamento_evs"
  | "faturamento_vendas"
  | "lucro_evs"
  | "lucro_vendas"
  | "pv";

export type MdoMetricKind = "int" | "money" | "decimal";
export type MdoMetricSource = "manual" | "sales";

export type MdoMetricDefinition = {
  key: MdoMetricKey;
  label: string;
  shortLabel: string;
  kind: MdoMetricKind;
  source: MdoMetricSource;
  description: string;
};

export const MDO_METRICS: MdoMetricDefinition[] = [
  {
    key: "acessos",
    label: "Acessos",
    shortLabel: "Acessos",
    kind: "int",
    source: "manual",
    description: "Acessos registrados no MDO do dia.",
  },
  {
    key: "extras",
    label: "Extras",
    shortLabel: "Extras",
    kind: "int",
    source: "sales",
    description: "Itens de espaço extra vendidos no dia.",
  },
  {
    key: "creditos",
    label: "Créditos",
    shortLabel: "Créditos",
    kind: "int",
    source: "manual",
    description: "Cartelas de acesso vendidas, conforme o MDO do dia.",
  },
  {
    key: "trocas",
    label: "Trocas",
    shortLabel: "Trocas",
    kind: "int",
    source: "sales",
    description: "Saídas e devoluções registradas como troca.",
  },
  {
    key: "un_fechadas",
    label: "Un. fechadas",
    shortLabel: "Un. fech.",
    kind: "int",
    source: "sales",
    description: "Unidades de nutrição fechadas com clientes.",
  },
  {
    key: "cortesias",
    label: "Cortesias",
    shortLabel: "Cortesias",
    kind: "int",
    source: "manual",
    description: "Cortesias registradas no MDO do dia.",
  },
  {
    key: "consumo",
    label: "Consumo",
    shortLabel: "Consumo",
    kind: "int",
    source: "manual",
    description: "Consumo próprio registrado no MDO do dia.",
  },
  {
    key: "faturamento_evs",
    label: "Faturamento EVS",
    shortLabel: "Fat. EVS",
    kind: "money",
    source: "sales",
    description: "Receita de acessos, extras e espaço no EVS.",
  },
  {
    key: "faturamento_vendas",
    label: "Faturamento vendas",
    shortLabel: "Fat. vendas",
    kind: "money",
    source: "sales",
    description: "Receita de produtos de nutrição vendidos aos clientes.",
  },
  {
    key: "lucro_evs",
    label: "Lucro EVS",
    shortLabel: "Lucro EVS",
    kind: "money",
    source: "sales",
    description: "Receita menos custos de acessos, extras e espaço.",
  },
  {
    key: "lucro_vendas",
    label: "Lucro vendas",
    shortLabel: "Lucro vendas",
    kind: "money",
    source: "sales",
    description: "Receita menos custos dos produtos de nutrição.",
  },
  {
    key: "pv",
    label: "PV",
    shortLabel: "PV",
    kind: "decimal",
    source: "sales",
    description: "PV total das vendas para clientes no período.",
  },
];

export const MDO_MANUAL_FIELDS: Partial<Record<MdoMetricKey, MdoField>> = {
  acessos: "acesso_total",
  creditos: "cartelas",
  cortesias: "cortesias",
  consumo: "consumo_proprio",
};

export type MdoMetrics = Record<MdoMetricKey, number>;

export function emptyMdoMetrics(): MdoMetrics {
  return {
    acessos: 0,
    extras: 0,
    creditos: 0,
    trocas: 0,
    un_fechadas: 0,
    cortesias: 0,
    consumo: 0,
    faturamento_evs: 0,
    faturamento_vendas: 0,
    lucro_evs: 0,
    lucro_vendas: 0,
    pv: 0,
  };
}

export function formatMdoMetric(
  value: number | null,
  kind: MdoMetricKind,
): string {
  if (value === null) return "—";
  if (kind === "money") return formatMoney(value);
  if (kind === "decimal") return formatDecimal(value);
  return formatInt(value);
}

export type MdoKpiRow = Partial<Record<MdoField, number | null>> & {
  kpi_date: string;
};

export type MdoSaleRow = {
  sold_on: string;
  product_id: string | null;
  deal_type_code: string | null;
  amount_received: number | string | null;
  profit: number | string | null;
  pv: number | string | null;
};

export type MdoSaleContext = {
  productItemClass: Map<string, string | null>;
  dealKind: Map<string, string>;
};

export type MdoDailyRow = {
  date: string;
  hasKpi: boolean;
  metrics: MdoMetrics;
};

export type MdoMonthlyRow = {
  month: string;
  days: number;
  kpiDays: number;
  partial: boolean;
  ongoing: boolean;
  metrics: MdoMetrics;
};

function numeric(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isClientSale(kind: string | undefined): boolean {
  // "financial" is the legacy payment-only access line (pga). It belongs to
  // the client-facing EVS revenue even though it has no stock or PV.
  return (
    kind === undefined ||
    kind === "sale" ||
    kind === "discount" ||
    kind === "financial"
  );
}

function itemFamily(
  itemClass: string | null | undefined,
): "evs" | "vendas" | null {
  if (!itemClass) return null;
  if (itemClass === "E.X" || itemClass.startsWith("E.A")) return "evs";
  if (itemClass.startsWith("N.I") || itemClass.startsWith("N.E")) {
    return "vendas";
  }
  return null;
}

/**
 * Builds the 12 dashboard metrics for one date.
 *
 * Activity counts (accesses, credits, cortesias, own consumption) come from
 * the manually entered MDO row. The remaining metrics come from sales:
 * - extras: item class E.X sold to clients;
 * - trocas: loan-out + return rows;
 * - un. fechadas: nutrition lines (N.I/N.E) sold to clients;
 * - EVS revenue/profit: access/space lines (E.A*, E.X);
 * - sales revenue/profit: nutrition lines (N.I*, N.E);
 * - PV: every client sale line, including the financial access line.
 */
export function metricsForDay(
  kpi: MdoKpiRow | undefined,
  sales: MdoSaleRow[],
  context: MdoSaleContext,
): MdoMetrics {
  const metrics = emptyMdoMetrics();

  if (kpi) {
    for (const [metric, field] of Object.entries(MDO_MANUAL_FIELDS)) {
      metrics[metric as MdoMetricKey] = numeric(kpi[field]);
    }
  }

  for (const sale of sales) {
    const kind = sale.deal_type_code
      ? context.dealKind.get(sale.deal_type_code)
      : undefined;

    if (kind === "loan_out" || kind === "return") {
      metrics.trocas += 1;
      continue;
    }

    if (!isClientSale(kind)) continue;

    const itemClass = sale.product_id
      ? (context.productItemClass.get(sale.product_id) ?? null)
      : null;
    const family = itemFamily(itemClass);
    const amount = numeric(sale.amount_received);
    const profit = numeric(sale.profit);

    metrics.pv += numeric(sale.pv);

    if (itemClass === "E.X") metrics.extras += 1;

    if (family === "evs") {
      metrics.faturamento_evs += amount;
      metrics.lucro_evs += profit;
    } else if (family === "vendas") {
      metrics.faturamento_vendas += amount;
      metrics.lucro_vendas += profit;
      metrics.un_fechadas += 1;
    }
  }

  return metrics;
}

export function sumMdoMetrics(rows: MdoMetrics[]): MdoMetrics {
  const total = emptyMdoMetrics();
  for (const row of rows) {
    for (const metric of MDO_METRICS) {
      total[metric.key] += row[metric.key];
    }
  }
  return total;
}

export function buildDailyBreakdown(
  dates: string[],
  kpiByDate: Map<string, MdoKpiRow>,
  salesByDate: Map<string, MdoSaleRow[]>,
  context: MdoSaleContext,
): MdoDailyRow[] {
  return dates.map((date) => {
    const kpi = kpiByDate.get(date);
    return {
      date,
      hasKpi: Boolean(kpi),
      metrics: metricsForDay(kpi, salesByDate.get(date) ?? [], context),
    };
  });
}

/**
 * Summarises the selected range by calendar month. Months touched by the
 * range are included even when the range only covers part of them.
 */
export function buildMonthlyBreakdown(
  dailyRows: MdoDailyRow[],
  from: string,
  to: string,
  today: string,
): MdoMonthlyRow[] {
  const byMonth = new Map<string, MdoDailyRow[]>();

  for (const row of dailyRows) {
    const month = row.date.slice(0, 7);
    const rows = byMonth.get(month);
    if (rows) rows.push(row);
    else byMonth.set(month, [row]);
  }

  return Array.from(byMonth.entries()).map(([month, rows]) => {
    const lastDay = monthDays(month).at(-1) ?? `${month}-01`;
    return {
      month,
      days: rows.length,
      kpiDays: rows.filter((row) => row.hasKpi).length,
      partial: from > `${month}-01` || to < lastDay,
      ongoing: month === today.slice(0, 7) && to >= today,
      metrics: sumMdoMetrics(rows.map((row) => row.metrics)),
    };
  });
}

/** Adds a day to an inclusive list, without timezone surprises. */
export function eachDay(from: string, to: string): string[] {
  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}
