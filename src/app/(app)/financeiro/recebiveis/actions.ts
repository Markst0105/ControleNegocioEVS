"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type ReceiptFormState = {
  error: string | null;
};

export type WriteOffFormState = {
  error: string | null;
};

function revalidateReceivablePaths(paymentId?: string) {
  revalidatePath("/financeiro/recebiveis");
  if (paymentId) revalidatePath(`/financeiro/recebiveis/${paymentId}`);
  revalidatePath("/painel");
  revalidatePath("/clientes");
}

function noteError(note: string, maxLength = 500): string | null {
  if (note.length > maxLength) {
    return `A observação deve ter no máximo ${maxLength} caracteres.`;
  }
  return null;
}

export async function receiveReceivable(
  _previous: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const session = await getSession();
  const role = session?.profile?.role;
  if (role !== "admin" && role !== "operator") {
    return { error: "Sua conta não tem permissão para registrar recebimentos." };
  }

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  if (!isUuid(paymentId)) {
    return { error: "Parcela inválida." };
  }

  const receivedOn = parseDateInput(formData.get("received_on"));
  if (!receivedOn) {
    return { error: "Informe uma data válida para o recebimento." };
  }

  const amount = parseMoneyInput(formData.get("amount"));
  if (amount === null || amount <= 0) {
    return { error: "Informe um valor maior que zero." };
  }
  if (amount > 1_000_000_000) {
    return { error: "O valor informado é alto demais." };
  }

  const note = String(formData.get("note") ?? "").trim();
  const validationError = noteError(note);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_sale_payment", {
    p_sale_payment_id: paymentId,
    p_amount: amount,
    p_received_on: receivedOn,
    p_note: note || null,
  });

  if (error) {
    console.error("receiveReceivable: falha ao registrar recebimento", error);
    if (error.code === "42501") {
      return { error: "Sua conta não tem permissão para registrar recebimentos." };
    }
    if (error.code === "22023" || error.code === "P0001") {
      return { error: error.message };
    }
    if (error.code === "P0002") {
      return { error: "Parcela não encontrada ou removida. Recarregue a página." };
    }
    return {
      error: "Não foi possível registrar o recebimento. Tente novamente.",
    };
  }

  revalidateReceivablePaths(paymentId);
  redirect(`/financeiro/recebiveis/${paymentId}?ok=recebido`);
}

export async function writeOffReceivable(
  _previous: WriteOffFormState,
  formData: FormData,
): Promise<WriteOffFormState> {
  const session = await getSession();
  if (session?.profile?.role !== "admin") {
    return { error: "Apenas administradores podem baixar um saldo." };
  }

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  if (!isUuid(paymentId)) {
    return { error: "Parcela inválida." };
  }

  const writtenOffOn = parseDateInput(formData.get("written_off_on"));
  if (!writtenOffOn) {
    return { error: "Informe uma data válida para a baixa." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) {
    return { error: "Informe o motivo da baixa." };
  }
  const validationError = noteError(reason);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("write_off_sale_payment", {
    p_sale_payment_id: paymentId,
    p_written_off_on: writtenOffOn,
    p_reason: reason,
  });

  if (error) {
    console.error("writeOffReceivable: falha ao baixar saldo", error);
    if (error.code === "42501") {
      return { error: "Apenas administradores podem baixar um saldo." };
    }
    if (error.code === "22023" || error.code === "P0001") {
      return { error: error.message };
    }
    if (error.code === "P0002") {
      return { error: "Parcela não encontrada ou removida. Recarregue a página." };
    }
    return { error: "Não foi possível baixar o saldo. Tente novamente." };
  }

  revalidateReceivablePaths(paymentId);
  redirect(`/financeiro/recebiveis/${paymentId}?ok=baixado`);
}

export async function deleteReceiptEvent(formData: FormData): Promise<void> {
  const session = await getSession();
  if (session?.profile?.role !== "admin") {
    redirect("/financeiro/recebiveis?erro=permissao");
  }

  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!isUuid(paymentId) || !isUuid(eventId)) {
    redirect("/financeiro/recebiveis?erro=invalida");
  }

  const supabase = await createClient();
  const { data: event, error: findError } = await supabase
    .from("sale_payment_events")
    .select("id, sale_payment_id")
    .eq("id", eventId)
    .eq("sale_payment_id", paymentId)
    .maybeSingle();

  if (findError || !event) {
    redirect(`/financeiro/recebiveis/${paymentId}?erro=nao_encontrado`);
  }

  const { error } = await supabase
    .from("sale_payment_events")
    .delete()
    .eq("id", eventId)
    .eq("sale_payment_id", paymentId);

  if (error) {
    console.error("deleteReceiptEvent: falha ao estornar", error);
    redirect(`/financeiro/recebiveis/${paymentId}?erro=estornar`);
  }

  revalidateReceivablePaths(paymentId);
  redirect(`/financeiro/recebiveis/${paymentId}?ok=estornado`);
}

export async function reconcileReceivables(formData: FormData): Promise<void> {
  const session = await getSession();
  if (session?.profile?.role !== "admin") {
    redirect("/financeiro/recebiveis?erro=permissao");
  }

  if (formData.get("confirmo") !== "on") {
    redirect("/financeiro/recebiveis?erro=confirmar");
  }

  const cutoff = parseDateInput(formData.get("cutoff"));
  if (!cutoff) {
    redirect("/financeiro/recebiveis?erro=data");
  }

  const mode = String(formData.get("mode") ?? "").trim();
  if (mode !== "receipt" && mode !== "write_off") {
    redirect("/financeiro/recebiveis?erro=modo");
  }

  const note = String(formData.get("note") ?? "").trim();
  const validationError = noteError(note);
  if (validationError) {
    redirect("/financeiro/recebiveis?erro=observacao");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconcile_sale_payments_before", {
    p_cutoff: cutoff,
    p_mode: mode,
    p_note: note || null,
  });

  if (error) {
    console.error("reconcileReceivables: falha ao reconciliar", error);
    if (error.code === "42501") {
      redirect("/financeiro/recebiveis?erro=permissao");
    }
    if (error.code === "22023" || error.code === "P0001") {
      redirect("/financeiro/recebiveis?erro=reconciliar");
    }
    redirect("/financeiro/recebiveis?erro=reconciliar");
  }

  const result = data?.[0];
  const count = Number(result?.reconciled_count ?? 0);

  revalidateReceivablePaths();
  redirect(
    count === 0
      ? "/financeiro/recebiveis?ok=lote_vazio"
      : mode === "receipt"
        ? "/financeiro/recebiveis?ok=lote_recebido"
        : "/financeiro/recebiveis?ok=lote_baixado",
  );
}
