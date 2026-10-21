"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";

import { Combobox } from "@/components/app/combobox";
import { PriceTierBadge } from "@/components/app/price-tier-badge";
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
import { formatMoney, formatMoneyInput, parseMoneyInput } from "@/lib/format";
import {
  PRICE_TIERS,
  priceTier,
  type PriceTierCode,
} from "@/lib/prices";
import { cn } from "@/lib/utils";

import { createPurchase, type PurchaseFormState } from "./actions";

export type PurchaseFormData = {
  products: {
    id: string;
    name: string;
    sku: string;
    last_cost: number | null;
    retail_price: number | null;
    price_25: number | null;
    price_35: number | null;
    price_42: number | null;
    price_50: number | null;
    price_bronze: number | null;
    price_prata: number | null;
    price_ouro: number | null;
  }[];
  suppliers: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  locations: { code: string; label: string }[];
  today: string;
  initialProductId?: string;
  initialSupplierId?: string;
};

type PurchaseTier = PriceTierCode | "custom";

type Line = {
  key: string;
  productId: string;
  tierCode: PurchaseTier;
  qty: string;
  unitCost: string;
};

type PurchaseProduct = PurchaseFormData["products"][number];

const initialState: PurchaseFormState = { error: null };

function priceFor(product: PurchaseProduct | undefined, code: PurchaseTier) {
  if (!product || code === "custom") return null;
  const tier = priceTier(code);
  if (!tier) return null;
  return product[tier.column];
}

function defaultTierFor(product: PurchaseProduct | undefined): PurchaseTier {
  if (!product) return "custom";
  if (product.price_ouro != null) return "ouro";

  const firstPriced = PRICE_TIERS.find(
    (tier) => product[tier.column] != null,
  );
  return firstPriced?.code ?? "custom";
}

function initialCostFor(
  product: PurchaseProduct | undefined,
  tierCode: PurchaseTier,
) {
  const tierPrice = priceFor(product, tierCode);
  if (tierPrice != null) return formatMoneyInput(tierPrice);
  if (product?.last_cost != null) return formatMoneyInput(product.last_cost);
  return "";
}

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
    const tierCode = defaultTierFor(initialProduct);

    return [
      {
        key: "line-1",
        productId: data.initialProductId ?? "",
        tierCode,
        qty: "1",
        unitCost: initialCostFor(initialProduct, tierCode),
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
    const tierCode = defaultTierFor(product);
    updateLine(line.key, {
      productId,
      tierCode,
      unitCost: initialCostFor(product, tierCode),
    });
  }

  function handleTierChange(line: Line, tierCode: PurchaseTier) {
    const product = data.products.find(
      (item) => item.id === line.productId,
    );
    const tierPrice = priceFor(product, tierCode);

    updateLine(line.key, {
      tierCode,
      unitCost:
        tierPrice == null ? line.unitCost : formatMoneyInput(tierPrice),
    });
  }

  function handleCostChange(line: Line, unitCost: string) {
    updateLine(line.key, { unitCost, tierCode: "custom" });
  }

  function addLine() {
    const key = `line-${nextKey.current}`;
    nextKey.current += 1;
    setLines((previous) => [
      ...previous,
      {
        key,
        productId: "",
        tierCode: "custom",
        qty: "1",
        unitCost: "",
      },
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
    search: `${product.name} ${product.sku}`,
    hint:
      product.price_ouro != null
        ? `Ouro ${formatMoney(product.price_ouro)}`
        : product.sku,
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
      price_tier: line.tierCode === "custom" ? null : line.tierCode,
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

      <div className="grid gap-5 sm:grid-cols-2">
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
          hint={
            <>
              Opcional — distribuidora, Herbalife ou outro.{" "}
              <Link
                href="/fornecedores"
                className="underline underline-offset-2 hover:text-ink"
              >
                Gerenciar fornecedores
              </Link>
            </>
          }
        >
          <Combobox
            id="supplier"
            name="supplier_id"
            options={supplierOptions}
            placeholder="Sem fornecedor"
            searchPlaceholder="Buscar fornecedor…"
            emptyText="Nenhum fornecedor encontrado."
            defaultValue={data.initialSupplierId}
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
              Escolha a faixa para preencher o custo; edite o custo para manual.
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

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {lines.map((line, index) => {
            const qty = parseMoneyInput(line.qty) ?? 0;
            const cost = parseMoneyInput(line.unitCost) ?? 0;
            const product = data.products.find(
              (item) => item.id === line.productId,
            );
            const selectedTier =
              line.tierCode === "custom" ? null : priceTier(line.tierCode);
            const selectedPrice = priceFor(product, line.tierCode);

            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-md border border-line/80 bg-paper p-3 sm:grid-cols-2 sm:items-end sm:p-4 xl:grid-cols-[minmax(0,1fr)_11rem_5.5rem_7rem_7rem_auto]"
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

                <Field label="Faixa" htmlFor={`tier-${line.key}`}>
                  <Select
                    value={line.tierCode}
                    onValueChange={(value) =>
                      handleTierChange(line, value as PurchaseTier)
                    }
                  >
                    <SelectTrigger
                      id={`tier-${line.key}`}
                      className="h-10 w-full min-w-0 overflow-hidden bg-surface"
                    >
                      <SelectValue
                        placeholder="Faixa"
                        className="min-w-0 flex-1"
                      >
                        {selectedTier ? (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <PriceTierBadge code={selectedTier.code} />
                            <span className="num truncate text-[10.5px] text-ink-soft">
                              {selectedPrice == null
                                ? "—"
                                : formatMoney(selectedPrice)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-soft">Manual</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-[12rem]">
                      {PRICE_TIERS.map((tier) => {
                        const tierPrice = product?.[tier.column] ?? null;
                        return (
                          <SelectItem
                            key={tier.code}
                            value={tier.code}
                            disabled={tierPrice == null}
                          >
                            <span className="flex w-full items-center justify-between gap-3">
                              <PriceTierBadge code={tier.code} />
                              <span
                                className={cn(
                                  "num text-[11px]",
                                  tierPrice == null
                                    ? "text-ink-soft/50"
                                    : "text-ink-soft",
                                )}
                              >
                                {tierPrice == null
                                  ? "—"
                                  : formatMoney(tierPrice)}
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                      <SelectItem value="custom">Manual</SelectItem>
                    </SelectContent>
                  </Select>
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
                      handleCostChange(line, event.target.value)
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
  hint?: React.ReactNode;
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
