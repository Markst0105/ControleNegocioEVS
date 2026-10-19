import { Leaf } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md bg-moss text-[#f6f9f2]",
        className,
      )}
    >
      <Leaf size={15} strokeWidth={2} />
    </span>
  );
}

export function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">BioAvalia</div>
        {subtitle ? (
          <div className="text-[11px] text-ink-soft">EVS Mooca + Casa</div>
        ) : null}
      </div>
    </div>
  );
}
