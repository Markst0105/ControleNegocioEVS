import {
  RESERVATION_STATUS_LABELS,
  isReservationStatus,
  type ReservationStatus,
} from "@/lib/reservations";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<ReservationStatus, string> = {
  open: "border-citrus/35 bg-citrus-soft text-citrus-ink",
  confirmed: "border-steel/25 bg-steel-soft text-steel-ink",
  cancelled: "border-line bg-secondary text-ink-soft",
  converted: "border-moss/25 bg-moss-soft text-moss-ink",
};

export function ReservationStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const valid = isReservationStatus(status) ? status : null;
  const label = valid ? RESERVATION_STATUS_LABELS[valid] : status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-medium whitespace-nowrap",
        valid ? STATUS_CLASSES[valid] : "border-line bg-surface text-ink-soft",
        className,
      )}
    >
      {label}
    </span>
  );
}
