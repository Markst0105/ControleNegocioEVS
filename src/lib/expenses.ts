export type ExpenseScope = "pessoal" | "negocio_fixo" | "negocio_variavel";

export const EXPENSE_SCOPE_OPTIONS: ReadonlyArray<{
  value: ExpenseScope;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "negocio_fixo",
    label: "Negócio fixo",
    shortLabel: "Fixo",
    description: "Custos recorrentes do negócio.",
  },
  {
    value: "negocio_variavel",
    label: "Negócio variável",
    shortLabel: "Variável",
    description: "Custos que acompanham o movimento.",
  },
  {
    value: "pessoal",
    label: "Pessoal",
    shortLabel: "Pessoal",
    description: "Fora do resultado do negócio.",
  },
];

const SCOPE_BY_VALUE = new Map(
  EXPENSE_SCOPE_OPTIONS.map((option) => [option.value, option]),
);

export function isExpenseScope(value: unknown): value is ExpenseScope {
  return (
    value === "pessoal" ||
    value === "negocio_fixo" ||
    value === "negocio_variavel"
  );
}

export function isBusinessScope(scope: string | null | undefined): boolean {
  return scope === "negocio_fixo" || scope === "negocio_variavel";
}

export function expenseScopeLabel(
  scope: string | null | undefined,
  short = false,
): string {
  if (!isExpenseScope(scope)) return "Sem tipo";
  const option = SCOPE_BY_VALUE.get(scope);
  if (!option) return "Sem tipo";
  return short ? option.shortLabel : option.label;
}

export function expenseScopeOrder(scope: string | null | undefined): number {
  if (scope === "negocio_fixo") return 0;
  if (scope === "negocio_variavel") return 1;
  if (scope === "pessoal") return 2;
  return 3;
}

export function expenseScopeAccent(scope: string | null | undefined): string {
  if (scope === "negocio_fixo") return "border-l-moss";
  if (scope === "negocio_variavel") return "border-l-citrus";
  if (scope === "pessoal") return "border-l-rust";
  return "border-l-line-strong";
}
