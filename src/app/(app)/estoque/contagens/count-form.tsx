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
import { formatDecimal, parseMoneyInput } from "@/lib/format";
import { cn } from "@/lib/utils";

import { createStockCount, type CountFormState } from "./actions";

export type CountFormData = {
  products: { id: string; name: string; sku: string }[];
  locations: { code: string; label: string }[];
  stockByLocation: Record<string, Record<string, number>>;
  today: string;
};

type Line = {
  key: string;
  productId: string;
  counted: string;
};

const initialState: CountFormState = { error: null };

export function CountForm({ data }: { data: CountFormData }) {
  const [state, formAction, pending] = useActionState(
    createStockCount,
    initialState,
  );

  const nextKey = useRef(2);
  const [locationCode, setLocationCode] = useState(
    data.locations.find((location) => location.code === "EVS")?.code ??
      data.locations[0]?.code ??
      "EVS",
  );
  const [lines, setLines] = useState<Line[]>([
    { key: "line-1", productId: "", counted: "" },
  ]);

  const productOptions = data.products.map((product) => ({
    value: product.id,
    label: product.name,
    search: product.sku,
    hint: product.sku,
  }));

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((previous) =>
      previous.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    const key = `line-${nextKey.current}`;
    nextKey.current += 1;
    setLines((previous) => [
      ...previous,
      { key, productId: "", counted: "" },
    ]);
  }

  function removeLine(key: string) {
    setLines((previous) =>
      previous.length === 1
        ? previous
        : previous.filter((line) => line.key !== key),
    );
  }

  const itemsJson = JSON.stringify(
    lines.map((line) => ({
      product_id: line.productId,
      counted_qty: line.counted,
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
        <Field label="Data da contagem" htmlFor="counted-on">
          <Input
            id="counted-on"
            type="date"
            name="counted_on"
            defaultValue={data.today}
            required
            className="num h-10"
          />
        </Field>

        <Field label="Local" htmlFor="count-location">
          <Select
            name="location_code"
            value={locationCode}
            onValueChange={setLocationCode}
          >
            <SelectTrigger id="count-location" className="h-10 w-full bg-surface">
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
          label="Observações"
          htmlFor="count-notes"
          className="sm:col-span-2"
        >
          <Textarea
            id="count-notes"
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
              Produtos contados
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              O saldo do sistema é comparado com a quantidade física.
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
            Adicionar produto
          </Button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {lines.map((line, index) => {
            const expected =
              data.stockByLocation[line.productId]?.[locationCode] ?? 0;
            const counted = parseMoneyInput(line.counted);
            const diff = counted === null ? null : counted - expected;

            return (
              <div
                key={line.key}
                className="grid gap-2 rounded-md border border-line/80 bg-paper p-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:items-end"
              >
                <Field
                  label={`Produto ${index + 1}`}
                  htmlFor={`count-product-${line.key}`}
                >
                  <Combobox
                    id={`count-product-${line.key}`}
                    name={`product_${line.key}`}
                    options={productOptions}
                    placeholder="Selecionar produto"
                    searchPlaceholder="Buscar por nome ou SKU…"
                    emptyText="Nenhum produto encontrado."
                    defaultValue={line.productId}
                    onValueChange={(value) =>
                      updateLine(line.key, { productId: value })
                    }
                  />
                </Field>

                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">No sistema</span>
                  <span className="num flex h-10 items-center justify-end text-[13px] text-ink-soft">
                    {formatDecimal(expected)}
                  </span>
                </div>

                <Field label="Contado" htmlFor={`counted-${line.key}`}>
                  <Input
                    id={`counted-${line.key}`}
                    inputMode="decimal"
                    value={line.counted}
                    onChange={(event) =>
                      updateLine(line.key, { counted: event.target.value })
                    }
                    placeholder="0,00"
                    className="num h-10 text-right"
                  />
                </Field>

                <div className="flex items-center gap-2 sm:pb-0.5">
                  <span
                    className={cn(
                      "num min-w-16 text-right text-[12px]",
                      diff === null
                        ? "text-ink-soft"
                        : diff === 0
                          ? "text-ink-soft"
                          : diff > 0
                            ? "text-moss-ink"
                            : "text-rust-ink",
                    )}
                  >
                    {diff === null
                      ? "—"
                      : `${diff > 0 ? "+" : ""}${formatDecimal(diff)}`}
                  </span>
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
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/estoque/contagens">Cancelar</Link>
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
              Registrar contagem
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
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
