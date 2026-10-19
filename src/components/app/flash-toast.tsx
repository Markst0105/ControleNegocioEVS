"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/** Mostra um toast quando ?ok=1 está na URL e limpa o parâmetro. */
export function FlashToast({ message }: { message: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!searchParams.get("ok")) return;

    toast.success(message);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("ok");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [message, pathname, router, searchParams]);

  return null;
}
