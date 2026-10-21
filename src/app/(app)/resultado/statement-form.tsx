"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDecimalInput, formatMoneyInput } from "@/lib/format";

import {
  saveHerbalifeStatement,
  type StatementFormState,
} from "./actions";

export type StatementInitial = {
  royalty_usd: number | null;
  royalty_fx: number | null;
  bonus_usd: number | null;
  bonus_fx: number | null;
};

const initialState: StatementFormState = { error: null };

export function StatementForm({
  month,
  initial,
}: {
  month: string;
  initial: StatementInitial | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveHerbalifeStatement,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="month" value={`${month}-01`} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatementField
          label="Royalties (US$)"
          htmlFor="royalty_usd"
          hint="Valor em dólar do extrato."
        >
          <Input
            id="royalty_usd"
            name="royalty_usd"
            inputMode="decimal"
            defaultValue={
              initial?.royalty_usd != null
                ? formatMoneyInput(initial.royalty_usd)
                : undefined
            }
            placeholder="0,00"
            className="num h-10"
          />
        </StatementField>

        <StatementField
          label="Câmbio dos royalties"
          htmlFor="royalty_fx"
          hint="Reais por dólar no mês."
        >
          <Input
            id="royalty_fx"
            name="royalty_fx"
            inputMode="decimal"
            defaultValue={
              initial?.royalty_fx != null
                ? formatDecimalInput(initial.royalty_fx)
                : undefined
            }
            placeholder="0,0000"
            className="num h-10"
          />
        </StatementField>

        <StatementField
          label="Bônus (US$)"
          htmlFor="bonus_usd"
          hint="Valor em dólar do extrato."
        >
          <Input
            id="bonus_usd"
            name="bonus_usd"
            inputMode="decimal"
            defaultValue={
              initial?.bonus_usd != null
                ? formatMoneyInput(initial.bonus_usd)
                : undefined
            }
            placeholder="0,00"
            className="num h-10"
          />
        </StatementField>

        <StatementField
          label="Câmbio do bônus"
          htmlFor="bonus_fx"
          hint="Reais por dólar no mês."
        >
          <Input
            id="bonus_fx"
            name="bonus_fx"
            inputMode="decimal"
            defaultValue={
              initial?.bonus_fx != null
                ? formatDecimalInput(initial.bonus_fx)
                : undefined
            }
            placeholder="0,0000"
            className="num h-10"
          />
        </StatementField>
      </div>

      <p className="text-[11px] text-ink-soft">
        Os valores em dólar entram no resultado convertidos pelo câmbio
        informado. Deixe royalties e bônus em branco para remover o extrato do
        mês.
      </p>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Salvando…
            </span>
          ) : (
            <>
              <Save />
              {initial ? "Atualizar extrato" : "Salvar extrato"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function StatementField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
