"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import {
  isManualMovementType,
  movementTypeLabel,
} from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

export type MovementFormState = {
  error: string | null;
};

export async function recordMovement(
  _previous: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const session = await getSession();
  if (
    !session?.profile ||
    (session.profile.role !== "admin" && session.profile.role !== "operator")
  ) {
    return { error: "Sua conta não tem permissão para movimentar o estoque." };
  }

  const type = String(formData.get("type") ?? "").trim();
  if (!isManualMovementType(type)) {
    return { error: "Selecione um tipo de movimentação válido." };
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  if (!isUuid(productId)) {
    return { error: "Selecione o produto." };
  }

  const movedOn = parseDateInput(formData.get("moved_on"));
  if (!movedOn) {
    return { error: "Informe uma data válida." };
  }

  const qty = parseMoneyInput(formData.get("qty"));
  if (qty === null || qty <= 0) {
    return { error: "Informe uma quantidade maior que zero." };
  }

  const locationFrom = String(formData.get("location_from") ?? "").trim();
  const locationTo = String(formData.get("location_to") ?? "").trim();

  if (
    type === "transfer" &&
    (!locationFrom || !locationTo || locationFrom === locationTo)
  ) {
    return { error: "Escolha locais de origem e destino diferentes." };
  }

  if (type === "adjustment" && Boolean(locationFrom) === Boolean(locationTo)) {
    return { error: "Escolha se o ajuste entra ou sai do estoque." };
  }

  if (type === "loan_out" && !locationFrom) {
    return { error: "Informe o local de saída." };
  }

  if ((type === "loan_in" || type === "return") && !locationTo) {
    return { error: "Informe o local de entrada." };
  }

  const counterpartyRaw = String(
    formData.get("counterparty_id") ?? "",
  ).trim();
  if (counterpartyRaw && !isUuid(counterpartyRaw)) {
    return { error: "Contraparte inválida. Selecione novamente." };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 1000) {
    return { error: "As observações devem ter no máximo 1000 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_inventory_movement", {
    p_type: type,
    p_product_id: productId,
    p_moved_on: movedOn,
    p_location_from: locationFrom || null,
    p_location_to: locationTo || null,
    p_qty: qty,
    p_counterparty_id: counterpartyRaw || null,
    p_notes: notes || null,
    p_event_label: movementTypeLabel(type),
  });

  if (error) {
    console.error("recordMovement: falha ao movimentar estoque", error);
    if (error.code === "42501") {
      return { error: "Sua conta não tem permissão para movimentar o estoque." };
    }
    if (error.code === "22023" || error.code === "P0001") {
      return { error: error.message };
    }
    return {
      error: "Não foi possível registrar a movimentação. Tente novamente.",
    };
  }

  revalidatePath("/estoque");
  revalidatePath("/estoque/movimentacoes");
  revalidatePath(`/estoque/${productId}`);

  redirect("/estoque/movimentacoes?ok=1");
}
