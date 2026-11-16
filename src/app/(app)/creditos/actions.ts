"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { parseDateInput, parseMoneyInput, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type CreditFormState = {
  error: string | null;
};

async function requireCreditManager() {
  const session = await getSession();
  if (!session?.profile) return null;

  const role = session.profile.role;
  if (role !== "admin" && role !== "operator") return null;

  return session;
}

function revalidateCreditViews() {
  revalidatePath("/creditos");
  revalidatePath("/membro");
  revalidatePath("/painel");
  revalidatePath("/financeiro/caixa");
  revalidatePath("/financeiro/fechamento");
}

/** Issues an approved credit for a registered member. */
export async function createCredit(
  _previous: CreditFormState,
  formData: FormData,
): Promise<CreditFormState> {
  const session = await requireCreditManager();
  if (!session) {
    return { error: "Sua conta não tem permissão para lançar créditos." };
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!isUuid(profileId)) {
    return { error: "Selecione um usuário cadastrado." };
  }

  const amount = parseMoneyInput(formData.get("amount"));
  if (amount === null || amount <= 0) {
    return { error: "Informe um valor maior que zero." };
  }
  if (amount > 1_000_000) {
    return { error: "O valor informado é alto demais." };
  }

  const paymentMethod = String(
    formData.get("payment_method_code") ?? "",
  ).trim();
  if (!paymentMethod) {
    return { error: "Selecione a forma de pagamento." };
  }

  const purchasedOn = parseDateInput(formData.get("purchased_on"));
  if (!purchasedOn) {
    return { error: "Informe uma data de compra válida." };
  }
  if (purchasedOn > todayISO()) {
    return { error: "A data da compra não pode estar no futuro." };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 500) {
    return { error: "A observação deve ter no máximo 500 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_credit", {
    p_profile_id: profileId,
    p_amount: Math.round(amount * 100) / 100,
    p_payment_method_code: paymentMethod,
    p_purchased_on: purchasedOn,
    p_notes: notes || null,
  });

  if (error) {
    console.error("createCredit: falha ao lançar crédito", error);
    if (error.code === "42501") {
      return { error: "Sua conta não tem permissão para lançar créditos." };
    }
    if (error.code === "22023" || error.code === "P0001") {
      return { error: error.message };
    }
    return { error: "Não foi possível lançar o crédito. Tente novamente." };
  }

  revalidateCreditViews();
  redirect("/creditos?ok=credito");
}

/** Approves or rejects a pending credit request. */
export async function reviewCredit(formData: FormData): Promise<void> {
  const session = await requireCreditManager();
  if (!session) {
    redirect("/creditos?erro=permissao");
  }

  const creditId = String(formData.get("credit_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!isUuid(creditId) || (decision !== "approve" && decision !== "reject")) {
    redirect("/creditos?erro=invalido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_credit", {
    p_credit_id: creditId,
    p_approve: decision === "approve",
  });

  if (error) {
    console.error("reviewCredit: falha ao revisar crédito", error);
    if (error.code === "42501") {
      redirect("/creditos?erro=permissao");
    }
    if (error.code === "22023" || error.code === "P0001") {
      redirect(`/creditos?erro=${encodeURIComponent(error.message)}`);
    }
    redirect("/creditos?erro=revisao");
  }

  revalidateCreditViews();
  redirect(
    decision === "approve"
      ? "/creditos?ok=aprovado"
      : "/creditos?ok=recusado",
  );
}
