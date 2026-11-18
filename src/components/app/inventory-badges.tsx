import { cn } from "@/lib/utils";
import { formatDecimal, formatMoney } from "@/lib/format";
import {
  LOW_STOCK_THRESHOLD,
  movementTypeLabel,
  stockStatus,
  type StockLocationRow,
} from "@/lib/inventory";

const MOVEMENT_TONE: Record<string, string> = {
  purchase: "border-moss/25 bg-moss-soft text-moss-ink",
  sale: "border-steel/20 bg-steel-soft text-steel-ink",
  transfer: "border-steel/20 bg-steel-soft text-steel-ink",
  loan_out: "border-rust/20 bg-rust-soft text-rust-ink",
  loan_in: "border-moss/25 bg-moss-soft text-moss-ink",
  return: "border-moss/25 bg-moss-soft text-moss-ink",
  adjustment: "border-citrus/35 bg-citrus-soft text-citrus-ink",
  count: "border-citrus/35 bg-citrus-soft text-citrus-ink",
};

export function MovementTypeBadge({ type }: Readonly<{ type: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-medium tracking-wide",
        MOVEMENT_TONE[type] ?? "border-line bg-surface text-ink-soft",
      )}
    >
      {movementTypeLabel(type)}
    </span>
  );
}

export function StockStatusBadge({ qty }: Readonly<{ qty: number }>) {
  const status = stockStatus(qty);

  if (status === "out") {
    return (
      <span className="inline-flex items-center rounded-sm border border-rust/20 bg-rust-soft px-1.5 py-px text-[10px] font-medium text-rust-ink">
        Sem estoque
      </span>
    );
  }

  if (status === "low") {
    return (
      <span className="inline-flex items-center rounded-sm border border-citrus/35 bg-citrus-soft px-1.5 py-px text-[10px] font-medium text-citrus-ink">
        Baixo
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-sm border border-moss/25 bg-moss-soft px-1.5 py-px text-[10px] font-medium text-moss-ink">
      OK
    </span>
  );
}

function locationChipTone(qty: number): string {
  if (qty <= 0) return "border-rust/15 bg-rust-soft/60 text-rust-ink";
  if (qty <= LOW_STOCK_THRESHOLD)
    return "border-citrus/30 bg-citrus-soft text-citrus-ink";
  return "border-line bg-surface text-ink-soft";
}

export function LocationStockChips({
  rows,
}: Readonly<{
  rows: StockLocationRow[] | undefined;
}>) {
  if (!rows || rows.length === 0) {
    return <span className="text-[12px] text-ink-soft">—</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {rows.map((row) => {
        const qty = Number(row.qty_on_hand);
        return (
          <span
            key={row.location}
            className={cn(
              "num inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[10.5px]",
              locationChipTone(qty),
            )}
          >
            <span className="font-medium">{row.location}</span>
            {formatDecimal(qty)}
          </span>
        );
      })}
    </span>
  );
}

export function StockValue({ value }: Readonly<{ value: number | null }>) {
  if (value === null || value === undefined) {
    return <span className="text-ink-soft">—</span>;
  }
  return <span>{formatMoney(value)}</span>;
}
