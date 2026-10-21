import { expenseScopeLabel } from "@/lib/expenses";
import { cn } from "@/lib/utils";

const SCOPE_CLASS: Record<string, string> = {
  negocio_fixo: "border-moss/25 bg-moss-soft text-moss-ink",
  negocio_variavel: "border-citrus/40 bg-citrus-soft text-citrus-ink",
  pessoal: "border-rust/20 bg-rust-soft text-rust-ink",
};

export function ExpenseScopeBadge({
  scope,
  full = false,
}: {
  scope: string | null | undefined;
  full?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-medium tracking-wide whitespace-nowrap",
        SCOPE_CLASS[scope ?? ""] ??
          "border-line bg-surface text-ink-soft",
      )}
    >
      {expenseScopeLabel(scope, !full)}
    </span>
  );
}
