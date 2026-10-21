"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MDO_GROUPS, type MdoDay } from "@/lib/mdo";

import { saveDailyKpis, type MdoFormState } from "./actions";

const initialState: MdoFormState = { error: null };

export function MdoForm({
  day,
  date,
  month,
}: {
  day: MdoDay | null;
  date: string;
  month: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveDailyKpis,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="kpi_date" value={date} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {state.error}
        </p>
      ) : null}

      {MDO_GROUPS.map((group) => (
        <section
          key={group.key}
          className="rounded-lg border border-line bg-surface"
        >
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-serif text-[21px] leading-none font-normal">
              {group.title}
            </h2>
            <p className="mt-1 text-[11.5px] text-ink-soft">
              {group.description}
            </p>
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-4">
            {group.fields.map((field) => {
              const value = day?.[field.name];

              return (
                <div key={field.name} className="grid gap-1.5">
                  <Label
                    htmlFor={`kpi-${field.name}`}
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    {field.label}
                  </Label>
                  <Input
                    id={`kpi-${field.name}`}
                    name={field.name}
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    inputMode="numeric"
                    defaultValue={value ?? ""}
                    placeholder="0"
                    className="num h-10 text-right"
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={`/mdo?mes=${month}`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10 font-bold">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Salvando…
            </span>
          ) : (
            <>
              <Save />
              {day ? "Salvar alterações" : "Salvar dia"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
