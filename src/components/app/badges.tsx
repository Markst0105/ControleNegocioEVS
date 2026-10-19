import { formatPercent } from "@/lib/format";

export function OriginBadge({ origin }: { origin: string | null }) {
  if (!origin) return <span className="text-ink-soft">—</span>;

  const isEvs = origin === "EVS";

  return (
    <span
      className={
        isEvs
          ? "num inline-flex items-center rounded-sm border border-moss/25 bg-moss-soft px-1.5 py-px text-[10px] font-medium tracking-wide text-moss-ink"
          : "num inline-flex items-center rounded-sm border border-steel/20 bg-steel-soft px-1.5 py-px text-[10px] font-medium tracking-wide text-steel-ink"
      }
    >
      {origin}
    </span>
  );
}

export function DealBadge({
  label,
  discountPct,
}: {
  label: string | null | undefined;
  discountPct?: number | null;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center rounded-sm border border-line bg-surface px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-ink-soft">
        {label ?? "—"}
      </span>
      {discountPct && discountPct > 0 ? (
        <span className="num inline-flex items-center rounded-sm bg-citrus-soft px-1.5 py-px text-[10px] font-medium text-citrus-ink">
          −{formatPercent(discountPct)}
        </span>
      ) : null}
    </span>
  );
}
