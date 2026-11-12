import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Payment state of a stock purchase. Only card purchases can be pending:
 * cash/account purchases are paid on the purchase date.
 */
export function PurchasePaymentBadge({
  paidOn,
  isCreditCard,
  className,
}: {
  paidOn: string | null;
  isCreditCard: boolean;
  className?: string;
}) {
  if (!isCreditCard) {
    return (
      <span
        className={cn("text-[11px] text-ink-soft", className)}
        title="Compra paga na data da compra"
      >
        —
      </span>
    );
  }

  if (!paidOn) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-sm bg-citrus-soft px-1.5 py-px text-[10px] font-medium tracking-[0.02em] text-citrus-ink",
          className,
        )}
      >
        Pendente
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-moss-soft px-1.5 py-px text-[10px] font-medium tracking-[0.02em] text-moss-ink",
        className,
      )}
    >
      Pago {formatDate(paidOn)}
    </span>
  );
}
