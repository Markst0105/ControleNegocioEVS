import { priceTier } from "@/lib/prices";
import { cn } from "@/lib/utils";

const TIER_TONE: Record<string, string> = {
  retail: "border-line bg-surface text-ink-soft",
  "t0.25": "border-steel/20 bg-steel-soft text-steel-ink",
  "t0.35": "border-steel/20 bg-steel-soft text-steel-ink",
  "t0.42": "border-steel/20 bg-steel-soft text-steel-ink",
  "t0.5": "border-steel/20 bg-steel-soft text-steel-ink",
  bronze: "border-citrus/35 bg-citrus-soft text-citrus-ink",
  prata: "border-line bg-paper text-ink-soft",
  ouro: "border-moss/25 bg-moss-soft text-moss-ink",
};

export function PriceTierBadge({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const tier = priceTier(code);
  if (!tier) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[9.5px] font-medium whitespace-nowrap",
        TIER_TONE[tier.code] ?? "border-line bg-surface text-ink-soft",
        className,
      )}
      title={`Faixa de preço: ${tier.buyingLabel}`}
    >
      {tier.buyingLabel}
    </span>
  );
}
