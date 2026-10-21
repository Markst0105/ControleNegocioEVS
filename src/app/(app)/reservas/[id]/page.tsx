import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShoppingBag } from "lucide-react";
import { Suspense } from "react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { ReservationStatusBadge } from "@/components/app/reservation-status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelReservation,
  confirmReservation,
  convertReservation,
} from "@/lib/actions/reservations";
import { isUuid } from "@/lib/clients";
import {
  formatDate,
  formatDecimal,
  formatInt,
  formatMoney,
  todayISO,
} from "@/lib/format";
import {
  reservationCanCancel,
  reservationCanConfirm,
  reservationCanConvert,
} from "@/lib/reservations";
import { getReservationSummary } from "@/lib/reservations-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reserva",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  ok?: string;
  erro?: string;
}>;

const OK_MESSAGES: Record<string, string> = {
  nova: "Reserva criada.",
  confirmada: "Reserva confirmada.",
  cancelada: "Reserva cancelada.",
  convertida: "Reserva convertida em venda.",
};

const DEAL_ORDER: Record<string, number> = {
  sale: 0,
  discount: 1,
  negocio: 2,
};

const PAYMENT_ORDER: Record<string, number> = {
  cash: 0,
  pix: 1,
  debit: 2,
  voucher: 3,
  credit: 4,
  ticket: 5,
  exception: 6,
  financial: 7,
};

export default async function ReservaDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [reservation, itemsResult, methodsResult, dealTypesResult] =
    await Promise.all([
      getReservationSummary(supabase, id, { includeSales: true }),
      supabase
        .from("reservation_items")
        .select("id, product_id, qty, unit_price, pv")
        .eq("reservation_id", id)
        .order("created_at"),
      supabase
        .from("payment_methods")
        .select("code, label, kind, settlement_days")
        .eq("active", true),
      supabase
        .from("deal_types")
        .select("code, label, kind")
        .eq("active", true)
        .in("kind", ["sale", "negocio", "discount"]),
    ]);

  const firstError = [
    itemsResult.error,
    methodsResult.error,
    dealTypesResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  if (!reservation) notFound();

  const items = itemsResult.data ?? [];
  const productIds = Array.from(new Set(items.map((item) => item.product_id)));
  const productsResult =
    productIds.length > 0
      ? await supabase
          .from("products")
          .select("id, name, sku")
          .in("id", productIds)
      : { data: [], error: null };

  if (productsResult.error) throw new Error(productsResult.error.message);

  const products = new Map(
    (productsResult.data ?? []).map((product) => [product.id, product]),
  );
  const paymentMethods = [...(methodsResult.data ?? [])].sort(
    (a, b) =>
      (PAYMENT_ORDER[a.kind] ?? 99) - (PAYMENT_ORDER[b.kind] ?? 99) ||
      a.code.localeCompare(b.code),
  );
  const dealTypes = [...(dealTypesResult.data ?? [])].sort(
    (a, b) =>
      (DEAL_ORDER[a.kind] ?? 99) - (DEAL_ORDER[b.kind] ?? 99) ||
      a.label.localeCompare(b.label),
  );
  const defaultPayment =
    paymentMethods.find((method) => method.code === "P")?.code ??
    paymentMethods[0]?.code;
  const defaultDeal =
    dealTypes.find((deal) => deal.code === "0")?.code ?? dealTypes[0]?.code;
  const okMessage = query.ok ? OK_MESSAGES[query.ok] : null;
  const canConfirm = reservationCanConfirm(reservation.status);
  const canCancel = reservationCanCancel(reservation.status);
  const canConvert = reservationCanConvert(reservation.status);

  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <div className="mb-4">
        <Link
          href="/reservas"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Reservas
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
        title={reservation.member_name}
        description={`Reserva criada em ${formatDate(reservation.created_at)}`}
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

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                      <TableCell className="max-w-[360px] border-l-[3px] border-l-transparent py-2.5 pl-3">
                        <span className="block truncate text-[13px] font-medium">
                          {product?.name ?? "Produto removido"}
                        </span>
                        <span className="num block text-[10.5px] text-ink-soft">
                          {product?.sku ?? item.product_id}
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
              Situação
            </h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <ReservationStatusBadge status={reservation.status} />
              <span className="num text-[11px] text-ink-soft">
                {formatDate(reservation.created_at)}
              </span>
            </div>

            {canConfirm || canCancel ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {canConfirm ? (
                  <form action={confirmReservation}>
                    <input
                      type="hidden"
                      name="reservation_id"
                      value={reservation.id}
                    />
                    <SubmitButton pendingLabel="Confirmando…" className="h-9">
                      Confirmar reserva
                    </SubmitButton>
                  </form>
                ) : null}
                {canCancel ? (
                  <form action={cancelReservation}>
                    <input
                      type="hidden"
                      name="reservation_id"
                      value={reservation.id}
                    />
                    <SubmitButton
                      variant="outline"
                      pendingLabel="Cancelando…"
                      className="h-9"
                    >
                      Cancelar
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ) : null}

            {reservation.status === "cancelled" ? (
              <p className="mt-3 text-[11.5px] text-ink-soft">
                Esta reserva foi cancelada e não pode mais ser alterada.
              </p>
            ) : null}

            {reservation.status === "converted" ? (
              <div className="mt-3 border-t border-line pt-3 text-[12px] text-ink-soft">
                <p>
                  Convertida em {formatInt(reservation.sale_count)} venda(s),
                  somando {formatMoney(reservation.sales_total)}.
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8"
                >
                  <Link
                    href={`/vendas?q=${encodeURIComponent(reservation.member_name)}`}
                  >
                    <ShoppingBag />
                    Ver vendas
                  </Link>
                </Button>
              </div>
            ) : null}
          </section>

          {canConvert ? (
            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-serif text-[20px] leading-none font-normal">
                Converter em venda
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-soft">
                Cria uma venda por item, baixa do estoque e gera as parcelas
                quando a forma de pagamento pede.
              </p>

              <form
                action={convertReservation}
                className="mt-4 flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="reservation_id"
                  value={reservation.id}
                />

                <div className="grid gap-1.5">
                  <Label
                    htmlFor="sold_on"
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    Data da venda
                  </Label>
                  <input
                    id="sold_on"
                    name="sold_on"
                    type="date"
                    defaultValue={todayISO()}
                    required
                    className="h-9 rounded-md border border-line bg-paper px-2 text-[12px]"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label
                    htmlFor="origin"
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    Origem
                  </Label>
                  <Select name="origin" defaultValue="EVS">
                    <SelectTrigger id="origin" className="h-9 bg-paper">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EVS">EVS</SelectItem>
                      <SelectItem value="CASA">CASA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label
                    htmlFor="payment_method_code"
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    Forma de pagamento
                  </Label>
                  <Select
                    name="payment_method_code"
                    defaultValue={defaultPayment}
                  >
                    <SelectTrigger
                      id="payment_method_code"
                      className="h-9 bg-paper"
                    >
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.code} value={method.code}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label
                    htmlFor="deal_type_code"
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    Tipo de negócio
                  </Label>
                  <Select name="deal_type_code" defaultValue={defaultDeal}>
                    <SelectTrigger id="deal_type_code" className="h-9 bg-paper">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {dealTypes.map((deal) => (
                        <SelectItem key={deal.code} value={deal.code}>
                          {deal.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <SubmitButton
                  pendingLabel="Convertendo…"
                  className="mt-1 h-9 w-full font-bold"
                >
                  Converter reserva
                </SubmitButton>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
