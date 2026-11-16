"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@/lib/client-auth";

import { registerClient, type SignupState } from "./actions";

const initialState: SignupState = { error: null, message: null };

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    registerClient,
    initialState,
  );

  if (state.message) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md border border-moss/25 bg-moss-soft px-3 py-2 text-sm text-moss-ink">
          {state.message}
        </p>
        <Button asChild className="h-10 w-full">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="full_name">Nome completo</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome completo"
          required
          autoFocus
          disabled={pending}
          className="h-10"
        />
        <p className="text-[11px] text-ink-soft">
          Você também pode entrar com este nome.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
          disabled={pending}
          className="h-10"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
          autoComplete="new-password"
          placeholder={`${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} números`}
          required
          disabled={pending}
          className="num h-10 tracking-[0.35em]"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pin_confirm">Repita o PIN</Label>
        <Input
          id="pin_confirm"
          name="pin_confirm"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
          autoComplete="new-password"
          placeholder="Repita o PIN"
          required
          disabled={pending}
          className="num h-10 tracking-[0.35em]"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full transition-transform motion-safe:active:scale-[0.98]"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Criando conta…
          </span>
        ) : (
          "Criar conta"
        )}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11.5px]">
        <Link
          href="/login"
          className="text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Já tem conta? Entrar
        </Link>
        <Link
          href="/login/admin"
          className="text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Acesso administrativo
        </Link>
      </div>
    </form>
  );
}
