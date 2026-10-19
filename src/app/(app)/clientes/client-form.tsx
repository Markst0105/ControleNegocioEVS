"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createClientRecord,
  updateClientRecord,
  type ClientFormState,
} from "./actions";
import { formatPhoneBR } from "@/lib/clients";
import { cn } from "@/lib/utils";

export type ClientFormInitial = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
};

const initialState: ClientFormState = { error: null };

export function ClientForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: ClientFormInitial;
}) {
  const action = mode === "edit" ? updateClientRecord : createClientRecord;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const cancelHref =
    mode === "edit" && initial ? `/clientes/${initial.id}` : "/clientes";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {mode === "edit" && initial ? (
        <input type="hidden" name="client_id" value={initial.id} />
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          <p>{state.error}</p>

          {state.duplicates && state.duplicates.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 border-t border-rust/20 pt-3">
              {state.duplicates.map((duplicate) => (
                <li key={duplicate.id} className="text-[13px]">
                  <Link
                    href={`/clientes/${duplicate.id}`}
                    className="font-medium underline underline-offset-2 hover:text-ink"
                  >
                    {duplicate.name}
                  </Link>
                  <span className="text-rust-ink/75">
                    {" "}
                    · {duplicate.reason}
                    {duplicate.phone
                      ? ` · ${formatPhoneBR(duplicate.phone)}`
                      : ""}
                    {duplicate.whatsapp
                      ? ` · WhatsApp ${formatPhoneBR(duplicate.whatsapp)}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {state.allowOverride ? (
            <label className="mt-3 flex items-start gap-2 border-t border-rust/20 pt-3 text-[13px]">
              <input
                type="checkbox"
                name="confirm_duplicate"
                value="1"
                className="mt-0.5 size-4 accent-moss"
              />
              <span>
                {mode === "edit"
                  ? "Entendi. Salvar este cadastro mesmo com o contato repetido."
                  : "Entendi. Criar outro cadastro mesmo com o contato repetido."}
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome"
          htmlFor="name"
          className="sm:col-span-2"
          hint="O sistema verifica o nome e os contatos antes de salvar."
        >
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            autoComplete="name"
            placeholder="Nome do cliente"
            required
            className="h-10"
          />
        </Field>

        <Field label="Telefone" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => setPhone(formatPhoneBR(phone))}
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            className="num h-10"
          />
        </Field>

        <Field
          label="WhatsApp"
          htmlFor="whatsapp"
          hint="Pode ser o mesmo número do telefone."
        >
          <Input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            onBlur={() => setWhatsapp(formatPhoneBR(whatsapp))}
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            className="num h-10"
          />
        </Field>

        <Field
          label="Observações"
          htmlFor="notes"
          className="sm:col-span-2"
          hint="Preferências, endereço, indicação — o que ajudar no atendimento."
        >
          <Textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Opcional"
            className="resize-y"
          />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10">
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
              Salvar cliente
            </>
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
