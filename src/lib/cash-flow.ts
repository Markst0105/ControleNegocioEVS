export const CASH_DIRECTION_VALUES = ["todas", "entradas", "saidas"] as const;
export type CashDirectionFilter = (typeof CASH_DIRECTION_VALUES)[number];

export const CASH_ENTRY_FILTER_VALUES = [
  "todos",
  "recebimento",
  "despesa",
  "compra",
] as const;
export type CashEntryFilter = (typeof CASH_ENTRY_FILTER_VALUES)[number];

export const CASH_ENTRY_FILTER_OPTIONS: {
  value: CashEntryFilter;
  label: string;
}[] = [
  { value: "todos", label: "Todos os tipos" },
  { value: "recebimento", label: "Recebimentos" },
  { value: "despesa", label: "Despesas" },
  { value: "compra", label: "Compras de estoque" },
];

export function isCashDirectionFilter(
  value: string | null | undefined,
): value is CashDirectionFilter {
  return (
    typeof value === "string" &&
    (CASH_DIRECTION_VALUES as readonly string[]).includes(value)
  );
}

export function isCashEntryFilter(
  value: string | null | undefined,
): value is CashEntryFilter {
  return (
    typeof value === "string" &&
    (CASH_ENTRY_FILTER_VALUES as readonly string[]).includes(value)
  );
}

export function cashEntryKindFromFilter(
  filter: CashEntryFilter,
): "receipt" | "expense" | "purchase" | null {
  if (filter === "recebimento") return "receipt";
  if (filter === "despesa") return "expense";
  if (filter === "compra") return "purchase";
  return null;
}

export function cashEntryKindLabel(kind: string): string {
  if (kind === "receipt") return "Recebimento";
  if (kind === "expense") return "Despesa";
  if (kind === "purchase") return "Compra";
  return kind;
}
