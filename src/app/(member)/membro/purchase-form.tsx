"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { requestMemberCredit, type MemberCreditState } from "./actions";

const initialState: MemberCreditState = { error: null };

export type MemberPaymentMethod = {
  code: string;
  label: string;
};

export function PurchaseCreditsDialog({
  methods,
  today,
}: Readonly<{
  methods: MemberPaymentMethod[];
  today: string;
}>) {
  const [state, formAction, pending] = useActionState(
    requestMemberCredit,
    initialState,
  );
  const [methodCode, setMethodCode] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-10 font-bold">
          <Plus />
          Comprar créditos
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface">
        <DialogHeader>
          <DialogTitle className="font-serif text-[24px] font-normal">
            Comprar créditos
          </DialogTitle>
          <DialogDescription>
            Informe o valor e como você pagou. A equipe confirma o pagamento e o
            saldo entra na sua conta.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="member-credit-amount">Valor dos créditos</Label>
            <Input
              id="member-credit-amount"
              name="amount"
              inputMode="decimal"
              placeholder="0,00"
              required
              autoFocus
              disabled={pending}
              className="num h-10"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="member-credit-method">Forma de pagamento</Label>
              <Select
                name="payment_method_code"
                value={methodCode}
                onValueChange={setMethodCode}
              >
                <SelectTrigger
                  id="member-credit-method"
                  className="h-10 w-full bg-surface"
                >
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method.code} value={method.code}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="member-credit-date">Dia da compra</Label>
              <Input
                id="member-credit-date"
                name="purchased_on"
                type="date"
                defaultValue={today}
                max={today}
                required
                disabled={pending}
                className="num h-10"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="member-credit-notes">Observação</Label>
            <Input
              id="member-credit-notes"
              name="notes"
              placeholder="Opcional"
              maxLength={500}
              disabled={pending}
              className="h-10"
            />
          </div>

          <p className="rounded-md border border-line bg-paper px-3 py-2 text-[11.5px] text-ink-soft">
            A compra fica pendente até a equipe confirmar o pagamento.
          </p>

          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
            >
              {state.error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending || methods.length === 0}
            className="h-10 w-full font-bold transition-transform motion-safe:active:scale-[0.98]"
          >
            {pending ? "Enviando…" : "Enviar compra"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
