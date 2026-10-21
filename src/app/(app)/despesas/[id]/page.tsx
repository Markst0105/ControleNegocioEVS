import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { expenseScopeLabel } from "@/lib/expenses";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { deleteExpense } from "../actions";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = {
  title: "Editar despesa",
};

type Params = Promise<{ id: string }>;

export default async function EditarDespesaPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const session = await getSession();
  const role = session?.profile?.role ?? "operator";
  const canUsePersonal = role === "admin";

  const supabase = await createClient();
  const [expenseResult, categoriesResult, accountsResult] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id, incurred_on, description, amount, scope, category_id, account_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("expense_categories")
      .select("id, name, scope, active")
      .order("name"),
    supabase.from("accounts").select("id, name, active").order("name"),
  ]);

  const firstError = [
    expenseResult.error,
    categoriesResult.error,
    accountsResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const expense = expenseResult.data;
  if (!expense) notFound();

  const mes = expense.incurred_on.slice(0, 7);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href={`/despesas?mes=${mes}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Despesas
        </Link>
      </div>

      <PageHeader
        title="Editar despesa"
        description={`${expenseScopeLabel(expense.scope)} · ${formatDate(
          expense.incurred_on,
        )}`}
      />

      <div className="mt-6">
        <ExpenseForm
          mode="edit"
          initial={{
            id: expense.id,
            incurred_on: expense.incurred_on,
            description: expense.description,
            amount: Number(expense.amount),
            scope: expense.scope,
            category_id: expense.category_id,
            account_id: expense.account_id,
          }}
          defaultDate={expense.incurred_on}
          cancelHref={`/despesas?mes=${mes}`}
          categories={categoriesResult.data ?? []}
          accounts={accountsResult.data ?? []}
          canUsePersonal={canUsePersonal}
        />
      </div>

      <details className="mt-10 rounded-md border border-rust/20 bg-rust-soft/40 px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-rust-ink">
          Excluir despesa
        </summary>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-[11.5px] text-rust-ink/85">
            A exclusão remove este lançamento do histórico e do resultado do
            mês. Não é possível desfazer.
          </p>
          <form action={deleteExpense}>
            <input type="hidden" name="expense_id" value={expense.id} />
            <Button type="submit" variant="destructive" size="sm">
              <Trash2 />
              Excluir definitivamente
            </Button>
          </form>
        </div>
      </details>
    </div>
  );
}
