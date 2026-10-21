import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/auth";
import {
  currentMonthISO,
  isMonthISO,
  monthFirstDay,
  todayISO,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = {
  title: "Nova despesa",
};

type SearchParams = Promise<{ mes?: string }>;

export default async function NovaDespesaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  const role = session?.profile?.role ?? "operator";
  const canUsePersonal = role === "admin";

  const currentMonth = currentMonthISO();
  const requestedMonth = isMonthISO(params.mes) ? params.mes : currentMonth;
  const defaultDate =
    requestedMonth === currentMonth ? todayISO() : monthFirstDay(requestedMonth);

  const supabase = await createClient();
  const [categoriesResult, accountsResult] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, name, scope, active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("accounts")
      .select("id, name, active")
      .eq("active", true)
      .order("name"),
  ]);

  const firstError = [categoriesResult.error, accountsResult.error].find(
    Boolean,
  );
  if (firstError) throw new Error(firstError.message);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href={`/despesas?mes=${requestedMonth}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Despesas
        </Link>
      </div>

      <PageHeader
        title="Nova despesa"
        description={
          canUsePersonal
            ? "Registre um custo do negócio ou uma despesa pessoal."
            : "Registre um custo do negócio."
        }
      />

      <div className="mt-6">
        <ExpenseForm
          mode="create"
          defaultDate={defaultDate}
          cancelHref={`/despesas?mes=${requestedMonth}`}
          categories={categoriesResult.data ?? []}
          accounts={accountsResult.data ?? []}
          canUsePersonal={canUsePersonal}
        />
      </div>
    </div>
  );
}
