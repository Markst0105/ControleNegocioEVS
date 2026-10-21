"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import {
  isBusinessScope,
  isExpenseScope,
  type ExpenseScope,
} from "@/lib/expenses";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type ExpenseFormState = {
  error: string | null;
};

type ParsedExpense = {
  incurredOn: string;
  description: string;
  amount: number;
  scope: ExpenseScope;
  categoryId: string | null;
  accountId: string | null;
};

async function requireExpenseManager() {
  const session = await getSession();
  if (!session?.profile) return null;

  const role = session.profile.role;
  if (role !== "admin" && role !== "operator") {
    return null;
  }

  return {
    ...session,
    profile: { ...session.profile, role },
  };
}

function parseExpenseForm(
  formData: FormData,
  role: string,
): { ok: true; value: ParsedExpense } | { ok: false; error: string } {
  const incurredOn = parseDateInput(formData.get("incurred_on"));
  if (!incurredOn) {
    return { ok: false, error: "Informe uma data válida." };
  }

  const description = String(formData.get("description") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (description.length < 2) {
    return { ok: false, error: "Informe uma descrição para a despesa." };
  }
  if (description.length > 160) {
    return {
      ok: false,
      error: "A descrição deve ter no máximo 160 caracteres.",
    };
  }

  const amount = parseMoneyInput(formData.get("amount"));
  if (amount === null) {
    return { ok: false, error: "Informe um valor válido." };
  }
  if (amount === 0) {
    return { ok: false, error: "O valor da despesa não pode ser zero." };
  }
  if (Math.abs(amount) > 1_000_000_000) {
    return { ok: false, error: "O valor informado é alto demais." };
  }

  const scopeRaw = String(formData.get("scope") ?? "");
  if (!isExpenseScope(scopeRaw)) {
    return { ok: false, error: "Selecione o tipo da despesa." };
  }
  if (role === "operator" && !isBusinessScope(scopeRaw)) {
    return {
      ok: false,
      error: "Operadores lançam apenas despesas do negócio.",
    };
  }

  const categoryValue = String(formData.get("category_id") ?? "").trim();
  const accountValue = String(formData.get("account_id") ?? "").trim();
  const categoryRaw = categoryValue === "none" ? "" : categoryValue;
  const accountRaw = accountValue === "none" ? "" : accountValue;

  if (categoryRaw && !isUuid(categoryRaw)) {
    return { ok: false, error: "Categoria inválida." };
  }
  if (accountRaw && !isUuid(accountRaw)) {
    return { ok: false, error: "Conta inválida." };
  }

  return {
    ok: true,
    value: {
      incurredOn,
      description,
      amount,
      scope: scopeRaw,
      categoryId: categoryRaw || null,
      accountId: accountRaw || null,
    },
  };
}

async function validateLookups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string | null,
  accountId: string | null,
) {
  if (categoryId) {
    const { data, error } = await supabase
      .from("expense_categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (error || !data) {
      return "A categoria selecionada não existe mais.";
    }
  }

  if (accountId) {
    const { data, error } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();
    if (error || !data) {
      return "A conta selecionada não existe mais.";
    }
  }

  return null;
}

function revalidateExpensePaths(expenseId?: string) {
  revalidatePath("/despesas");
  if (expenseId) revalidatePath(`/despesas/${expenseId}`);
  revalidatePath("/resultado");
  revalidatePath("/painel");
}

export async function createExpense(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await requireExpenseManager();
  if (!session) {
    return { error: "Sua conta não tem permissão para lançar despesas." };
  }

  const parsed = parseExpenseForm(formData, session.profile.role);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const lookupError = await validateLookups(
    supabase,
    parsed.value.categoryId,
    parsed.value.accountId,
  );
  if (lookupError) return { error: lookupError };

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      incurred_on: parsed.value.incurredOn,
      description: parsed.value.description,
      amount: parsed.value.amount,
      scope: parsed.value.scope,
      category_id: parsed.value.categoryId,
      account_id: parsed.value.accountId,
      created_by: session.user.id,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("createExpense: falha ao inserir", error);
    return {
      error:
        error?.code === "42501"
          ? "Sua conta não pode lançar este tipo de despesa."
          : "Não foi possível lançar a despesa. Tente novamente.",
    };
  }

  revalidateExpensePaths(data.id);
  redirect(
    `/despesas?mes=${parsed.value.incurredOn.slice(0, 7)}&ok=novo`,
  );
}

export async function updateExpense(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await requireExpenseManager();
  if (!session) {
    return { error: "Sua conta não tem permissão para editar despesas." };
  }

  const expenseId = String(formData.get("expense_id") ?? "").trim();
  if (!isUuid(expenseId)) {
    return { error: "Despesa inválida." };
  }

  const parsed = parseExpenseForm(formData, session.profile.role);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const lookupError = await validateLookups(
    supabase,
    parsed.value.categoryId,
    parsed.value.accountId,
  );
  if (lookupError) return { error: lookupError };

  const { data, error } = await supabase
    .from("expenses")
    .update({
      incurred_on: parsed.value.incurredOn,
      description: parsed.value.description,
      amount: parsed.value.amount,
      scope: parsed.value.scope,
      category_id: parsed.value.categoryId,
      account_id: parsed.value.accountId,
    })
    .eq("id", expenseId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("updateExpense: falha ao atualizar", error);
    return {
      error:
        error.code === "42501"
          ? "Sua conta não pode alterar esta despesa."
          : "Não foi possível salvar a despesa. Tente novamente.",
    };
  }
  if (!data) {
    return {
      error:
        "Despesa não encontrada ou sem permissão para alterá-la. Recarregue a página.",
    };
  }

  revalidateExpensePaths(expenseId);
  redirect(
    `/despesas?mes=${parsed.value.incurredOn.slice(0, 7)}&ok=editado`,
  );
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const session = await requireExpenseManager();
  if (!session) {
    redirect("/despesas?erro=permissao");
  }

  const expenseId = String(formData.get("expense_id") ?? "").trim();
  if (!isUuid(expenseId)) {
    redirect("/despesas?erro=invalida");
  }

  const supabase = await createClient();
  const { data: expense, error: findError } = await supabase
    .from("expenses")
    .select("id, incurred_on")
    .eq("id", expenseId)
    .maybeSingle();

  if (findError || !expense) {
    redirect("/despesas?erro=nao_encontrada");
  }

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (error) {
    console.error("deleteExpense: falha ao excluir", error);
    redirect("/despesas?erro=excluir");
  }

  const mes = expense.incurred_on.slice(0, 7);
  revalidateExpensePaths(expenseId);
  redirect(`/despesas?mes=${mes}&ok=excluido`);
}
