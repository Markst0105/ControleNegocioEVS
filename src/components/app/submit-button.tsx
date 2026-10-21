"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & {
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel ?? "Salvando…"}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
