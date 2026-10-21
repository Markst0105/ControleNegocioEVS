"use client";

import {
  useActionState,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";

import { Combobox } from "@/components/app/combobox";
import { PriceTierBadge } from "@/components/app/price-tier-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, parseMoneyInput } from "@/lib/format";
import { priceTier } from "@/lib/prices";
import { cn } from "@/lib/utils";

import {
  createReservation,
  type ReservationFormState,
} from "@/lib/actions/reservations";

export type ReservationFormProduct = {
  id: string;
  name: string;
  sku: string;
  pv: number | null;
  retail_price: number | null;
  member_price?: number | null;
  member_tier_code?: string | null;
  price_25?: number | null;
  price_35?: number | null;
  price_42?: number | null;
  price_50?: number | null;
  price_bronze?: number | null;
  price_prata?: number | null;
  price_ouro?: number | null;
};

export type ReservationFormMember = {
  id: string;
  name: string;
  price_tier: string | null;
};

type ReservationLine = {
  key: string;
  productId: string;
  qty: string;
};

const initialState: ReservationFormState = { error: null };

function unitPriceFor(
  product: ReservationFormProduct | undefined,
  member: ReservationFormMember | undefined,
  mode: "operator" | "member",
): number | null {
  if (!product) return null;

  if (mode === "member") {
    return product.member_price ?? product.retail_price;
  }

  const tier = priceTier(member?.price_tier);
  if (tier) {
    const value = product[tier.column];
    if (value != null) return value;
  }

  return product.retail_price ?? product.member_price ?? null;
}

export function ReservationForm({
  mode,
  products,
  members,
  initialProductId,
  initialMemberId,
}: {
  mode: "operator" | "member";
  products: ReservationFormProduct[];
  members: ReservationFormMember[];
  initialProductId?: string;
  initialMemberId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createReservation,
    initialState,
  );

  const nextKey = useRef(2);
  const [memberId, setMemberId] = useState(initialMemberId ?? "");
  const [lines, setLines] = useState<ReservationLine[]>(() => [
    {
      key: "line-1",
      productId: initialProductId ?? "",
      qty: "1",
    },
  ]);

  const selectedMember = members.find((member) => member.id === memberId);
  const memberTier = priceTier(selectedMember?.price_tier);
  const fallbackTier =
    mode === "member"
      ? priceTier(products.find((product) => product.member_tier_code)?.member_tier_code)
      : null;

  function updateLine(key: string, patch: Partial<ReservationLine>) {
    setLines((previous) =>
      previous.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    const key = `line-${nextKey.current}`;
    nextKey.current += 1;
    setLines((previous) => [
      ...previous,
      { key, productId: "", qty: "1" },
    ]);
  }

  function removeLine(key: string) {
    setLines((previous) =>
      previous.length === 1
        ? previous
        : previous.filter((line) => line.key !== key),
    );
  }

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        search: `${product.name} ${product.sku}`,
        hint:
          unitPriceFor(product, selectedMember, mode) != null
            ? formatMoney(unitPriceFor(product, selectedMember, mode))
            : product.sku,
      })),
    [mode, products, selectedMember],
  );

  const memberOptions = members.map((member) => ({
    value: member.id,
    label: member.name,
    hint: priceTier(member.price_tier)?.label ?? "Cliente",
  }));

  const totals = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const qty = parseMoneyInput(line.qty) ?? 0;
    const price = unitPriceFor(product, selectedMember, mode) ?? 0;
    return { price, total: qty * price };
  });

  const total = totals.reduce((sum, row) => sum + row.total, 0);
  const itemsJson = JSON.stringify(
    lines.map((line) => ({
      product_id: line.productId,
      qty: line.qty,
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
        {mode === "operator" ? (
          <Field
            label="Membro"
            htmlFor="reservation-member"
            hint="O preço de cada item segue a faixa do membro."
            className="sm:col-span-2"
          >
            <Combobox
              id="reservation-member"
              name="member_id"
              options={memberOptions}
              placeholder="Selecionar membro"
              searchPlaceholder="Buscar membro…"
              emptyText="Nenhum membro cadastrado."
              defaultValue={memberId}
              onValueChange={setMemberId}
            />
          </Field>
        ) : (
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Membro</span>
            <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 text-[13px]">
              <span className="truncate">
                {members[0]?.name ?? "Sua conta"}
              </span>
              {fallbackTier ? <PriceTierBadge code={fallbackTier.code} /> : null}
            </div>
            <p className="text-[11px] text-ink-soft">
              O preço da sua faixa é aplicado automaticamente.
            </p>
          </div>
        )}

        {mode === "operator" && memberTier ? (
          <div className="sm:col-span-2 -mt-2 flex items-center gap-2 text-[11.5px] text-ink-soft">
            <span>Faixa de preço do membro:</span>
            <PriceTierBadge code={memberTier.code} />
          </div>
        ) : null}
      </div>

      <section className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-serif text-[20px] leading-none font-normal">
              Produtos
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              Escolha os itens e as quantidades. O preço vem da tabela.
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
            const product = products.find(
              (item) => item.id === line.productId,
            );
            const price = unitPriceFor(product, selectedMember, mode);

            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-md border border-line/80 bg-paper p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto] sm:items-end sm:p-4"
              >
                <Field
                  label={`Produto ${index + 1}`}
                  htmlFor={`reservation-product-${line.key}`}
                >
                  <Combobox
                    id={`reservation-product-${line.key}`}
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

                <Field label="Qtd." htmlFor={`reservation-qty-${line.key}`}>
                  <Input
                    id={`reservation-qty-${line.key}`}
                    inputMode="decimal"
                    value={line.qty}
                    onChange={(event) =>
                      updateLine(line.key, { qty: event.target.value })
                    }
                    placeholder="1"
                    className="num h-10 text-right"
                  />
                </Field>

                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Preço / total</span>
                  <span className="num flex h-10 flex-col justify-center text-right text-[12px] leading-tight">
                    <span>{formatMoney(price)}</span>
                    <span className="text-[10.5px] text-ink-soft">
                      {formatMoney(
                        (parseMoneyInput(line.qty) ?? 0) * (price ?? 0),
                      )}
                    </span>
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
            <span className="text-ink-soft">Total da reserva</span>
            <span className="num text-[16px] font-medium">
              {formatMoney(total)}
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={mode === "member" ? "/membro" : "/reservas"}>
            Cancelar
          </Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10 font-bold">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Criando…
            </span>
          ) : (
            <>
              <Save />
              Criar reserva
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
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
