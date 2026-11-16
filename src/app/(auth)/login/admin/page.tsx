import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";

import { LoginForm } from "../login-form";

export const metadata: Metadata = {
  title: "Acesso administrativo",
};

export default function AdminLoginPage() {
  return (
    <AuthShell>
      <p className="text-[10.5px] font-medium tracking-[0.14em] text-ink-soft uppercase">
        Equipe
      </p>
      <h1 className="mt-1 font-serif text-[32px] leading-none font-normal tracking-[-0.01em]">
        Acesso administrativo
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Entre com o e-mail e a senha da equipe.
      </p>
      <div className="mt-6">
        <LoginForm />
      </div>

      <div className="mt-4 border-t border-line pt-3 text-center">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 text-[11.5px] text-ink-soft"
        >
          <Link href="/login">Voltar ao acesso do cliente</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
