import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { isUuid } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

import { ClientForm } from "../../client-form";

export const metadata: Metadata = {
  title: "Editar cliente",
};

type Params = Promise<{ id: string }>;

export default async function EditarClientePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, name, phone, whatsapp, notes")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href={`/clientes/${client.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          {client.name}
        </Link>
      </div>

      <PageHeader
        title="Editar cliente"
        description="Atualize contato, nome e observações do cadastro."
      />

      <div className="mt-6">
        <ClientForm mode="edit" initial={client} />
      </div>
    </div>
  );
}
