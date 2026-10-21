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
import { isUuid } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Nova reserva",
};

type SearchParams = Promise<{ produto?: string; membro?: string }>;

export default async function NovaReservaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [membersResult, productsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, price_tier")
      .eq("role", "member")
      .order("name"),
    supabase
      .from("v_price_catalog")
      .select(
        "id, name, sku, pv, retail_price, price_25, price_35, price_42, price_50, price_bronze, price_prata, price_ouro",
      )
      .eq("is_active", true)
      .not("retail_price", "is", null)
      .order("name")
      .limit(1000),
  ]);

  const firstError = [membersResult.error, productsResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const members = membersResult.data ?? [];
  const products = productsResult.data ?? [];
  const initialProductId =
    params.produto && isUuid(params.produto)
      ? products.find((product) => product.id === params.produto)?.id
      : undefined;
  const initialMemberId =
    params.membro && isUuid(params.membro)
      ? members.find((member) => member.id === params.membro)?.id
      : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <Link
          href="/reservas"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Reservas
        </Link>
      </div>

      <PageHeader
        title="Nova reserva"
        description="Reserve produtos para um membro usando a faixa de preço dele."
      />

      <div className="mt-6">
        {members.length === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                Nenhum membro cadastrado
              </EmptyTitle>
              <EmptyDescription>
                Crie um usuário no Supabase Auth e um perfil com papel “member”
                para abrir reservas.
              </EmptyDescription>
            </EmptyHeader>
            <Link
              href="/reservas"
              className="text-sm font-medium underline underline-offset-4"
            >
              Voltar para reservas
            </Link>
          </Empty>
        ) : products.length === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                Nenhum produto com preço
              </EmptyTitle>
              <EmptyDescription>
                Cadastre a tabela de preços antes de criar reservas.
              </EmptyDescription>
            </EmptyHeader>
            <Link
              href="/precos"
              className="text-sm font-medium underline underline-offset-4"
            >
              Abrir Preços
            </Link>
          </Empty>
        ) : (
          <ReservationForm
            mode="operator"
            members={members}
            products={products}
            initialProductId={initialProductId}
            initialMemberId={initialMemberId}
          />
        )}
      </div>
    </div>
  );
}
