import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { isUuid } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = {
  title: "Editar fornecedor",
};

type Params = Promise<{ id: string }>;

export default async function EditarFornecedorPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: supplier, error } = await supabase
    .from("counterparties")
    .select("id, name, role_hint, active")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href={`/fornecedores/${supplier.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          {supplier.name}
        </Link>
      </div>

      <PageHeader
        title="Editar fornecedor"
        description="Atualize o nome, o tipo ou a situação do cadastro."
      />

      <div className="mt-6">
        <SupplierForm mode="edit" initial={supplier} />
      </div>
    </div>
  );
}
