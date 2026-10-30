"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

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
  addDays,
  formatDecimalInput,
  formatMoney,
  formatMoneyInput,
  parseMoneyInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import { createSale, type SaleFormState } from "./actions";

export type SaleFormData = {
  clients: { id: string; name: string }[];
  initialClientId?: string;
  products: {
    id: string;
    name: string;
    sku: string;
    pv: number | null;
    retail_price: number | null;
  }[];
  dealTypes: { code: string; label: string; kind: string }[];
  paymentMethods: {
    code: string;
    label: string;
    kind: string;
    settlement_days: number | null;
  }[];
  today: string;
};

type Installment = { due: string; amount: string };

const INSTALLMENT_KINDS = ["credit", "ticket", "exception"];

/**
 * Acesso pago com cartela (TK) ou "não trouxe ticket" (NTT): o cliente não
 * paga nada no ato. A venda entra sem receita e com o custo do produto, que é
 * a perda registrada no mês; a cartela que pagou o acesso já carrega o lucro.
 */
function isTicketAccess(method?: { code: string; kind: string }): boolean {
  return !!method && (method.kind === "ticket" || method.code === "NTT");
}

const initialState: SaleFormState = { error: null };

export function VendaForm({ data }: { data: SaleFormData }) {
  const [state, formAction, pending] = useActionState(createSale, initialState);

  const [clientId, setClientId] = useState(data.initialClientId ?? "");
  const [productId, setProductId] = useState("");
  const [dealCode, setDealCode] = useState("0");
  const [paymentCode, setPaymentCode] = useState("$");
  const [origin, setOrigin] = useState<"EVS" | "CASA">("EVS");
  const [soldOn, setSoldOn] = useState(data.today);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [pv, setPv] = useState("");
  const [pvTouched, setPvTouched] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [costsOpen, setCostsOpen] = useState(false);

  const payment = data.paymentMethods.find((method) => method.code === paymentCode);
  const ticketAccess = isTicketAccess(payment);
  const needsInstallments = payment
    ? INSTALLMENT_KINDS.includes(payment.kind) && !ticketAccess
    : false;
  const isDiscount = dealCode === "DESC";

  const selectedProduct = data.products.find(
    (product) => product.id === productId,
  );
  const referencePrice = selectedProduct?.retail_price ?? null;

  const installmentsTotal = installments.reduce(
    (sum, row) => sum + (parseMoneyInput(row.amount) ?? 0),
    0,
  );
  const amountValue = parseMoneyInput(amount);
  const installmentsMismatch =
    installments.length > 0 &&
    amountValue !== null &&
    Math.abs(installmentsTotal - amountValue) > 0.005;

  function handleProductChange(value: string) {
    setProductId(value);
    const product = data.products.find((item) => item.id === value);
    if (!pvTouched) {
      setPv(product?.pv != null ? formatDecimalInput(product.pv) : "");
    }
    // Acesso pago com cartela fica em 0,00: o preço de tabela aparece apenas
    // como referência ao lado do valor.
    if (!amountTouched && !ticketAccess) {
      setAmount(
        product?.retail_price != null
          ? formatMoneyInput(product.retail_price)
          : "",
      );
    }
  }

  function seedInstallments(code: string, amountText: string = amount) {
    const method = data.paymentMethods.find((item) => item.code === code);
    if (!method) return;

    if (!INSTALLMENT_KINDS.includes(method.kind)) {
      setInstallments([]);
      return;
    }

    const count = /^[123]$/.test(code) ? Number(code) : 1;
    const parsed = parseMoneyInput(amountText);
    const cents = parsed !== null ? Math.round(parsed * 100) : null;
    const base = cents !== null ? Math.floor(cents / count) : null;
    const isCredit = method.kind === "credit";

    setInstallments(
      Array.from({ length: count }, (_, index) => {
        const installmentCents =
          cents === null || base === null
            ? null
            : index === count - 1
              ? cents - base * (count - 1)
              : base;

        return {
          due: addDays(
            soldOn,
            isCredit ? 30 * (index + 1) : (method.settlement_days ?? 0),
          ),
          amount:
            installmentCents === null
              ? ""
              : (installmentCents / 100).toFixed(2).replace(".", ","),
        };
      }),
    );
  }

  function handlePaymentChange(code: string) {
    setPaymentCode(code);
    const method = data.paymentMethods.find((item) => item.code === code);

    if (isTicketAccess(method)) {
      setAmount(formatMoneyInput(0));
      setAmountTouched(false);
      setInstallments([]);
      setCostsOpen(true);
      return;
    }

    const nextAmount =
      !amountTouched && referencePrice != null
        ? formatMoneyInput(referencePrice)
        : amount;

    if (!amountTouched) {
      setAmount(nextAmount);
    }

    if (installments.length === 0) {
      seedInstallments(code, nextAmount);
    }
  }

  function handleAmountBlur() {
    const parsed = parseMoneyInput(amount);
    if (parsed !== null) {
      setAmount(formatMoneyInput(parsed));
    }
  }

  function updateInstallment(index: number, patch: Partial<Installment>) {
    setInstallments((previous) =>
      previous.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function addInstallment() {
    setInstallments((previous) => {
      if (previous.length >= 3) return previous;
      return [
        ...previous,
        { due: addDays(soldOn, 30 * (previous.length + 1)), amount: "" },
      ];
    });
  }

  const clientOptions = data.clients.map((client) => ({
    value: client.id,
    label: client.name,
  }));

  const productOptions = data.products.map((product) => ({
    value: product.id,
    label: product.name,
    search: product.sku,
    hint: product.sku,
  }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data da venda" htmlFor="sold-on">
          <Input
            id="sold-on"
            type="date"
            name="sold_on"
            value={soldOn}
            onChange={(event) => setSoldOn(event.target.value)}
            required
            className="num h-10"
          />
        </Field>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Origem</span>
          <div className="inline-grid grid-cols-2 gap-0.5 rounded-md border border-line-strong bg-surface p-0.5">
            {(["EVS", "CASA"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={origin === option}
                onClick={() => setOrigin(option)}
                className={cn(
                  "num h-9 rounded-[4px] text-[13px] font-medium tracking-wide transition-colors",
                  origin === option
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:text-ink",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <input type="hidden" name="origin" value={origin} />
        </div>

        <Field
          label="Cliente"
          htmlFor="client"
          className="sm:col-span-2"
          hint="Opcional — deixe em branco para venda de balcão."
        >
          <Combobox
            id="client"
            name="client_id"
            options={clientOptions}
            placeholder="Balcão — sem cliente"
            searchPlaceholder="Buscar cliente…"
            emptyText="Nenhum cliente encontrado."
            defaultValue={clientId}
            onValueChange={setClientId}
            allowClear
          />
        </Field>

        <Field
          label="Produto"
          htmlFor="product"
          className="sm:col-span-2"
          hint="Digite o nome ou o SKU."
        >
          <Combobox
            id="product"
            name="product_id"
            options={productOptions}
            placeholder="Selecionar produto"
            searchPlaceholder="Buscar por nome ou SKU…"
            emptyText="Nenhum produto encontrado."
            defaultValue={productId}
            onValueChange={handleProductChange}
            allowClear
          />
        </Field>

        <Field label="Forma de pagamento" htmlFor="payment">
          <Select
            name="payment_method_code"
            value={paymentCode}
            onValueChange={handlePaymentChange}
          >
            <SelectTrigger id="payment" className="h-10 w-full bg-surface">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {data.paymentMethods.map((method) => (
                <SelectItem key={method.code} value={method.code}>
                  {method.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Tipo de negócio" htmlFor="deal">
          <Select
            name="deal_type_code"
            value={dealCode}
            onValueChange={setDealCode}
          >
            <SelectTrigger id="deal" className="h-10 w-full bg-surface">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {data.dealTypes.map((deal) => (
                <SelectItem key={deal.code} value={deal.code}>
                  {deal.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {isDiscount ? (
          <Field
            label="Desconto (%)"
            htmlFor="discount"
            hint="Ex.: 14 para 14% de desconto."
          >
            <Input
              id="discount"
              name="discount_pct"
              inputMode="decimal"
              placeholder="14"
              className="num h-10"
            />
          </Field>
        ) : null}

        <Field
          label="Valor recebido (R$)"
          htmlFor="amount"
          hint={
            ticketAccess
              ? referencePrice != null
                ? `Acesso pago com cartela: sem receita. Preço de tabela ${formatMoney(referencePrice)} (referência).`
                : "Acesso pago com cartela: sem receita; entra só o custo do produto."
              : "Preenchido pela tabela de preços; ajuste se precisar."
          }
        >
          <Input
            id="amount"
            name="amount_received"
            inputMode="decimal"
            value={amount}
            readOnly={ticketAccess}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountTouched(true);
            }}
            onBlur={handleAmountBlur}
            placeholder="0,00"
            required
            className={cn(
              "num h-10",
              ticketAccess && "bg-paper text-ink-soft",
            )}
          />
        </Field>

        <Field label="PV" htmlFor="pv" hint="Preenchido pelo produto; ajuste se precisar.">
          <Input
            id="pv"
            name="pv"
            inputMode="decimal"
            value={pv}
            onChange={(event) => {
              setPv(event.target.value);
              setPvTouched(true);
            }}
            placeholder="0"
            className="num h-10"
          />
        </Field>
      </div>

      {needsInstallments ? (
        <section className="rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-serif text-[20px] leading-none font-normal">
                Parcelas a receber
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                Vencimento e valor de cada parcela (até 3).
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={addInstallment}
              disabled={installments.length >= 3}
            >
              <Plus />
              Adicionar
            </Button>
          </div>

          <div className="flex flex-col gap-2 p-4">
            {installments.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Nenhuma parcela — a venda entra como recebida.
              </p>
            ) : (
              installments.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2"
                >
                  <span className="num w-5 text-xs text-ink-soft">
                    {index + 1}ª
                  </span>
                  <Input
                    type="date"
                    name={`installment_due_${index + 1}`}
                    value={row.due}
                    onChange={(event) =>
                      updateInstallment(index, { due: event.target.value })
                    }
                    className="num h-9 min-w-0"
                    aria-label={`Vencimento da parcela ${index + 1}`}
                  />
                  <Input
                    name={`installment_amount_${index + 1}`}
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(event) =>
                      updateInstallment(index, { amount: event.target.value })
                    }
                    placeholder="0,00"
                    className="num h-9 min-w-0 text-right"
                    aria-label={`Valor da parcela ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-ink-soft hover:text-rust"
                    onClick={() =>
                      setInstallments((previous) =>
                        previous.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    aria-label={`Remover parcela ${index + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))
            )}

            {installmentsMismatch ? (
              <p className="text-[11px] text-rust-ink">
                Soma das parcelas: {formatMoney(installmentsTotal)} — difere do
                valor recebido ({formatMoney(amountValue)}).
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <details
        className="group rounded-lg border border-line bg-surface"
        open={costsOpen}
        onToggle={(event) => setCostsOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 font-serif text-[19px] leading-none font-normal select-none [&::-webkit-details-marker]:hidden">
          Custos e observações
          <ChevronDown className="size-4 text-ink-soft transition-transform group-open:rotate-180" />
        </summary>

        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          <Field
            label="Custo do produto (R$)"
            htmlFor="product-cost"
            hint={
              ticketAccess
                ? "Obrigatório aqui: é a perda que o acesso pago com cartela registra no mês."
                : undefined
            }
          >
            <Input
              id="product-cost"
              name="product_cost"
              inputMode="decimal"
              placeholder="0,00"
              className="num h-10"
            />
          </Field>

          <Field label="Custo financeiro (R$)" htmlFor="financial-cost">
            <Input
              id="financial-cost"
              name="financial_cost"
              inputMode="decimal"
              placeholder="0,00"
              className="num h-10"
            />
          </Field>

          <Field
            label="Observações"
            htmlFor="obs"
            className="sm:col-span-2"
          >
            <Textarea
              id="obs"
              name="obs"
              rows={2}
              placeholder="Opcional"
              className="resize-none"
            />
          </Field>
        </div>
      </details>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href="/vendas">Cancelar</Link>
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="h-10 font-bold transition-transform motion-safe:active:scale-[0.98] sm:w-44"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Registrando…
            </span>
          ) : (
            "Registrar venda"
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
