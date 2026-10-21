import type { Database } from "@/lib/supabase/database.types";

export type MonthCloseSummary =
  Database["public"]["Functions"]["month_close_summary"]["Returns"][number];

export type MonthClosing =
  Database["public"]["Tables"]["month_closings"]["Row"];

export type MonthCloseSnapshot = {
  month?: string;
  generated_at?: string;
  pnl?: {
    ganho_vendas?: number | string;
    royalties?: number | string;
    bonus?: number | string;
    ganho_bruto?: number | string;
    custos_fixos?: number | string;
    custos_variaveis?: number | string;
    ganho_liquido?: number | string;
    despesas_pessoais?: number | string;
    pv_total?: number | string;
  };
  cash?: {
    cash_in?: number | string;
    expenses_total?: number | string;
    business_expenses_total?: number | string;
    personal_expenses_total?: number | string;
    purchases_total?: number | string;
    cash_out_total?: number | string;
    net_cash?: number | string;
    receipts_count?: number | string;
    expenses_count?: number | string;
    purchases_count?: number | string;
  };
  receivables?: {
    open_total?: number | string;
    overdue_total?: number | string;
    open_count?: number | string;
  };
  counts?: {
    sales_count?: number | string;
    business_expense_count?: number | string;
  };
  statement_present?: boolean;
};

export type MonthCloseChange = {
  key: string;
  label: string;
  before: number | boolean;
  after: number | boolean;
  format: "money" | "int" | "boolean";
};

function asNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberChange(
  key: string,
  label: string,
  before: number | string | undefined,
  after: number,
  format: "money" | "int" = "money",
): MonthCloseChange | null {
  const beforeNumber = asNumber(before);
  if (beforeNumber === null) return null;
  if (format === "money" && Math.abs(beforeNumber - after) <= 0.005) return null;
  if (format === "int" && Math.round(beforeNumber) === Math.round(after)) {
    return null;
  }
  return { key, label, before: beforeNumber, after, format };
}

export function monthCloseChanges(
  snapshot: MonthCloseSnapshot | null | undefined,
  current: MonthCloseSummary,
): MonthCloseChange[] {
  if (!snapshot) return [];

  const changes: (MonthCloseChange | null)[] = [
    numberChange(
      "ganho_liquido",
      "Resultado líquido",
      snapshot.pnl?.ganho_liquido,
      current.ganho_liquido,
    ),
    numberChange(
      "cash_in",
      "Entradas de caixa",
      snapshot.cash?.cash_in,
      current.cash_in,
    ),
    numberChange(
      "cash_out_total",
      "Saídas de caixa",
      snapshot.cash?.cash_out_total,
      current.cash_out_total,
    ),
    numberChange(
      "net_cash",
      "Saldo de caixa",
      snapshot.cash?.net_cash,
      current.net_cash,
    ),
    numberChange(
      "open_receivables",
      "Recebíveis em aberto",
      snapshot.receivables?.open_total,
      current.open_receivables,
    ),
    numberChange(
      "overdue_receivables",
      "Recebíveis vencidos",
      snapshot.receivables?.overdue_total,
      current.overdue_receivables,
    ),
    numberChange(
      "sales_count",
      "Vendas",
      snapshot.counts?.sales_count,
      current.sales_count,
      "int",
    ),
    numberChange(
      "business_expense_count",
      "Despesas do negócio",
      snapshot.counts?.business_expense_count,
      current.business_expense_count,
      "int",
    ),
  ];

  if (
    typeof snapshot.statement_present === "boolean" &&
    snapshot.statement_present !== current.statement_present
  ) {
    changes.push({
      key: "statement_present",
      label: "Extrato Herbalife",
      before: snapshot.statement_present,
      after: current.statement_present,
      format: "boolean",
    });
  }

  return changes.filter((change): change is MonthCloseChange => change !== null);
}

export function monthCloseWarnings(
  summary: MonthCloseSummary,
  month: string,
  currentMonth: string,
): string[] {
  const warnings: string[] = [];

  if (month === currentMonth) {
    warnings.push("O mês atual ainda não terminou.");
  }
  if (summary.sales_count === 0) {
    warnings.push("Sem vendas registradas no mês.");
  } else if (summary.receipts_count === 0) {
    warnings.push(
      "Há vendas, mas nenhum recebimento de parcela foi registrado no mês.",
    );
  }
  if (summary.business_expense_count === 0) {
    warnings.push(
      "Sem despesas do negócio no mês. O resultado está incompleto.",
    );
  }
  if (!summary.statement_present) {
    warnings.push("Extrato Herbalife não lançado no mês.");
  }
  if (summary.overdue_receivables > 0) {
    warnings.push(
      "Há parcelas vencidas em aberto no fim do mês. O fechamento não as baixa automaticamente.",
    );
  }
  if (summary.net_cash < 0) {
    warnings.push("As saídas de caixa superam as entradas no mês.");
  }

  return warnings;
}

export function monthCloseStatusLabel(
  closing: MonthClosing | null | undefined,
): string {
  if (!closing) return "Em aberto";
  if (closing.status === "closed") return "Fechado";
  return "Reaberto";
}
