"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatMoneyInput } from "@/lib/format";

import { receiveReceivable, type ReceiptFormState } from "./actions";

const initialState: ReceiptFormState = { error: null };

export function ReceiptForm({
  paymentId,
  openAmount,
  today,
}: {
  paymentId: string;
  openAmount: number;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    receiveReceivable,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <input type="hidden" name="payment_id" value={paymentId} />

      <div>
        <h2 className="font-serif text-[22px] leading-none font-normal">
          Registrar recebimento
        </h2>
        <p className="mt-1 text-[11.5px] text-ink-soft">
          Informe o valor recebido. Um valor menor que {formatMoney(openAmount)}{" "}
          deixa o restante em aberto.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="received_on">Data do recebimento</Label>
          <Input
            id="received_on"
            name="received_on"
            type="date"
            defaultValue={today}
            max={today}
            required
            className="num h-10"
          />
        </div>

        <div className="grid content-start gap-1.5">
          <Label htmlFor="amount">Valor recebido</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={formatMoneyInput(openAmount)}
            required
            className="num h-10"
          />
        </div>

        <div className="grid content-start gap-1.5 sm:col-span-2">
          <Label htmlFor="note">Observação</Label>
          <Textarea
            id="note"
            name="note"
            maxLength={500}
            rows={2}
            placeholder="Opcional — ex.: PIX, cartão, pagamento parcial…"
            className="resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="h-10">
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
              <Check />
              Registrar recebimento
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
