"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid place-items-center py-24">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-[30px] leading-none font-normal tracking-[-0.01em]">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Não foi possível carregar esta página. Tente de novo; se persistir,
          avise o administrador.
        </p>
        <Button onClick={reset} className="mt-6">
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
