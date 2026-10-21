"use client";

import { useActionState } from "react";
import { LockKeyhole, RotateCcw } from "lucide-react";

import { SubmitButton } from "@/components/app/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  closeMonth,
  reopenMonth,
  type MonthCloseFormState,
} from "./actions";

const initialState: MonthCloseFormState = { error: null };

export function CloseMonthForm({
  month,
  warningCount,
}: {
  month: string;
  warningCount: number;
}) {
  const [state, formAction] = useActionState(closeMonth, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="month" value={month} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-[11.5px] leading-relaxed text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="close-note">Observação do fechamento</Label>
        <Textarea
          id="close-note"
          name="note"
          maxLength={1000}
          rows={3}
          placeholder="Opcional — fica guardada com o snapshot"
        />
      </div>

      {warningCount > 0 ? (
        <p className="rounded-md border border-citrus/30 bg-citrus-soft px-3 py-2 text-[11px] leading-relaxed text-citrus-ink">
          Há {warningCount}{" "}
          {warningCount === 1 ? "pendência" : "pendências"} na conferência. Você
          pode fechar mesmo assim; o snapshot registra os valores atuais.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-soft">
          O fechamento guarda os totais de resultado, caixa e recebíveis para
          comparar com lançamentos posteriores.
        </p>
      )}

      <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          name="confirmo"
          required
          className="mt-0.5 size-3.5 accent-citrus"
        />
        Confirmo que conferi o mês e quero registrar o fechamento.
      </label>

      <SubmitButton pendingLabel="Fechando…" className="w-full">
        <LockKeyhole />
        Fechar mês
      </SubmitButton>
    </form>
  );
}

export function ReopenMonthForm({
  month,
  changed,
}: {
  month: string;
  changed: boolean;
}) {
  const [state, formAction] = useActionState(reopenMonth, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="month" value={month} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-[11.5px] leading-relaxed text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      <p className="text-[11px] leading-relaxed text-ink-soft">
        {changed
          ? "Os dados atuais já divergem do snapshot. Reabra para revisar e fechar novamente."
          : "Reabrir mantém o último snapshot como referência; o mês volta a aceitar um novo fechamento."}
      </p>

      <div className="grid gap-1.5">
        <Label htmlFor="reopen-note">Motivo da reabertura</Label>
        <Textarea
          id="reopen-note"
          name="note"
          required
          maxLength={1000}
          rows={3}
          placeholder="Ex.: corrigir uma despesa lançada fora do mês"
        />
      </div>

      <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          name="confirmo"
          required
          className="mt-0.5 size-3.5 accent-rust"
        />
        Confirmo que quero reabrir este mês.
      </label>

      <SubmitButton
        pendingLabel="Reabrindo…"
        variant="outline"
        className="w-full"
      >
        <RotateCcw />
        Reabrir mês
      </SubmitButton>
    </form>
  );
}
