import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";

import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = {
  title: "Novo fornecedor",
};

export default function NovoFornecedorPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href="/fornecedores"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Fornecedores
        </Link>
      </div>

      <PageHeader
        title="Novo fornecedor"
        description="Cadastre quem fornece os produtos para selecionar nas compras."
      />

      <div className="mt-6">
        <SupplierForm mode="create" />
      </div>
    </div>
  );
}
