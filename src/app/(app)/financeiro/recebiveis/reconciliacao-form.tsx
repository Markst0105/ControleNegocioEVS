"use client";

import { useState, useTransition } from "react";
import { Ban, HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatInt, formatMoney } from "@/lib/format";

import {
  previewReconciliation,
  reconcileReceivables,
  type ReconciliationPreview,
} from "./actions";

/**
 * Bulk reconciliation of the historical backlog. The preview tells the admin
 * exactly how many installments and how much money the chosen cutoff touches
 * before anything is written.
 */
export function ReconciliationForm({
  defaultCutoff,
  today,
}: {
  defaultCutoff: string;
  today: string;
}) {
  const [cutoff, setCutoff] = useState(defaultCutoff);
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateCutoff(value: string) {
    setCutoff(value);
    if (!value) {
      setPreview(null);
      return;
    }
    startTransition(async () => {
      setPreview(await previewReconciliation(value));
    });
  }

  return (
    <form action={reconcileReceivables} className="mt-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="cutoff">Vencidos até</Label>
          <Input
            id="cutoff"
            name="cutoff"
            type="date"
            value={cutoff}
            max={today}
            required
            className="num h-10"
            onChange={(event) => updateCutoff(event.target.value)}
          />
        </div>

        <div className="grid content-start gap-1.5">
          <Label htmlFor="reconcile-note">Observação</Label>
          <Input
            id="reconcile-note"
            name="note"
            maxLength={500}
            placeholder="Opcional — aparece no histórico de cada parcela"
            className="h-10"
          />
        </div>
      </div>

      <p
        className="num text-[11.5px] leading-relaxed text-ink-soft"
        aria-live="polite"
      >
        {isPending
          ? "Calculando…"
          : preview
            ? preview.count === 0
              ? "Nenhuma parcela em aberto até essa data."
              : `${formatInt(preview.count)} ${
                  preview.count === 1 ? "parcela" : "parcelas"
                } · ${formatMoney(preview.total)} serão liquidadas${
                  preview.oldest && preview.newest
                    ? ` (vencimentos de ${formatDate(preview.oldest)} a ${formatDate(preview.newest)})`
                    : ""
                }.`
            : "Informe a data de corte para ver o impacto."}
      </p>

      <label className="flex max-w-3xl items-start gap-2 text-[11.5px] leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          name="confirmo"
          required
          className="mt-0.5 size-3.5 accent-rust"
        />
        Confirmo que os lançamentos até essa data já foram conferidos e podem
        ser liquidados em lote.
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="mode" value="receipt" variant="secondary">
          <HandCoins />
          Marcar como recebidas
        </Button>
        <Button type="submit" name="mode" value="write_off" variant="destructive">
          <Ban />
          Baixar sem recebimento
        </Button>
      </div>
    </form>
  );
}
