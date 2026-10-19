import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";

import { ClientForm } from "../client-form";

export const metadata: Metadata = {
  title: "Novo cliente",
};

export default function NovoClientePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Clientes
        </Link>
      </div>

      <PageHeader
        title="Novo cliente"
        description="O cadastro alimenta o histórico de vendas e os recebíveis."
      />

      <div className="mt-6">
        <ClientForm mode="create" />
      </div>
    </div>
  );
}
