import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ReservationForm } from "@/components/app/reservation-form";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Nova reserva",
};

type SearchParams = Promise<{ produto?: string }>;

export default async function MembroNovaReservaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (!session?.profile) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_catalog_member")
    .select("id, name, sku, pv, retail_price, member_price, member_tier_code")
    .eq("is_active", true)
    .not("member_price", "is", null)
    .order("name")
    .limit(1000);

  if (error) throw new Error(error.message);

  const products = data ?? [];
  const initialProductId =
    params.produto && isUuid(params.produto)
      ? products.find((product) => product.id === params.produto)?.id
      : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link
          href="/membro"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Catálogo
        </Link>
      </div>

      <PageHeader
        title="Nova reserva"
        description="Escolha os produtos. A loja confirma a disponibilidade e combina a retirada."
      />

      <div className="mt-6">
        {products.length === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                Nenhum produto disponível
              </EmptyTitle>
              <EmptyDescription>
                O catálogo ainda não tem produtos com preço para reservar.
              </EmptyDescription>
            </EmptyHeader>
            <Link
              href="/membro"
              className="text-sm font-medium underline underline-offset-4"
            >
              Voltar ao catálogo
            </Link>
          </Empty>
        ) : (
          <ReservationForm
            mode="member"
            members={[
              {
                id: session.profile.id,
                name: session.profile.name,
                price_tier: session.profile.price_tier,
              },
            ]}
            products={products}
            initialProductId={initialProductId}
          />
        )}
      </div>
    </div>
  );
}
