import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, RotateCcw } from "lucide-react";

import { DealBadge, OriginBadge } from "@/components/app/badges";
import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { ReceivableStatusBadge } from "@/components/app/receivable-badges";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import {
  formatDate,
  formatMoney,
  todayISO,
} from "@/lib/format";
import { hasPartialReceipt } from "@/lib/receivables";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { deleteReceiptEvent } from "../actions";
import { ReceiptForm } from "../receipt-form";
import { WriteOffForm } from "../write-off-form";

export const metadata: Metadata = {
  title: "Recebimento",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string; erro?: string }>;

const OK_MESSAGES: Record<string, string> = {
  recebido: "Recebimento registrado.",
  baixado: "Saldo baixado sem recebimento.",
  estornado: "Lançamento estornado e saldo reaberto.",
};

const ERROR_MESSAGES: Record<string, string> = {
  permissao: "Sua conta não tem permissão para esta ação.",
  invalida: "Lançamento inválido.",
  nao_encontrado: "Lançamento não encontrado ou removido.",
  estornar: "Não foi possível estornar o lançamento. Tente novamente.",
};

export default async function RecebivelPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) notFound();

  const session = await getSession();
  const isAdmin = session?.profile?.role === "admin";
  const supabase = await createClient();

  const [paymentResult, eventsResult, dealTypesResult] = await Promise.all([
    supabase
      .from("v_receivables_detail")
      .select(
        "id, sale_id, installment, due_on, amount, received_amount, written_off_amount, open_amount, status, last_received_on, written_off_on, sold_on, client_id, client_name, client_name_raw, product_name_raw, deal_type_code, payment_method_code, method_label, sale_amount, origin",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sale_payment_events")
      .select("id, kind, occurred_on, amount, note, created_at")
      .eq("sale_payment_id", id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("deal_types").select("code, label"),
  ]);

  const firstError = [
    paymentResult.error,
    eventsResult.error,
    dealTypesResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const payment = paymentResult.data;
  if (!payment) notFound();

  const events = eventsResult.data ?? [];
  const dealLabels = new Map(
    (dealTypesResult.data ?? []).map((deal) => [deal.code, deal.label]),
  );
  const openAmount = Number(payment.open_amount);
  const receivedAmount = Number(payment.received_amount);
  const writtenOffAmount = Number(payment.written_off_amount);
  const partial = hasPartialReceipt(receivedAmount, openAmount);
  const today = todayISO();
  const okMessage = query.ok ? OK_MESSAGES[query.ok] : null;
  const errorMessage = query.erro ? ERROR_MESSAGES[query.erro] : null;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <div>
        <Link
          href="/financeiro/recebiveis"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Recebíveis
        </Link>
      </div>

      <PageHeader
        title={`Parcela ${payment.installment}`}
        description={`${payment.client_name} · vence em ${formatDate(
          payment.due_on,
        )}`}
        actions={
          <ReceivableStatusBadge status={payment.status} partial={partial} />
        }
      />

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {errorMessage}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Em aberto
          </dt>
          <dd
            className={cn(
              "num mt-2 text-[26px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[30px]",
              openAmount > 0 && payment.status === "vencido"
                ? "text-rust-ink"
                : openAmount <= 0
                  ? "text-ink-soft"
                  : "text-ink",
            )}
          >
            {openAmount > 0 ? formatMoney(openAmount) : "—"}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {openAmount > 0
              ? "saldo restante desta parcela"
              : "parcela liquidada"}
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Valor da parcela
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(payment.amount)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            venda de {formatDate(payment.sold_on)}
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">Recebido</dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap text-moss-ink sm:text-[21px]">
            {receivedAmount > 0 ? formatMoney(receivedAmount) : "—"}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {payment.last_received_on
              ? `último em ${formatDate(payment.last_received_on)}`
              : "nenhum recebimento"}
          </p>
        </div>

        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
          <dt className="text-[11.5px] font-medium text-ink-soft">Baixado</dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {writtenOffAmount > 0 ? formatMoney(writtenOffAmount) : "—"}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {payment.written_off_on
              ? `baixa em ${formatDate(payment.written_off_on)}`
              : "sem baixa"}
          </p>
        </div>
      </dl>

      {openAmount > 0 ? (
        <ReceiptForm
          paymentId={payment.id}
          openAmount={openAmount}
          today={today}
        />
      ) : (
        <div className="rounded-lg border border-line bg-surface px-4 py-4 text-[12px] text-ink-soft">
          Esta parcela não tem saldo em aberto.{" "}
          {isAdmin
            ? "Para corrigir um lançamento, estorne um dos eventos no histórico abaixo."
            : "Peça a um administrador para corrigir um lançamento, se necessário."}
        </div>
      )}

      {isAdmin && openAmount > 0 ? (
        <details className="rounded-lg border border-rust/20 bg-rust-soft/30">
          <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-medium text-rust-ink">
            Baixar saldo sem recebimento
          </summary>
          <div className="border-t border-rust/15 px-4 py-4">
            <WriteOffForm
              paymentId={payment.id}
              openAmount={openAmount}
              today={today}
            />
          </div>
        </details>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <section>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Histórico
          </h2>
          <p className="mt-1 text-[11.5px] text-ink-soft">
            Recebimentos e baixas desta parcela.
          </p>

          {events.length === 0 ? (
            <p className="mt-3 border-y border-line py-8 text-center text-sm text-ink-soft">
              Nenhum recebimento registrado.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {events.map((event) => {
                const isReceipt = event.kind === "receipt";
                return (
                  <li
                    key={event.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-medium tracking-wide",
                            isReceipt
                              ? "border-moss/25 bg-moss-soft text-moss-ink"
                              : "border-line bg-surface text-ink-soft",
                          )}
                        >
                          {isReceipt ? "Recebimento" : "Baixa"}
                        </span>
                        <span className="num text-[12px] text-ink-soft">
                          {formatDate(event.occurred_on)}
                        </span>
                      </div>
                      {event.note ? (
                        <p className="mt-1 text-[12px] text-ink-soft">
                          {event.note}
                        </p>
                      ) : null}

                      {isAdmin ? (
                        <details className="mt-1.5">
                          <summary className="w-fit cursor-pointer text-[10.5px] text-rust-ink/80">
                            Estornar
                          </summary>
                          <form
                            action={deleteReceiptEvent}
                            className="mt-2 flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="payment_id"
                              value={payment.id}
                            />
                            <input
                              type="hidden"
                              name="event_id"
                              value={event.id}
                            />
                            <span className="text-[10.5px] text-ink-soft">
                              Reabre {formatMoney(event.amount)} do saldo.
                            </span>
                            <Button
                              type="submit"
                              variant="destructive"
                              size="xs"
                            >
                              <RotateCcw />
                              Confirmar estorno
                            </Button>
                          </form>
                        </details>
                      ) : null}
                    </div>

                    <span
                      className={
                        isReceipt
                          ? "num shrink-0 text-right text-[13px] font-medium text-moss-ink"
                          : "num shrink-0 text-right text-[13px] font-medium text-ink-soft"
                      }
                    >
                      {isReceipt ? "+" : ""}
                      {formatMoney(event.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Detalhes
          </h2>

          <dl className="mt-3 divide-y divide-line border-y border-line text-sm">
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Cliente</dt>
              <dd className="max-w-[13rem] text-right">
                {payment.client_id ? (
                  <Link
                    href={`/clientes/${payment.client_id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {payment.client_name}
                  </Link>
                ) : (
                  <span className="font-medium">{payment.client_name}</span>
                )}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Produto</dt>
              <dd className="max-w-[13rem] text-right">
                <span className="block truncate">
                  {payment.product_name_raw ?? "—"}
                </span>
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Venda</dt>
              <dd className="num text-right">
                {formatDate(payment.sold_on)}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Valor da venda</dt>
              <dd className="num text-right">
                {formatMoney(payment.sale_amount)}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Forma</dt>
              <dd className="text-right">{payment.method_label ?? "—"}</dd>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Negócio</dt>
              <dd className="text-right">
                <DealBadge
                  label={
                    payment.deal_type_code
                      ? dealLabels.get(payment.deal_type_code)
                      : null
                  }
                />
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-ink-soft">Origem</dt>
              <dd className="text-right">
                <OriginBadge origin={payment.origin} />
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-soft">Vencimento</dt>
              <dd className="num text-right">{formatDate(payment.due_on)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
