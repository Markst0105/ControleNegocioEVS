"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";

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
  MANUAL_MOVEMENT_LABELS,
  MANUAL_MOVEMENT_TYPES,
  type ManualMovementType,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

import { recordMovement, type MovementFormState } from "./actions";

export type MovementFormData = {
  products: { id: string; name: string; sku: string }[];
  locations: { code: string; label: string }[];
  counterparties: { id: string; name: string }[];
  today: string;
  initialProductId?: string;
};

const initialState: MovementFormState = { error: null };

export function MovementForm({ data }: { data: MovementFormData }) {
  const [state, formAction, pending] = useActionState(
    recordMovement,
    initialState,
  );

  const initialFrom =
    data.locations.find((location) => location.code === "EVS")?.code ??
    data.locations[0]?.code ??
    "EVS";
  const initialTo =
    data.locations.find((location) => location.code === "CASA")?.code ??
    data.locations[1]?.code ??
    "CASA";

  const [type, setType] = useState<ManualMovementType>("transfer");
  const [productId, setProductId] = useState(data.initialProductId ?? "");
  const [locationFrom, setLocationFrom] = useState(initialFrom);
  const [locationTo, setLocationTo] = useState(initialTo);
  const [adjustmentLocation, setAdjustmentLocation] = useState(initialFrom);
  const [adjustmentDirection, setAdjustmentDirection] = useState<"in" | "out">(
    "out",
  );
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");

  const effectiveFrom =
    type === "transfer" || type === "loan_out"
      ? locationFrom
      : type === "adjustment" && adjustmentDirection === "out"
        ? adjustmentLocation
        : "";

  const effectiveTo =
    type === "transfer" || type === "loan_in" || type === "return"
      ? locationTo
      : type === "adjustment" && adjustmentDirection === "in"
        ? adjustmentLocation
        : "";

  const productOptions = data.products.map((product) => ({
    value: product.id,
    label: product.name,
    search: product.sku,
    hint: product.sku,
  }));

  const counterpartyOptions = data.counterparties.map((counterparty) => ({
    value: counterparty.id,
    label: counterparty.name,
  }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="location_from" value={effectiveFrom} />
      <input type="hidden" name="location_to" value={effectiveTo} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="movement-type">
          <Select
            name="type"
            value={type}
            onValueChange={(value) => setType(value as ManualMovementType)}
          >
            <SelectTrigger
              id="movement-type"
              className="h-10 w-full bg-surface"
            >
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_MOVEMENT_TYPES.map((movementType) => (
                <SelectItem key={movementType} value={movementType}>
                  {MANUAL_MOVEMENT_LABELS[movementType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Data" htmlFor="moved-on">
          <Input
            id="moved-on"
            type="date"
            name="moved_on"
            defaultValue={data.today}
            required
            className="num h-10"
          />
        </Field>

        <Field
          label="Produto"
          htmlFor="movement-product"
          className="sm:col-span-2"
          hint="Digite o nome ou o SKU."
        >
          <Combobox
            id="movement-product"
            name="product_id"
            options={productOptions}
            placeholder="Selecionar produto"
            searchPlaceholder="Buscar por nome ou SKU…"
            emptyText="Nenhum produto encontrado."
            defaultValue={productId}
            onValueChange={setProductId}
          />
        </Field>

        {type === "transfer" ? (
          <>
            <Field label="De" htmlFor="from-location">
              <LocationSelect
                id="from-location"
                name="from_location"
                locations={data.locations}
                value={locationFrom}
                onValueChange={setLocationFrom}
              />
            </Field>
            <Field label="Para" htmlFor="to-location">
              <LocationSelect
                id="to-location"
                name="to_location"
                locations={data.locations}
                value={locationTo}
                onValueChange={setLocationTo}
              />
            </Field>
          </>
        ) : null}

        {type === "adjustment" ? (
          <>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Sentido</span>
              <div className="inline-grid grid-cols-2 gap-0.5 rounded-md border border-line-strong bg-surface p-0.5">
                {(
                  [
                    ["out", "Saída"],
                    ["in", "Entrada"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={adjustmentDirection === value}
                    onClick={() => setAdjustmentDirection(value)}
                    className={cn(
                      "h-9 rounded-[4px] text-[13px] font-medium transition-colors",
                      adjustmentDirection === value
                        ? "bg-ink text-paper"
                        : "text-ink-soft hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Local" htmlFor="adjustment-location">
              <LocationSelect
                id="adjustment-location"
                name="adjustment_location"
                locations={data.locations}
                value={adjustmentLocation}
                onValueChange={setAdjustmentLocation}
              />
            </Field>
          </>
        ) : null}

        {type === "loan_out" ? (
          <Field label="Local de saída" htmlFor="loan-from">
            <LocationSelect
              id="loan-from"
              name="loan_from"
              locations={data.locations}
              value={locationFrom}
              onValueChange={setLocationFrom}
            />
          </Field>
        ) : null}

        {type === "loan_in" || type === "return" ? (
          <Field label="Local de entrada" htmlFor="loan-to">
            <LocationSelect
              id="loan-to"
              name="loan_to"
              locations={data.locations}
              value={locationTo}
              onValueChange={setLocationTo}
            />
          </Field>
        ) : null}

        <Field label="Quantidade" htmlFor="movement-qty">
          <Input
            id="movement-qty"
            name="qty"
            inputMode="decimal"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            required
            className="num h-10 text-right"
          />
        </Field>

        <Field
          label="Contraparte"
          htmlFor="counterparty"
          hint="Opcional — cliente, distribuidora ou funcionário."
        >
          <Combobox
            id="counterparty"
            name="counterparty_id"
            options={counterpartyOptions}
            placeholder="Sem contraparte"
            searchPlaceholder="Buscar contraparte…"
            emptyText="Nenhuma contraparte encontrada."
            allowClear
          />
        </Field>

        <Field label="Observações" htmlFor="movement-notes" className="sm:col-span-2">
          <Textarea
            id="movement-notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Opcional"
            className="resize-y"
          />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/estoque/movimentacoes">Cancelar</Link>
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
              Registrar movimentação
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function LocationSelect({
  id,
  name,
  locations,
  value,
  onValueChange,
}: {
  id: string;
  name: string;
  locations: { code: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select name={name} value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="h-10 w-full bg-surface">
        <SelectValue placeholder="Selecionar local" />
      </SelectTrigger>
      <SelectContent>
        {locations.map((location) => (
          <SelectItem key={location.code} value={location.code}>
            {location.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
