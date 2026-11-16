import type { Metadata } from "next";

import { AuthShell } from "@/components/app/auth-shell";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function CadastroPage() {
  return (
    <AuthShell>
      <h1 className="font-serif text-[32px] leading-none font-normal tracking-[-0.01em]">
        Criar conta
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Cadastre-se para comprar e acompanhar seus créditos.
      </p>
      <div className="mt-6">
        <SignupForm />
      </div>
    </AuthShell>
  );
}
