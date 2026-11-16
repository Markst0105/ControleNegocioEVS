import {
  CREDIT_STATUS_CLASS,
  CREDIT_STATUS_LABELS,
  isCreditStatus,
} from "@/lib/credits";
import { cn } from "@/lib/utils";

export function CreditStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const label = isCreditStatus(status) ? CREDIT_STATUS_LABELS[status] : "—";
  const tone = isCreditStatus(status)
    ? CREDIT_STATUS_CLASS[status]
    : "border-line bg-surface text-ink-soft";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-medium tracking-wide whitespace-nowrap",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
