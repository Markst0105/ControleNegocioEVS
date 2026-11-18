import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Check, X } from "lucide-react";

import { CreditStatusBadge } from "@/components/app/credit-status-badge";
import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
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
  currentMonthISO,
  formatDate,
  formatInt,
  formatMoney,
  formatMonth,
  monthFirstDay,
  nextMonthFirstDay,
  todayISO,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { reviewCredit } from "./actions";
import { CreditForm } from "./credit-form";

export const metadata: Metadata = {
  title: "Créditos",
};

type SearchParams = Promise<{ ok?: string; erro?: string }>;

const OK_MESSAGES: Record<string, string> = {
  credito: "Crédito lançado.",
  aprovado: "Compra aprovada e creditada.",
  recusado: "Compra recusada.",
};

const ERROR_MESSAGES: Record<string, string> = {
  permissao: "Sua conta não tem permissão para revisar créditos.",
  invalido: "Compra inválida.",
  revisao: "Não foi possível revisar a compra. Tente novamente.",
};

type PendingCreditRow = {
  id: string;
  profile_name: string;
  profile_email: string | null;
  amount: number;
  payment_method_label: string;
  purchased_on: string;
  requested_at: string;
};

type CreditBalanceRow = {
  profile_id: string;
  name: string;
  email: string | null;
  balance: number;
  pending_amount: number | null;
  approved_count: number;
  last_purchase_on: string | null;
};

type RecentCreditRow = {
  id: string;
  profile_name: string;
  profile_email: string | null;
  amount: number;
  payment_method_label: string;
  purchased_on: string;
  status: string;
  source: string;
  reviewed_at: string | null;
};

function PendingPurchasesSection({
  pending,
}: Readonly<{ pending: PendingCreditRow[] }>) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
        <div>
          <h2 className="font-serif text-[20px] leading-none font-normal">
            Compras para aprovar
          </h2>
          <p className="mt-1.5 text-[11px] text-ink-soft">
            Compras feitas pelo site ficam pendentes até a confirmação.
          </p>
        </div>
        {pending.length > 0 ? <CreditStatusBadge status="pending" /> : null}
      </header>

      {pending.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-soft">
          Nenhuma compra aguardando aprovação.
        </p>
      ) : (
        <div className="border-t border-line/70">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-4 text-[10.5px] font-medium text-ink-soft">
                  Usuário
                </TableHead>
                <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                  Valor
                </TableHead>
                <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                  Pagamento
                </TableHead>
                <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft md:table-cell">
                  Compra
                </TableHead>
                <TableHead className="h-9 pr-4 text-right text-[10.5px] font-medium text-ink-soft">
                  Ação
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.id} className="border-line/80">
                  <TableCell className="py-3 pl-4">
                    <span className="block text-[13px] font-medium">
                      {row.profile_name}
                    </span>
                    {row.profile_email ? (
                      <span className="block truncate text-[10.5px] text-ink-soft">
                        {row.profile_email}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="num px-2 py-3 text-right text-[13px] font-medium whitespace-nowrap">
                    {formatMoney(row.amount)}
                  </TableCell>
                  <TableCell className="hidden px-2 py-3 text-[12px] text-ink-soft sm:table-cell">
                    {row.payment_method_label}
                  </TableCell>
                  <TableCell className="num hidden px-2 py-3 text-[12px] text-ink-soft md:table-cell">
                    {formatDate(row.purchased_on)}
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <form action={reviewCredit}>
                        <input
                          type="hidden"
                          name="credit_id"
                          value={row.id}
                        />
                        <input
                          type="hidden"
                          name="decision"
                          value="approve"
                        />
                        <SubmitButton
                          size="sm"
                          className="h-7 px-2 text-[11px] font-bold"
                          pendingLabel="Aprovando…"
                        >
                          <Check />
                          Aprovar
                        </SubmitButton>
                      </form>
                      <form action={reviewCredit}>
                        <input
                          type="hidden"
                          name="credit_id"
                          value={row.id}
                        />
                        <input type="hidden" name="decision" value="reject" />
                        <SubmitButton
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          pendingLabel="Recusando…"
                        >
                          <X />
                          Recusar
                        </SubmitButton>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function BalancesSection({
  balances,
}: Readonly<{ balances: CreditBalanceRow[] }>) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line/70 px-4 py-3">
        <h2 className="font-serif text-[20px] leading-none font-normal">
          Saldos
        </h2>
        <p className="mt-1.5 text-[11px] text-ink-soft">
          Créditos aprovados e ainda não usados.
        </p>
      </header>
      {balances.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-soft">
          Nenhum cliente cadastrado ainda. As contas criadas na tela de login
          aparecem aqui.
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {balances.slice(0, 12).map((row) => (
            <li
              key={row.profile_id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium">
                  {row.name}
                </span>
                <span className="block truncate text-[10.5px] text-ink-soft">
                  {row.email ?? "sem e-mail"}
                </span>
              </div>
              <div className="text-right">
                <span className="num block text-[12.5px] font-medium whitespace-nowrap">
                  {formatMoney(row.balance)}
                </span>
                {Number(row.pending_amount ?? 0) > 0 ? (
                  <span className="num block text-[10px] text-citrus-ink">
                    {formatMoney(row.pending_amount)} pendente
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {balances.length > 12 ? (
        <p className="border-t border-line/70 px-4 py-2 text-[10.5px] text-ink-soft">
          Mostrando os 12 maiores saldos de {formatInt(balances.length)}.
        </p>
      ) : null}
    </section>
  );
}

function CreditHistorySection({
  recent,
}: Readonly<{ recent: RecentCreditRow[] }>) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-[25px] leading-none font-normal tracking-[-0.01em] sm:text-[28px]">
          Histórico de créditos
        </h2>
        <span className="text-xs text-ink-soft">
          últimos {formatInt(recent.length)}
        </span>
      </div>

      {recent.length === 0 ? (
        <Empty className="mt-3 rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              Nenhum crédito ainda
            </EmptyTitle>
            <EmptyDescription>
              Compras aprovadas e créditos lançados aparecem aqui.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" className="font-bold">
            <Link href="/creditos">Atualizar</Link>
          </Button>
        </Empty>
      ) : (
        <div className="mt-3 border-t border-ink/70">
          <Table>
            <TableHeader>
              <TableRow className="border-b-ink/70 hover:bg-transparent">
                <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                  Usuário
                </TableHead>
                <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                  Valor
                </TableHead>
                <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                  Pagamento
                </TableHead>
                <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft md:table-cell">
                  Compra
                </TableHead>
                <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-line/80 hover:bg-moss-soft/25"
                >
                  <TableCell className="border-l-[3px] border-l-transparent py-2.5 pl-3">
                    <span className="block truncate text-[12.5px] font-medium">
                      {row.profile_name}
                    </span>
                    <span className="block truncate text-[10.5px] text-ink-soft">
                      {row.source === "staff" ? "Lançado pela equipe" : "Site"}
                    </span>
                  </TableCell>
                  <TableCell className="num px-2 py-2.5 text-right text-[12.5px] font-medium whitespace-nowrap">
                    {formatMoney(row.amount)}
                  </TableCell>
                  <TableCell className="hidden px-2 py-2.5 text-[12px] text-ink-soft sm:table-cell">
                    {row.payment_method_label}
                  </TableCell>
                  <TableCell className="num hidden px-2 py-2.5 text-[12px] text-ink-soft md:table-cell">
                    {formatDate(row.purchased_on)}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 pr-3 text-right">
                    <CreditStatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export default async function CreditosPage({
  searchParams,
}: Readonly<{
  searchParams: SearchParams;
}>) {
  const params = await searchParams;
  const session = await getSession();
  const today = todayISO();

  if (
    !session?.profile ||
    (session.profile.role !== "admin" && session.profile.role !== "operator")
  ) {
    return (
      <Empty className="rounded-none border-y border-line bg-paper py-16">
        <EmptyHeader>
          <EmptyTitle className="font-serif text-[24px] font-normal">
            Acesso restrito
          </EmptyTitle>
          <EmptyDescription>
            Apenas administradores e operadores gerenciam créditos.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const supabase = await createClient();
  const month = currentMonthISO();
  const monthStart = monthFirstDay(month);
  const monthEnd = nextMonthFirstDay(month);

  const [
    pendingResult,
    balancesResult,
    recentResult,
    methodsResult,
    monthResult,
  ] = await Promise.all([
    supabase
      .from("v_credit_purchases")
      .select(
        "id, profile_name, profile_email, amount, payment_method_label, purchased_on, requested_at",
      )
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(100),
    supabase
      .from("v_credit_balances")
      .select(
        "profile_id, name, email, balance, pending_amount, approved_count, last_purchase_on",
      )
      .order("balance", { ascending: false })
      .order("name"),
    supabase
      .from("v_credit_purchases")
      .select(
        "id, profile_name, profile_email, amount, payment_method_label, purchased_on, status, source, reviewed_at",
      )
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("payment_methods")
      .select("code, label, kind")
      .eq("active", true)
      .order("label"),
    supabase
      .from("v_credit_purchases")
      .select("amount")
      .eq("status", "approved")
      .gte("purchased_on", monthStart)
      .lt("purchased_on", monthEnd),
  ]);

  const firstError = [
    pendingResult.error,
    balancesResult.error,
    recentResult.error,
    methodsResult.error,
    monthResult.error,
  ].find(Boolean);

  if (firstError) throw new Error(firstError.message);

  const pending = pendingResult.data ?? [];
  const balances = balancesResult.data ?? [];
  const recent = recentResult.data ?? [];
  const methods = (methodsResult.data ?? []).filter((method) =>
    isCreditPaymentKind(method.kind),
  );

  const pendingTotal = pending.reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  );
  const totalBalance = balances.reduce(
    (sum, row) => sum + Number(row.balance ?? 0),
    0,
  );
  const withBalance = balances.filter(
    (row) => Number(row.balance ?? 0) > 0,
  ).length;
  const monthTotal = (monthResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0,
  );
  const members = balances.map((row) => ({
    id: row.profile_id,
    name: row.name,
    email: row.email,
  }));

  const okMessage = params.ok ? OK_MESSAGES[params.ok] : null;
  const errorMessage = params.erro
    ? (ERROR_MESSAGES[params.erro] ?? params.erro)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <PageHeader
        title="Créditos"
        description="Aprove compras feitas pelo site e lance créditos para usuários cadastrados."
      />

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {errorMessage}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4">
        <div className="bg-paper px-4 py-4 lg:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">
            Saldo em créditos
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(totalBalance)}
          </dd>
          <dd className="mt-1 text-[10.5px] text-ink-soft">
            {formatInt(withBalance)}{" "}
            {withBalance === 1 ? "usuário com saldo" : "usuários com saldo"}
          </dd>
        </div>

        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Aguardando aprovação
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium text-citrus-ink">
            {formatInt(pending.length)}
          </dd>
          <dd className="num mt-1 text-[10.5px] text-ink-soft">
            {formatMoney(pendingTotal)}
          </dd>
        </div>

        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Emitido no mês
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(monthTotal)}
          </dd>
          <dd className="mt-1 text-[10.5px] text-ink-soft">
            {formatMonth(month)}
          </dd>
        </div>

        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Usuários cadastrados
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(balances.length)}
          </dd>
          <dd className="mt-1 text-[10.5px] text-ink-soft">
            contas de cliente
          </dd>
        </div>
      </dl>

      <PendingPurchasesSection pending={pending} />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <CreditForm members={members} methods={methods} today={today} />
        <BalancesSection balances={balances} />
      </div>

      <CreditHistorySection recent={recent} />
    </div>
  );
}
