import { Leaf } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  tone = "solid",
}: {
  className?: string;
  tone?: "solid" | "paper";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
        tone === "paper"
          ? "bg-paper text-moss-ink"
          : "bg-moss text-[#f6f9f2]",
        className,
      )}
    >
      <Leaf size={15} strokeWidth={2} />
    </span>
  );
}

export function Brand({
  subtitle = true,
  tone = "light",
  showMark = true,
  className,
}: {
  subtitle?: boolean;
  tone?: "light" | "dark";
  showMark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {showMark ? <BrandMark tone={tone === "dark" ? "paper" : "solid"} /> : null}
      <div className="min-w-0 leading-tight">
        <div
          className={cn(
            "truncate font-display text-[15px] font-semibold tracking-[-0.02em]",
            tone === "dark" ? "text-paper" : "text-ink",
          )}
        >
          Controle de Negócio
        </div>
        {subtitle ? (
          <div
            className={cn(
              "truncate text-[11px]",
              tone === "dark" ? "text-paper/70" : "text-ink-soft",
            )}
          >
            EVS Mooca + Casa
          </div>
        ) : null}
      </div>
    </div>
  );
}
