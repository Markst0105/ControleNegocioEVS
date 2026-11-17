"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { parseDateInput, parseMoneyInput, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type MemberCreditState = {
  error: string | null;
};

function revalidateCreditViews() {
  revalidatePath("/membro");
  revalidatePath("/creditos");
  revalidatePath("/painel");
  revalidatePath("/financeiro/caixa");
  revalidatePath("/financeiro/fechamento");
}

/**
 * A member asks for credits from their own area. The request carries no profile
 * id: `request_credit` always uses auth.uid(), so a client can only create a
 * pending purchase for themselves.
 */
export async function requestMemberCredit(
  _previous: MemberCreditState,
  formData: FormData,
): Promise<MemberCreditState> {
  const session = await getSession();
  if (!session?.profile || session.profile.role !== "member") {
    return { error: "Apenas clientes podem comprar créditos por aqui." };
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
  const { error } = await supabase.rpc("request_credit", {
    p_amount: Math.round(amount * 100) / 100,
    p_payment_method_code: paymentMethod,
    p_purchased_on: purchasedOn,
    p_notes: notes || null,
  });

  if (error) {
    console.error("requestMemberCredit: falha ao pedir crédito", error);
    if (error.code === "42501") {
      return { error: "Apenas clientes podem comprar créditos por aqui." };
    }
    if (error.code === "22023" || error.code === "P0001") {
      return { error: error.message };
    }
    return { error: "Não foi possível enviar sua compra. Tente novamente." };
  }

  revalidateCreditViews();
  redirect("/membro?ok=credito");
}
