import type { ReactNode } from "react";

import { Brand } from "@/components/app/brand";

/**
 * Shared frame for the login, admin login and registration cards. Keeps the
 * auth pages visually identical while their forms differ.
 */
export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Brand subtitle={false} />
        </div>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-xs">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-ink-soft">
          EVS Mooca + Casa
        </p>
      </div>
    </main>
  );
}
