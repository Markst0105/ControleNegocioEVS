import type { Metadata } from "next";

import { AuthShell } from "@/components/app/auth-shell";

import { ClientLoginForm } from "./client-login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="font-serif text-[32px] leading-none font-normal tracking-[-0.01em]">
        Entrar
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Acesse seus créditos com nome ou e-mail e PIN.
      </p>
      <div className="mt-6">
        <ClientLoginForm />
      </div>
    </AuthShell>
  );
}
