export const RECEIVABLE_FILTER_VALUES = [
  "abertos",
  "vencidos",
  "hoje",
  "proximos",
  "parciais",
  "sem_vencimento",
  "liquidados",
  "todos",
] as const;

export type ReceivableFilter = (typeof RECEIVABLE_FILTER_VALUES)[number];

export const RECEIVABLE_FILTER_OPTIONS: {
  value: ReceivableFilter;
  label: string;
}[] = [
  { value: "abertos", label: "Em aberto" },
  { value: "vencidos", label: "Vencidos" },
  { value: "hoje", label: "Vencem hoje" },
  { value: "proximos", label: "Próximos 7 dias" },
  { value: "parciais", label: "Parcialmente recebidos" },
  { value: "sem_vencimento", label: "Sem vencimento" },
  { value: "liquidados", label: "Liquidados" },
  { value: "todos", label: "Todos" },
];

export function isReceivableFilter(
  value: string | null | undefined,
): value is ReceivableFilter {
  return (
    typeof value === "string" &&
    (RECEIVABLE_FILTER_VALUES as readonly string[]).includes(value)
  );
}

const STATUS_LABELS: Record<string, string> = {
  vencido: "Vencido",
  vence_hoje: "Vence hoje",
  a_vencer: "A vencer",
  recebido: "Recebido",
  baixado: "Baixado",
  sem_vencimento: "Sem vencimento",
  sem_valor: "Sem valor",
};

export function receivableStatusLabel(
  status: string | null | undefined,
): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

export function isSettledReceivable(openAmount: number): boolean {
  return openAmount <= 0;
}

export function hasPartialReceipt(
  receivedAmount: number,
  openAmount: number,
): boolean {
  return receivedAmount > 0 && openAmount > 0;
}
