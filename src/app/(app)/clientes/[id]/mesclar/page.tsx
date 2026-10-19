import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

import { MergeForm } from "./merge-form";

export const metadata: Metadata = {
  title: "Mesclar clientes",
};

type Params = Promise<{ id: string }>;

export default async function MesclarClientePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  if (!isUuid(id)) notFound();

  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [sourceResult, targetsResult] = await Promise.all([
    supabase
      .from("v_client_overview")
      .select("id, name, phone, whatsapp, sales_count, open_amount")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("clients")
      .select("id, name, phone, whatsapp")
      .neq("id", id)
      .order("name")
      .limit(2000),
  ]);

  const firstError = [sourceResult.error, targetsResult.error].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  const source = sourceResult.data;
  if (!source) notFound();

  if (session.profile?.role !== "admin") {
    redirect(`/clientes/${source.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link
          href={`/clientes/${source.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          {source.name}
        </Link>
      </div>

      <PageHeader
        title="Mesclar clientes"
        description="Mova o histórico de um cadastro duplicado para o cadastro principal."
      />

      <div className="mt-6">
        <MergeForm source={source} targets={targetsResult.data ?? []} />
      </div>
    </div>
  );
}
