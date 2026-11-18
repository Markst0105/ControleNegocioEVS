import type { Metadata } from "next";
import { Suspense } from "react";
import { Coins } from "lucide-react";

import { CreditStatusBadge } from "@/components/app/credit-status-badge";
import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSession } from "@/lib/auth";
import { isCreditPaymentKind } from "@/lib/credits";
import {
  formatDate,
  formatInt,
  formatMoney,
  formatMonth,
  currentMonthISO,
  todayISO,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { PurchaseCreditsDialog } from "./purchase-form";

export const metadata: Metadata = {
  title: "Créditos",
};

type SearchParams = Promise<{ ok?: string }>;

export default async function MembroCreditosPage({
  searchParams,
}: Readonly<{
  searchParams: SearchParams;
}>) {
  const params = await searchParams;
  const session = await getSession();
  const user = session?.user;

  const supabase = await createClient();

  const [balanceResult, historyResult, methodsResult] = await Promise.all([
    user
      ? supabase
          .from("v_credit_balances")
          .select(
            "profile_id, name, email, balance, pending_amount, approved_count, last_purchase_on",
          )
          .eq("profile_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    user
      ? supabase
          .from("v_credit_purchases")
          .select(
            "id, amount, payment_method_label, purchased_on, status, source, requested_at",
          )
          .eq("profile_id", user.id)
          .order("purchased_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("payment_methods")
      .select("code, label, kind")
      .eq("active", true)
      .order("label"),
  ]);

  const firstError = [
    balanceResult.error,
    historyResult.error,
    methodsResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const balance = balanceResult.data;
  const history = historyResult.data ?? [];
  const methods = (methodsResult.data ?? [])
    .filter((method) => isCreditPaymentKind(method.kind))
    .map((method) => ({ code: method.code, label: method.label }));
  const today = todayISO();
  const firstName = session?.profile?.name.trim().split(/\s+/)[0] ?? "cliente";
  const approvedThisMonth = history
    .filter(
      (row) =>
        row.status === "approved" &&
        row.purchased_on.startsWith(currentMonthISO()),
    )
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {params.ok === "credito" ? (
          <FlashToast message="Compra enviada. A equipe confirma o pagamento e o saldo entra na sua conta." />
        ) : null}
      </Suspense>

      <PageHeader
        title="Créditos"
        description={`Olá, ${firstName}. Acompanhe seu saldo e suas compras de créditos.`}
        actions={<PurchaseCreditsDialog methods={methods} today={today} />}
      />

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3">
        <div className="bg-paper px-4 py-5 sm:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Saldo disponível
          </dt>
          <dd className="num mt-2 text-[30px] leading-none font-semibold tracking-tight whitespace-nowrap text-moss-ink sm:text-[34px]">
            {formatMoney(balance?.balance ?? 0)}
          </dd>
          <dd className="mt-2 text-[10.5px] text-ink-soft">
            {formatInt(balance?.approved_count ?? 0)}{" "}
            {(balance?.approved_count ?? 0) === 1
              ? "compra aprovada"
              : "compras aprovadas"}
          </dd>
        </div>

        <div className="bg-paper px-4 py-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Aguardando aprovação
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium whitespace-nowrap text-citrus-ink">
            {formatMoney(balance?.pending_amount ?? 0)}
          </dd>
          <dd className="mt-2 text-[10.5px] text-ink-soft">
            compras feitas pelo site
          </dd>
        </div>

        <div className="col-span-2 bg-paper px-4 py-5 sm:col-span-1">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Neste mês
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium whitespace-nowrap">
            {formatMoney(approvedThisMonth)}
          </dd>
          <dd className="mt-2 text-[10.5px] text-ink-soft">
            {formatMonth(currentMonthISO())}
          </dd>
        </div>
      </dl>

      <p className="flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-[12px] text-ink-soft">
        <Coins aria-hidden className="size-4 shrink-0 text-moss" />
        Seus créditos ficam disponíveis para pagar acessos e produtos. Use
        “Comprar créditos” para pedir um valor; a equipe confirma o pagamento e
        o saldo entra na sua conta.
      </p>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-[25px] leading-none font-normal tracking-[-0.01em] sm:text-[28px]">
            Suas compras
          </h2>
          <span className="text-xs text-ink-soft">
            {formatInt(history.length)}{" "}
            {history.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        {history.length === 0 ? (
          <Empty className="mt-3 rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                Nenhum crédito ainda
              </EmptyTitle>
              <EmptyDescription>
                Use “Comprar créditos” para pedir seu primeiro valor. A equipe
                confirma o pagamento e o registro aparece aqui.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mt-3 border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Compra
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Valor
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Pagamento
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="border-l-[3px] border-l-transparent py-3 pl-3">
                      <span className="num block text-[13px] font-medium">
                        {formatDate(row.purchased_on)}
                      </span>
                      <span className="block text-[10.5px] text-ink-soft">
                        {row.source === "staff"
                          ? "Lançado pela equipe"
                          : "Compra pelo site"}
                      </span>
                    </TableCell>
                    <TableCell className="num px-2 py-3 text-right text-[13px] font-medium whitespace-nowrap">
                      {formatMoney(row.amount)}
                    </TableCell>
                    <TableCell className="hidden px-2 py-3 text-[12px] text-ink-soft sm:table-cell">
                      {row.payment_method_label}
                    </TableCell>
                    <TableCell className="px-2 py-3 pr-3 text-right">
                      <CreditStatusBadge status={row.status} />
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
