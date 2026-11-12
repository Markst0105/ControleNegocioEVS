"use client";

import { useActionState } from "react";
import { Check, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";

import { setPurchasePaidOn, type PaymentFormState } from "../actions";

const initialState: PaymentFormState = { error: null };

export function PurchasePaymentForm({
  purchaseId,
  today,
  paidOn,
}: {
  purchaseId: string;
  today: string;
  paidOn: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    setPurchasePaidOn,
    initialState,
  );

  return (
    <div className="flex flex-col gap-3">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      {paidOn ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-ink-soft">
            Pagamento confirmado em{" "}
            <strong className="font-medium text-ink">{formatDate(paidOn)}</strong>
            .
          </p>
          <form action={formAction}>
            <input type="hidden" name="purchase_id" value={purchaseId} />
            <input type="hidden" name="paid_on" value="" />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={pending}
            >
              <Undo2 />
              Desmarcar pagamento
            </Button>
          </form>
        </div>
      ) : (
        <form
          action={formAction}
          className="flex flex-wrap items-end gap-2 sm:gap-3"
        >
          <input type="hidden" name="purchase_id" value={purchaseId} />
          <div className="grid gap-1.5">
            <Label
              htmlFor="paid_on"
              className="text-[11px] font-medium text-ink-soft"
            >
              Data do pagamento
            </Label>
            <Input
              id="paid_on"
              type="date"
              name="paid_on"
              defaultValue={today}
              required
              className="num h-9 w-44"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-9 font-bold"
            disabled={pending}
          >
            <Check />
            Confirmar pagamento
          </Button>
        </form>
      )}
    </div>
  );
}
