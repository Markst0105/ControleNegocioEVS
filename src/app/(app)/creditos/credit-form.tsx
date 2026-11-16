"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

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

import { createCredit, type CreditFormState } from "./actions";

const initialState: CreditFormState = { error: null };

export type CreditMemberOption = {
  id: string;
  name: string;
  email: string | null;
};

export type CreditMethodOption = {
  code: string;
  label: string;
};

export function CreditForm({
  members,
  methods,
  today,
}: {
  members: CreditMemberOption[];
  methods: CreditMethodOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCredit,
    initialState,
  );
  const [profileId, setProfileId] = useState("");
  const [methodCode, setMethodCode] = useState("");

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line/70 px-4 py-3">
        <h2 className="font-serif text-[20px] leading-none font-normal">
          Lançar crédito
        </h2>
        <p className="mt-1.5 text-[11px] text-ink-soft">
          Escolha o usuário, o valor, a forma de pagamento e o dia da compra. O
          crédito entra aprovado e fica disponível na hora.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4 px-4 py-4">
        <div className="grid gap-1.5">
          <Label htmlFor="credit-profile">Usuário</Label>
          <Select
            name="profile_id"
            value={profileId}
            onValueChange={setProfileId}
          >
            <SelectTrigger
              id="credit-profile"
              className="h-10 w-full bg-surface"
            >
              <SelectValue placeholder="Selecionar usuário cadastrado" />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.email
                    ? `${member.name} · ${member.email}`
                    : member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {members.length === 0 ? (
            <p className="text-[11px] text-citrus-ink">
              Nenhum usuário cadastrado ainda. Peça para o cliente criar a conta
              na tela de login.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="credit-amount">Valor dos créditos</Label>
            <Input
              id="credit-amount"
              name="amount"
              inputMode="decimal"
              placeholder="0,00"
              required
              disabled={pending}
              className="num h-10"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="credit-date">Dia da compra</Label>
            <Input
              id="credit-date"
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
          <Label htmlFor="credit-method">Forma de pagamento</Label>
          <Select
            name="payment_method_code"
            value={methodCode}
            onValueChange={setMethodCode}
          >
            <SelectTrigger
              id="credit-method"
              className="h-10 w-full bg-surface"
            >
              <SelectValue placeholder="Selecionar forma de pagamento" />
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
          <Label htmlFor="credit-notes">Observação</Label>
          <Input
            id="credit-notes"
            name="notes"
            placeholder="Opcional"
            maxLength={500}
            disabled={pending}
            className="h-10"
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
          >
            {state.error}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={pending || members.length === 0}
            className="h-10 font-bold"
          >
            <Plus />
            {pending ? "Lançando…" : "Lançar crédito"}
          </Button>
        </div>
      </form>
    </section>
  );
}
