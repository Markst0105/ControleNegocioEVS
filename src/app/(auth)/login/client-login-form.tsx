"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
} from "@/lib/client-auth";

import { signInWithPin, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function ClientLoginForm() {
  const [state, formAction, pending] = useActionState(
    signInWithPin,
    initialState,
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="identifier">Nome completo ou e-mail</Label>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            placeholder="Como você se cadastrou"
            required
            autoFocus
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
            autoComplete="current-password"
            placeholder={`${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} números`}
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
              Entrando…
            </span>
          ) : (
            "Entrar"
          )}
        </Button>
      </form>

      <Button asChild variant="outline" className="h-10 w-full">
        <Link href="/cadastro">Criar conta</Link>
      </Button>

      <div className="border-t border-line pt-3 text-center">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 text-[11.5px] text-ink-soft"
        >
          <Link href="/login/admin">Acesso administrativo</Link>
        </Button>
      </div>
    </div>
  );
}
