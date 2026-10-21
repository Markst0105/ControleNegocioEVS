import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus, ShoppingBag } from "lucide-react";
import { Suspense } from "react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { ReservationStatusBadge } from "@/components/app/reservation-status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cancelReservation } from "@/lib/actions/reservations";
import { isUuid } from "@/lib/clients";
import {
  formatDate,
  formatDecimal,
  formatInt,
  formatMoney,
} from "@/lib/format";
import { getReservationSummary } from "@/lib/reservations-data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Reserva",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string; erro?: string }>;

const OK_MESSAGES: Record<string, string> = {
  nova: "Reserva enviada para a loja.",
  cancelada: "Reserva cancelada.",
};

export default async function MembroReservaDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [reservation, itemsResult] = await Promise.all([
    getReservationSummary(supabase, id, { includeSales: false }),
    supabase
      .from("reservation_items")
      .select("id, product_id, qty, unit_price, pv")
      .eq("reservation_id", id)
      .order("created_at"),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (!reservation) notFound();

  const items = itemsResult.data ?? [];
  const productIds = Array.from(new Set(items.map((item) => item.product_id)));
  const productsResult =
    productIds.length > 0
      ? await supabase
          .from("v_catalog_member")
          .select("id, name, sku")
          .in("id", productIds)
      : { data: [], error: null };

  if (productsResult.error) throw new Error(productsResult.error.message);

  const products = new Map(
    (productsResult.data ?? []).map((product) => [product.id, product]),
  );
  const okMessage = query.ok ? OK_MESSAGES[query.ok] : null;
  const steps = [
    {
      label: "Reserva enviada",
      date: reservation.created_at,
      done: true,
    },
    {
      label: "Confirmada pela loja",
      date: reservation.confirmed_at,
      done: Boolean(reservation.confirmed_at),
    },
    {
      label:
        reservation.status === "cancelled"
          ? "Cancelada"
          : reservation.status === "converted"
            ? "Convertida em compra"
            : "Concluída",
      date:
        reservation.status === "converted" ? reservation.confirmed_at : null,
      done:
        reservation.status === "converted" || reservation.status === "cancelled",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <div className="mb-4">
        <Link
          href="/membro/reservas"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Minhas reservas
        </Link>
      </div>

      {query.erro ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {query.erro}
        </p>
      ) : null}

      <PageHeader
        title={`Reserva de ${formatDate(reservation.created_at)}`}
        description="Confira os itens e acompanhe a confirmação da loja."
        actions={<ReservationStatusBadge status={reservation.status} />}
      />

      <dl className="mt-5 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {[
          ["Itens", formatInt(reservation.item_count)],
          ["Total", formatMoney(reservation.total)],
          ["PV", formatDecimal(reservation.pv_total)],
          [
            "Confirmada em",
            reservation.confirmed_at
              ? formatDate(reservation.confirmed_at)
              : "—",
          ],
        ].map(([label, value]) => (
          <div key={label} className="bg-paper px-4 py-4 sm:pl-0">
            <dt className="text-[11px] font-medium text-ink-soft">{label}</dt>
            <dd className="num mt-1.5 text-[16px] leading-none font-medium">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <h2 className="mb-2 font-serif text-[24px] leading-none font-normal">
            Itens
          </h2>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-moss pl-3 text-[10.5px] font-medium text-ink-soft">
                    Produto
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Qtd.
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Preço
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = products.get(item.product_id);
                  return (
                    <TableRow key={item.id} className="border-line/80">
                      <TableCell className="max-w-[320px] border-l-[3px] border-l-transparent py-2.5 pl-3">
                        <span className="block truncate text-[13px] font-medium">
                          {product?.name ?? "Produto indisponível"}
                        </span>
                        <span className="num block text-[10.5px] text-ink-soft">
                          {product?.sku ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 text-right text-[12px]">
                        {formatDecimal(item.qty)}
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 text-right text-[12px]">
                        {formatMoney(item.unit_price)}
                      </TableCell>
                      <TableCell className="num px-2 py-2.5 pr-3 text-right text-[12px]">
                        {formatMoney(item.qty * item.unit_price)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[13px]">
            <span className="text-ink-soft">Total da reserva</span>
            <span className="num text-[16px] font-medium">
              {formatMoney(reservation.total)}
            </span>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-serif text-[20px] leading-none font-normal">
              Acompanhamento
            </h2>
            <ol className="mt-4 flex flex-col gap-3">
              {steps.map((step) => (
                <li key={step.label} className="flex gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full ring-4",
                      step.done
                        ? "bg-moss ring-moss-soft"
                        : "bg-line ring-secondary",
                    )}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[12px]",
                        step.done ? "font-medium" : "text-ink-soft",
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="num block text-[10.5px] text-ink-soft">
                      {step.date ? formatDate(step.date) : "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            {reservation.status === "open" ? (
              <form action={cancelReservation} className="mt-4 border-t border-line pt-4">
                <input
                  type="hidden"
                  name="reservation_id"
                  value={reservation.id}
                />
                <SubmitButton
                  variant="outline"
                  pendingLabel="Cancelando…"
                  className="h-9 w-full"
                >
                  Cancelar reserva
                </SubmitButton>
              </form>
            ) : null}

            <p className="mt-4 text-[11.5px] text-ink-soft">
              {reservation.status === "open"
                ? "A loja ainda vai confirmar a disponibilidade. Você pode cancelar enquanto estiver aberta."
                : reservation.status === "confirmed"
                  ? "Reserva confirmada. Aguarde o contato da loja para a retirada."
                  : reservation.status === "converted"
                    ? "Sua reserva foi convertida em compra. Obrigado!"
                    : "Esta reserva foi cancelada."}
            </p>
          </section>

          <Button asChild variant="outline" className="h-9">
            <Link href="/membro/reservas/nova">
              <Plus />
              Nova reserva
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-9">
            <Link href="/membro">
              <ShoppingBag />
              Voltar ao catálogo
            </Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
