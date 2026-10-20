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
  SUPPLIER_ROLE_OPTIONS,
  isSupplierRole,
  type SupplierRole,
} from "@/lib/suppliers";
import { cn } from "@/lib/utils";

import {
  createSupplier,
  updateSupplier,
  type SupplierFormState,
} from "./actions";

export type SupplierFormInitial = {
  id: string;
  name: string;
  role_hint: string | null;
  active: boolean | null;
};

const initialState: SupplierFormState = { error: null };

export function SupplierForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: SupplierFormInitial;
}) {
  const action = mode === "edit" ? updateSupplier : createSupplier;
  const [state, formAction, pending] = useActionState(action, initialState);

  const initialRole = initial?.role_hint;
  const [name, setName] = useState(initial?.name ?? "");
  const [roleHint, setRoleHint] = useState<SupplierRole>(
    isSupplierRole(initialRole) ? initialRole : "supplier",
  );
  const [active, setActive] = useState(initial?.active ?? true);

  const cancelHref =
    mode === "edit" && initial
      ? `/fornecedores/${initial.id}`
      : "/fornecedores";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {mode === "edit" && initial ? (
        <input type="hidden" name="supplier_id" value={initial.id} />
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
          label="Nome"
          htmlFor="name"
          className="sm:col-span-2"
          hint="Como o fornecedor aparece nas compras e movimentações."
        >
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            autoComplete="organization"
            placeholder="Nome do fornecedor"
            required
            className="h-10"
          />
        </Field>

        <Field
          label="Tipo"
          htmlFor="role-hint"
          hint="Ajuda a organizar fornecedores e distribuidoras."
        >
          <Select
            name="role_hint"
            value={roleHint}
            onValueChange={(value) => setRoleHint(value as SupplierRole)}
          >
            <SelectTrigger id="role-hint" className="h-10 w-full bg-surface">
              <SelectValue placeholder="Selecionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {SUPPLIER_ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid content-start gap-2">
          <span className="text-sm font-medium">Situação</span>
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm">
            <input
              type="checkbox"
              name="active"
              value="1"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="size-4 accent-moss"
            />
            Fornecedor ativo
          </label>
          <p className="text-[11px] text-ink-soft">
            Inativos continuam no histórico, mas não aparecem em novas compras.
          </p>
        </div>
      </div>

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
              {mode === "edit" ? "Salvar fornecedor" : "Cadastrar fornecedor"}
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
