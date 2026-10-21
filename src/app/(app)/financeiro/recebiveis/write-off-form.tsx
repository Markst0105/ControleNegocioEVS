"use client";

import { useActionState } from "react";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";

import { writeOffReceivable, type WriteOffFormState } from "./actions";

const initialState: WriteOffFormState = { error: null };

export function WriteOffForm({
  paymentId,
  openAmount,
  today,
}: {
  paymentId: string;
  openAmount: number;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    writeOffReceivable,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payment_id" value={paymentId} />

      <p className="text-[11.5px] text-rust-ink/85">
        A baixa de {formatMoney(openAmount)} remove o saldo restante dos
        recebíveis. O valor não entra como recebimento e continua registrado no
        histórico desta parcela.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="written_off_on">Data da baixa</Label>
          <Input
            id="written_off_on"
            name="written_off_on"
            type="date"
            defaultValue={today}
            max={today}
            required
            className="num h-10"
          />
        </div>

        <div className="grid content-start gap-1.5">
          <Label htmlFor="reason">Motivo</Label>
          <Textarea
            id="reason"
            name="reason"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            placeholder="Ex.: parcela antiga da planilha, cliente não localizado…"
            className="resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="h-10"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Baixando…
            </span>
          ) : (
            <>
              <Ban />
              Baixar saldo
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
