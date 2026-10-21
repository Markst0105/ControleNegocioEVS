import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ChevronLeft,
  GitMerge,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";

import { DealBadge, OriginBadge } from "@/components/app/badges";
import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSession } from "@/lib/auth";
import { getClientOverviewStats } from "@/lib/client-overview";
import {
  formatPhoneBR,
  isUuid,
  phoneHref,
  whatsappHref,
} from "@/lib/clients";
import { formatDate, formatInt, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Cliente",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string }>;

const OK_MESSAGES: Record<string, string> = {
  novo: "Cliente cadastrado.",
  editado: "Cliente atualizado.",
  mesclado: "Clientes mesclados.",
};

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [
    clientResult,
    stats,
    salesResult,
    aliasesResult,
    dealTypesResult,
    session,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, phone, whatsapp, notes, created_at")
      .eq("id", id)
      .maybeSingle(),
    getClientOverviewStats(supabase, [id]),
    supabase
      .from("sales")
      .select(
        "id, sold_on, product_name_raw, deal_type_code, origin, amount_received",
      )
      .eq("client_id", id)
      .order("sold_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("client_aliases")
      .select("raw_name")
      .eq("client_id", id)
      .order("raw_name")
      .limit(30),
    supabase.from("deal_types").select("code, label"),
    getSession(),
  ]);

  const firstError = [
    clientResult.error,
    salesResult.error,
    aliasesResult.error,
    dealTypesResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const clientRow = clientResult.data;
  if (!clientRow) notFound();

  const overview = stats.get(id);
  const client = {
    ...clientRow,
    ...(overview ?? {
      sales_count: 0,
      total_spent: 0,
      last_purchase_on: null,
      open_amount: 0,
    }),
  };

  const sales = salesResult.data ?? [];
  const aliases = aliasesResult.data ?? [];
  const dealLabels = new Map(
    (dealTypesResult.data ?? []).map((deal) => [deal.code, deal.label]),
  );
  const isAdmin = session?.profile?.role === "admin";
  const tel = phoneHref(client.phone);
  const whatsapp = whatsappHref(client.whatsapp);
  const okMessage = query.ok ? OK_MESSAGES[query.ok] : null;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <div>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Clientes
        </Link>
      </div>

      <PageHeader
        title={client.name}
        description={`Cadastro desde ${formatDate(client.created_at)}`}
        actions={
          <>
            {isAdmin ? (
              <Button asChild variant="ghost" size="sm" className="h-9">
                <Link href={`/clientes/${client.id}/mesclar`}>
                  <GitMerge />
                  Mesclar
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm" className="h-9 font-bold">
              <Link href={`/vendas/nova?cliente=${client.id}`}>
                <Plus />
                Lançar venda
              </Link>
            </Button>
            <Button asChild size="sm" className="h-9">
              <Link href={`/clientes/${client.id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        <div className="bg-paper px-4 py-4 sm:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Compras</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(client.sales_count)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Total comprado
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(client.total_spent)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Última compra
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatDate(client.last_purchase_on)}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">Em aberto</dt>
          <dd
            className={
              Number(client.open_amount) > 0
                ? "num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap text-rust-ink"
                : "num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap"
            }
          >
            {Number(client.open_amount) > 0 ? (
              <Link
                href={`/financeiro/recebiveis?cliente=${client.id}`}
                className="underline-offset-2 hover:underline"
              >
                {formatMoney(client.open_amount)}
              </Link>
            ) : (
              formatMoney(client.open_amount)
            )}
          </dd>
        </div>
      </dl>

      <div className="grid gap-8 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-10">
        <section>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Contato
          </h2>

          <dl className="mt-3 divide-y divide-line border-y border-line text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-ink-soft">Telefone</dt>
              <dd className="num text-right">
                {client.phone && tel ? (
                  <a
                    href={tel}
                    className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                  >
                    <Phone className="size-3.5 text-ink-soft" />
                    {formatPhoneBR(client.phone)}
                  </a>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-ink-soft">WhatsApp</dt>
              <dd className="num text-right">
                {client.whatsapp && whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                  >
                    <MessageCircle className="size-3.5 text-ink-soft" />
                    {formatPhoneBR(client.whatsapp)}
                  </a>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </dd>
            </div>
          </dl>

          {aliases.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium text-ink-soft">
                Também lançado como
              </h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {aliases.map((alias) => (
                  <li
                    key={alias.raw_name}
                    className="rounded-sm border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-soft"
                  >
                    {alias.raw_name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Observações
          </h2>
          <p className="mt-3 border-y border-line py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
            {client.notes?.trim() || "Sem observações."}
          </p>
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-[24px] leading-none font-normal">
              Histórico recente
            </h2>
            <p className="mt-1 text-[12px] text-ink-soft">
              {sales.length === 0
                ? "Compras registradas para este cliente."
                : `Últimas ${sales.length} ${
                    sales.length === 1 ? "compra registrada" : "compras registradas"
                  }.`}
            </p>
          </div>
        </div>

        {sales.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-center text-sm text-ink-soft">
            Nenhuma compra registrada para este cliente.
          </p>
        ) : (
          <div className="mt-3 border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Produto
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Negócio
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Origem
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="num border-l-[3px] border-l-transparent py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                      {formatDate(sale.sold_on)}
                    </TableCell>
                    <TableCell className="max-w-[280px] px-2 py-2.5 text-[13px]">
                      <span className="block truncate">
                        {sale.product_name_raw ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden px-2 py-2.5 sm:table-cell">
                      <DealBadge
                        label={
                          sale.deal_type_code
                            ? dealLabels.get(sale.deal_type_code)
                            : null
                        }
                      />
                    </TableCell>
                    <TableCell className="px-2 py-2.5">
                      <OriginBadge origin={sale.origin} />
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 pr-3 text-right text-[13px] whitespace-nowrap">
                      {formatMoney(sale.amount_received)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
