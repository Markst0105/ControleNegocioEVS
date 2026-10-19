import type { Metadata } from "next";

import { Brand } from "@/components/app/brand";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Brand />
        </div>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-xs">
          <h1 className="text-lg font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm text-ink-soft">Acesso restrito à equipe.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-soft">
          Controle do Negócio · EVS Mooca + Casa
        </p>
      </div>
    </main>
  );
}
