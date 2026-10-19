"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { GitMerge } from "lucide-react";

import { Combobox, type ComboboxOption } from "@/components/app/combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { digitsOnly, formatPhoneBR } from "@/lib/clients";
import { formatInt, formatMoney } from "@/lib/format";

import { mergeClientRecords, type MergeFormState } from "../../actions";

const initialState: MergeFormState = { error: null };

export function MergeForm({
  source,
  targets,
}: {
  source: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    sales_count: number;
    open_amount: number;
  };
  targets: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
  }[];
}) {
  const [state, formAction, pending] = useActionState(
    mergeClientRecords,
    initialState,
  );
  const [targetId, setTargetId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const selectedTarget = targets.find((target) => target.id === targetId);

  const options: ComboboxOption[] = targets.map((target) => ({
    value: target.id,
    label: target.name,
    search: [
      target.phone,
      target.whatsapp,
      digitsOnly(target.phone),
      digitsOnly(target.whatsapp),
    ]
      .filter(Boolean)
      .join(" "),
    hint: target.phone
      ? formatPhoneBR(target.phone)
      : target.whatsapp
        ? formatPhoneBR(target.whatsapp)
        : undefined,
  }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="source_id" value={source.id} />

      {state.error ? (
        <div
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {state.error}
        </div>
      ) : null}

      <div className="border-y border-line">
        <div className="py-4">
          <p className="text-[11px] font-medium text-ink-soft">
            Origem · será excluída
          </p>
          <p className="mt-1 font-serif text-[24px] leading-none">
            {source.name}
          </p>
          <p className="num mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-soft">
            {source.phone ? (
              <span>Telefone {formatPhoneBR(source.phone)}</span>
            ) : null}
            {source.whatsapp ? (
              <span>WhatsApp {formatPhoneBR(source.whatsapp)}</span>
            ) : null}
            {!source.phone && !source.whatsapp ? <span>Sem contato</span> : null}
          </p>
          <p className="num mt-1 text-[12px] text-ink-soft">
            {formatInt(source.sales_count)}{" "}
            {source.sales_count === 1 ? "compra" : "compras"} ·{" "}
            {formatMoney(source.open_amount)} em aberto
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="target">Cliente de destino</Label>
        <Combobox
          id="target"
          name="target_id"
          options={options}
          placeholder="Buscar o cadastro que vai permanecer…"
          searchPlaceholder="Buscar por nome ou telefone…"
          emptyText="Nenhum cliente encontrado."
          allowClear
          onValueChange={setTargetId}
        />
        <p className="text-[11px] text-ink-soft">
          O histórico da origem será movido para este cadastro.
        </p>
      </div>

      {selectedTarget ? (
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-[11px] font-medium text-ink-soft">
              Destino · vai permanecer
            </p>
            <p className="mt-1 font-serif text-[22px] leading-none">
              {selectedTarget.name}
            </p>
            <p className="num mt-2 text-[12px] text-ink-soft">
              {selectedTarget.phone
                ? formatPhoneBR(selectedTarget.phone)
                : selectedTarget.whatsapp
                  ? formatPhoneBR(selectedTarget.whatsapp)
                  : "Sem contato cadastrado"}
            </p>
          </div>
          <GitMerge className="mt-1 size-5 text-ink-soft" />
        </div>
      ) : null}

      <div className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-[13px] leading-relaxed text-rust-ink">
        <p className="font-medium">Antes de confirmar:</p>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
          <li>As vendas e os nomes alternativos da origem passam para o destino.</li>
          <li>
            As observações são combinadas. Se a origem tiver outro telefone ou
            WhatsApp, ele fica registrado nas observações.
          </li>
          <li>O cadastro de origem será excluído. Esta ação não pode ser desfeita.</li>
        </ul>
      </div>

      <label className="flex items-start gap-2.5 text-[13px]">
        <input
          type="checkbox"
          name="confirm"
          value="1"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          required
          className="mt-0.5 size-4 accent-moss"
        />
        <span>
          Confirmo que revisei os dois cadastros e quero mesclar a origem no
          destino.
        </span>
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={`/clientes/${source.id}`}>Cancelar</Link>
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !targetId || !confirmed}
          className="h-10"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Mesclando…
            </span>
          ) : (
            <>
              <GitMerge />
              Mesclar cadastros
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
