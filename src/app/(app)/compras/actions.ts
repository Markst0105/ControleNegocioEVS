"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type PurchaseFormState = {
  error: string | null;
};

type PurchaseLine = {
  product_id: string;
  qty: number;
  unit_cost: number;
};

function parseLines(raw: FormDataEntryValue | null): PurchaseLine[] | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const lines: PurchaseLine[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    const productId = String(record.product_id ?? "").trim();
    const qty = parseMoneyInput(String(record.qty ?? ""));
    const unitCost = parseMoneyInput(String(record.unit_cost ?? ""));

    if (!isUuid(productId)) return null;
    if (qty === null || qty <= 0) return null;
    if (unitCost === null || unitCost < 0) return null;

    lines.push({ product_id: productId, qty, unit_cost: unitCost });
  }

  return lines;
}

export async function createPurchase(
  _previous: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const session = await getSession();
  if (
    !session?.profile ||
    (session.profile.role !== "admin" && session.profile.role !== "operator")
  ) {
    return { error: "Sua conta não tem permissão para registrar compras." };
  }

  const purchasedOn = parseDateInput(formData.get("purchased_on"));
  if (!purchasedOn) {
    return { error: "Informe uma data válida para a compra." };
  }

  const locationCode = String(formData.get("location_code") ?? "").trim();
  if (!locationCode) {
    return { error: "Selecione o local de destino da compra." };
  }

  const supplierRaw = String(formData.get("supplier_id") ?? "").trim();
  if (supplierRaw && !isUuid(supplierRaw)) {
    return { error: "Fornecedor inválido. Selecione novamente." };
  }

  const accountRaw = String(formData.get("account_id") ?? "").trim();
  if (accountRaw && !isUuid(accountRaw)) {
    return { error: "Conta inválida. Selecione novamente." };
  }

  const invoice = String(formData.get("invoice_no") ?? "").trim();
  if (invoice.length > 80) {
    return { error: "A nota/referência deve ter no máximo 80 caracteres." };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 1000) {
    return { error: "As observações devem ter no máximo 1000 caracteres." };
  }

  const lines = parseLines(formData.get("items"));
  if (!lines) {
    return {
      error:
        "Adicione pelo menos um produto com quantidade e custo unitário válidos.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase", {
    p_purchased_on: purchasedOn,
    p_supplier_id: supplierRaw || null,
    p_account_id: accountRaw || null,
    p_location_code: locationCode,
    p_invoice_no: invoice || null,
    p_notes: notes || null,
    p_items: lines as unknown as Json,
  });

  if (error || !data) {
    console.error("createPurchase: falha ao registrar compra", error);
    if (error?.code === "42501") {
      return { error: "Sua conta não tem permissão para registrar compras." };
    }
    if (error?.code === "22023" || error?.code === "P0001") {
      return { error: error.message };
    }
    return { error: "Não foi possível registrar a compra. Tente novamente." };
  }

  revalidatePath("/estoque");
  revalidatePath("/compras");
  revalidatePath("/painel");
  revalidatePath("/estoque/movimentacoes");
  for (const productId of new Set(lines.map((line) => line.product_id))) {
    revalidatePath(`/estoque/${productId}`);
  }

  redirect(`/compras/${data}?ok=novo`);
}
