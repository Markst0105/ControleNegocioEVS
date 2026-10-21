import { receivableStatusLabel } from "@/lib/receivables";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  vencido: "border-rust/25 bg-rust-soft text-rust-ink",
  vence_hoje: "border-citrus/40 bg-citrus-soft text-citrus-ink",
  a_vencer: "border-steel/20 bg-steel-soft text-steel-ink",
  recebido: "border-moss/25 bg-moss-soft text-moss-ink",
  baixado: "border-line bg-surface text-ink-soft",
  sem_vencimento: "border-line bg-surface text-ink-soft",
  sem_valor: "border-line bg-surface text-ink-soft",
};

export function ReceivableStatusBadge({
  status,
  partial = false,
}: {
  status: string | null | undefined;
  partial?: boolean;
}) {
  const settled = status === "recebido" || status === "baixado";
  const label =
    partial && !settled
      ? `${receivableStatusLabel(status)} · parcial`
      : receivableStatusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-medium tracking-wide whitespace-nowrap",
        STATUS_CLASS[status ?? ""] ?? "border-line bg-surface text-ink-soft",
      )}
    >
      {label}
    </span>
  );
}
