import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-[32px] leading-[1.02] font-normal tracking-[-0.01em] sm:text-[36px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[13px] text-ink-soft">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
