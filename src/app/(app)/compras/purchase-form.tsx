"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";

import { Combobox } from "@/components/app/combobox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  formatDecimalInput,
  formatMoney,
  parseMoneyInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import { createPurchase, type PurchaseFormState } from "./actions";

export type PurchaseFormData = {
  products: {
    id: string;
    name: string;
    sku: string;
    last_cost: number | null;
  }[];
  suppliers: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  locations: { code: string; label: string }[];
  today: string;
  initialProductId?: string;
};

type Line = {
  key: string;
  productId: string;
  qty: string;
  unitCost: string;
};

const initialState: PurchaseFormState = { error: null };

export function PurchaseForm({ data }: { data: PurchaseFormData }) {
  const [state, formAction, pending] = useActionState(
    createPurchase,
    initialState,
  );

  const nextKey = useRef(2);
  const [locationCode, setLocationCode] = useState(
    data.locations.find((location) => location.code === "CASA")?.code ??
      data.locations[0]?.code ??
      "CASA",
  );
  const [lines, setLines] = useState<Line[]>(() => {
    const initialProduct = data.products.find(
      (product) => product.id === data.initialProductId,
    );

    return [
      {
        key: "line-1",
        productId: data.initialProductId ?? "",
        qty: "1",
        unitCost:
          initialProduct?.last_cost == null
            ? ""
            : formatDecimalInput(initialProduct.last_cost),
      },
    ];
  });

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((previous) =>
      previous.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function handleProductChange(line: Line, productId: string) {
    const product = data.products.find((item) => item.id === productId);
    updateLine(line.key, {
      productId,
      unitCost:
        product?.last_cost == null
          ? ""
          : formatDecimalInput(product.last_cost),
    });
  }

  function addLine() {
    const key = `line-${nextKey.current}`;
    nextKey.current += 1;
    setLines((previous) => [
      ...previous,
      { key, productId: "", qty: "1", unitCost: "" },
    ]);
  }

  function removeLine(key: string) {
    setLines((previous) =>
      previous.length === 1
        ? previous
        : previous.filter((line) => line.key !== key),
    );
  }

  const productOptions = data.products.map((product) => ({
    value: product.id,
    label: product.name,
    search: product.sku,
    hint: product.sku,
  }));

  const supplierOptions = data.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
  }));

  const accountOptions = data.accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }));

  const total = lines.reduce((sum, line) => {
    const qty = parseMoneyInput(line.qty) ?? 0;
    const cost = parseMoneyInput(line.unitCost) ?? 0;
    return sum + qty * cost;
  }, 0);

  const itemsJson = JSON.stringify(
    lines.map((line) => ({
      product_id: line.productId,
      qty: line.qty,
      unit_cost: line.unitCost,
    })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="items" value={itemsJson} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data da compra" htmlFor="purchased-on">
          <Input
            id="purchased-on"
            type="date"
            name="purchased_on"
            defaultValue={data.today}
            required
            className="num h-10"
          />
        </Field>

        <Field label="Destino" htmlFor="location">
          <Select
            name="location_code"
            value={locationCode}
            onValueChange={setLocationCode}
          >
            <SelectTrigger id="location" className="h-10 w-full bg-surface">
              <SelectValue placeholder="Selecionar local" />
            </SelectTrigger>
            <SelectContent>
              {data.locations.map((location) => (
                <SelectItem key={location.code} value={location.code}>
                  {location.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Fornecedor"
          htmlFor="supplier"
          hint="Opcional — distribuidora, Herbalife ou outro."
        >
          <Combobox
            id="supplier"
            name="supplier_id"
            options={supplierOptions}
            placeholder="Sem fornecedor"
            searchPlaceholder="Buscar fornecedor…"
            emptyText="Nenhum fornecedor encontrado."
            allowClear
          />
        </Field>

        <Field
          label="Conta"
          htmlFor="account"
          hint="Opcional — de onde saiu o pagamento."
        >
          <Combobox
            id="account"
            name="account_id"
            options={accountOptions}
            placeholder="Sem conta"
            searchPlaceholder="Buscar conta…"
            emptyText="Nenhuma conta encontrada."
            allowClear
          />
        </Field>

        <Field
          label="Nota / referência"
          htmlFor="invoice"
          hint="Ex.: pedido Herbalife, número da nota."
        >
          <Input
            id="invoice"
            name="invoice_no"
            maxLength={80}
            placeholder="Opcional"
            className="h-10"
          />
        </Field>

        <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
          <Textarea
            id="notes"
            name="notes"
            maxLength={1000}
            rows={2}
            placeholder="Opcional"
            className="resize-y"
          />
        </Field>
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-serif text-[20px] leading-none font-normal">
              Produtos
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              Quantidade e custo unitário de cada item.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={addLine}
          >
            <Plus />
            Adicionar item
          </Button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {lines.map((line, index) => {
            const qty = parseMoneyInput(line.qty) ?? 0;
            const cost = parseMoneyInput(line.unitCost) ?? 0;

            return (
              <div
                key={line.key}
                className="grid gap-2 rounded-md border border-line/80 bg-paper p-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem_7rem_auto] sm:items-end"
              >
                <Field
                  label={`Produto ${index + 1}`}
                  htmlFor={`product-${line.key}`}
                  className="sm:col-span-1"
                >
                  <Combobox
                    id={`product-${line.key}`}
                    name={`product_${line.key}`}
                    options={productOptions}
                    placeholder="Selecionar produto"
                    searchPlaceholder="Buscar por nome ou SKU…"
                    emptyText="Nenhum produto encontrado."
                    defaultValue={line.productId}
                    onValueChange={(value) =>
                      handleProductChange(line, value)
                    }
                  />
                </Field>

                <Field label="Qtd." htmlFor={`qty-${line.key}`}>
                  <Input
                    id={`qty-${line.key}`}
                    inputMode="decimal"
                    value={line.qty}
                    onChange={(event) =>
                      updateLine(line.key, { qty: event.target.value })
                    }
                    placeholder="1"
                    className="num h-10 text-right"
                  />
                </Field>

                <Field label="Custo unit." htmlFor={`cost-${line.key}`}>
                  <Input
                    id={`cost-${line.key}`}
                    inputMode="decimal"
                    value={line.unitCost}
                    onChange={(event) =>
                      updateLine(line.key, { unitCost: event.target.value })
                    }
                    placeholder="0,00"
                    className="num h-10 text-right"
                  />
                </Field>

                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Total</span>
                  <span className="num flex h-10 items-center justify-end text-[14px] tabular-nums">
                    {formatMoney(qty * cost)}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 text-ink-soft hover:text-rust"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                  aria-label={`Remover produto ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
            <span className="text-ink-soft">Total da compra</span>
            <span className="num text-[16px] font-medium">
              {formatMoney(total)}
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/compras">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10 font-bold">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Registrando…
            </span>
          ) : (
            <>
              <Save />
              Registrar compra
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
