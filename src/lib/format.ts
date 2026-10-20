const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const WEEKDAYS_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Hoje no fuso do negócio (America/Sao_Paulo) como YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Mês atual (fuso do negócio) como YYYY-MM. */
export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
}

/** "2026-10" -> "2026-10-01" */
export function monthFirstDay(ym: string): string {
  return `${ym}-01`;
}

/** Primeiro dia do mês seguinte a "2026-10" -> "2026-11-01" */
export function nextMonthFirstDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** "2026-10-19" -> "19/10/2026" (sem armadilhas de fuso). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

/** "2026-10" -> "outubro de 2026" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m || !MONTHS_PT[m - 1]) return ym;
  return `${MONTHS_PT[m - 1]} de ${y}`;
}

/** "2026-10-19" -> "segunda-feira, 19 de outubro" */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS_PT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d} de ${MONTHS_PT[m - 1]}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat("pt-BR");
const decimal2 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** R$ 1.234,56 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return brl.format(value);
}

/** R$ 12,3 mil (para cartões compactos) */
export function formatMoneyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return brlCompact.format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return int.format(value);
}

/** 1.953,8? não — 1.953,80 (PV e quantidades com 2 casas) */
export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return decimal2.format(value);
}

/** 0.14 -> "14%" */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(fraction * 100)}%`;
}

/**
 * Interpreta valores em pt-BR: "1.234,56", "1234,56", "1234.56", "R$ 1.234,56".
 * Retorna null para vazio ou inválido (o chamador decide o que fazer).
 */
export function parseMoneyInput(raw: FormDataEntryValue | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" (sem centavos) = mil duzentos e trinta e quatro.
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Valida e normaliza uma data YYYY-MM-DD. Retorna null se inválida. */
export function parseDateInput(raw: FormDataEntryValue | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return s;
}

/** "14" ou "14,5" -> 0.14 / 0.145 (fração). Inválido/vazio → undefined. */
export function parsePercentInput(raw: FormDataEntryValue | null | undefined): number | undefined {
  const n = parseMoneyInput(raw);
  if (n === null || Number.isNaN(n)) return undefined;
  return n / 100;
}

/** Soma dias a uma data YYYY-MM-DD (sem armadilhas de fuso). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Valor numérico para campos de formulário: 0.5 -> "0,5"; 12 -> "12". */
export function formatDecimalInput(value: number): string {
  return String(value).replace(".", ",");
}

/** Valor monetário para campos de formulário: 181 -> "181,00". */
export function formatMoneyInput(value: number): string {
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
