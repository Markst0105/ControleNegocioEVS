"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXPENSE_SCOPE_OPTIONS,
  isExpenseScope,
  type ExpenseScope,
} from "@/lib/expenses";
import { formatMoneyInput } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  createExpense,
  updateExpense,
  type ExpenseFormState,
} from "./actions";

export type ExpenseCategoryOption = {
  id: string;
  name: string;
  scope: string;
  active: boolean | null;
};

export type ExpenseAccountOption = {
  id: string;
  name: string;
  active: boolean | null;
};

export type ExpenseFormInitial = {
  id: string;
  incurred_on: string;
  description: string;
  amount: number;
  scope: string | null;
  category_id: string | null;
  account_id: string | null;
};

const initialState: ExpenseFormState = { error: null };

export function ExpenseForm({
  mode,
  initial,
  defaultDate,
  cancelHref,
  categories,
  accounts,
  canUsePersonal,
}: {
  mode: "create" | "edit";
  initial?: ExpenseFormInitial;
  defaultDate: string;
  cancelHref: string;
  categories: ExpenseCategoryOption[];
  accounts: ExpenseAccountOption[];
  canUsePersonal: boolean;
}) {
  const action = mode === "edit" ? updateExpense : createExpense;
  const [state, formAction, pending] = useActionState(action, initialState);

  const scopeOptions = EXPENSE_SCOPE_OPTIONS.filter(
    (option) => canUsePersonal || option.value !== "pessoal",
  );

  const initialScope = initial?.scope;
  const [incurredOn, setIncurredOn] = useState(
    initial?.incurred_on ?? defaultDate,
  );
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [accountId, setAccountId] = useState(initial?.account_id ?? "");
  const [scope, setScope] = useState<ExpenseScope>(
    isExpenseScope(initialScope) &&
      (canUsePersonal || initialScope !== "pessoal")
      ? initialScope
      : "negocio_variavel",
  );

  const visibleCategories = categories.filter(
    (category) =>
      category.active !== false || category.id === initial?.category_id,
  );
  const visibleAccounts = accounts.filter(
    (account) => account.active !== false || account.id === initial?.account_id,
  );

  function handleCategoryChange(value: string) {
    const nextId = value === "none" ? "" : value;
    setCategoryId(nextId);
    const category = categories.find((option) => option.id === nextId);
    if (!category || !isExpenseScope(category.scope)) return;
    if (category.scope === "pessoal" && !canUsePersonal) {
      setScope("negocio_variavel");
      return;
    }
    setScope(category.scope);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {mode === "edit" && initial ? (
        <input type="hidden" name="expense_id" value={initial.id} />
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Data"
          htmlFor="incurred_on"
          hint="Quando a despesa aconteceu."
        >
          <Input
            id="incurred_on"
            name="incurred_on"
            type="date"
            value={incurredOn}
            onChange={(event) => setIncurredOn(event.target.value)}
            required
            className="num h-10"
          />
        </Field>

        <Field
          label="Valor"
          htmlFor="amount"
          hint="Use vírgula para centavos. Valores negativos viram créditos."
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={
              initial ? formatMoneyInput(initial.amount) : undefined
            }
            placeholder="0,00"
            required
            className="num h-10"
          />
        </Field>

        <Field
          label="Descrição"
          htmlFor="description"
          className="sm:col-span-2"
          hint="Ex.: aluguel do EVS, insumos do mês, escola."
        >
          <Input
            id="description"
            name="description"
            defaultValue={initial?.description ?? ""}
            maxLength={160}
            placeholder="O que foi pago"
            required
            className="h-10"
          />
        </Field>

        <Field
          label="Categoria"
          htmlFor="category_id"
          hint="Ajuda a separar o resultado por tipo de gasto."
        >
          <Select
            name="category_id"
            value={categoryId || "none"}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger id="category_id" className="h-10 w-full bg-surface">
              <SelectValue placeholder="Sem categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem categoria</SelectItem>
              {visibleCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                  {category.active === false ? " (inativa)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Conta"
          htmlFor="account_id"
          hint="De onde saiu o pagamento."
        >
          <Select
            name="account_id"
            value={accountId || "none"}
            onValueChange={(value) =>
              setAccountId(value === "none" ? "" : value)
            }
          >
            <SelectTrigger id="account_id" className="h-10 w-full bg-surface">
              <SelectValue placeholder="Sem conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem conta</SelectItem>
              {visibleAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                  {account.active === false ? " (inativa)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Tipo de despesa</legend>
        <div
          className={cn(
            "grid gap-2",
            scopeOptions.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {scopeOptions.map((option) => {
            const checked = scope === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors",
                  checked
                    ? "border-moss/40 bg-moss-soft/60"
                    : "border-line bg-surface hover:bg-moss-soft/25",
                )}
              >
                <input
                  type="radio"
                  name="scope"
                  value={option.value}
                  checked={checked}
                  onChange={() => setScope(option.value)}
                  className="mt-0.5 size-3.5 accent-moss"
                />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-soft">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {scope === "pessoal" ? (
          <p className="text-[11px] text-ink-soft">
            Despesas pessoais ficam fora do resultado do negócio.
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancelar</Link>
        </Button>
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
              {mode === "edit" ? "Salvar despesa" : "Lançar despesa"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
