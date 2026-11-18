"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import {
  entryString,
  formString,
  parseDateInput,
  parseMoneyInput,
} from "@/lib/format";
import { isPriceTierCode, type PriceTierCode } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type PurchaseFormState = {
  error: string | null;
};

export type PaymentFormState = {
  error: string | null;
};

type PurchaseLine = {
  product_id: string;
  qty: number;
  unit_cost: number;
  price_tier: PriceTierCode | null;
};

function recordNumericValue(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function parseLineTier(rawTier: unknown): PriceTierCode | null | undefined {
  if (rawTier === null || rawTier === undefined || rawTier === "") return null;
  if (typeof rawTier === "string" && isPriceTierCode(rawTier)) return rawTier;
  return undefined;
}

function parseSingleLine(item: unknown): PurchaseLine | null {
  if (!item || typeof item !== "object") return null;

  const record = item as Record<string, unknown>;
  const productId =
    typeof record.product_id === "string" ? record.product_id.trim() : "";
  const qty = parseMoneyInput(recordNumericValue(record.qty));
  const unitCost = parseMoneyInput(recordNumericValue(record.unit_cost));
  const priceTier = parseLineTier(record.price_tier);

  if (!isUuid(productId) || priceTier === undefined) return null;
  if (qty === null || qty <= 0 || unitCost === null || unitCost < 0) {
    return null;
  }

  return {
    product_id: productId,
    qty,
    unit_cost: unitCost,
    price_tier: priceTier,
  };
}

function parseLines(raw: FormDataEntryValue | null): PurchaseLine[] | null {
  const rawText = entryString(raw);
  if (!rawText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const lines: PurchaseLine[] = [];
  for (const item of parsed) {
    const line = parseSingleLine(item);
    if (!line) return null;
    lines.push(line);
  }

  return lines;
}

function canManagePurchases(role: string | undefined): boolean {
  return role === "admin" || role === "operator";
}

function resolvePurchaseRpcError(
  error: { code?: string; message: string } | null,
  permissionMessage: string,
  fallbackMessage: string,
): string {
  if (error?.code === "42501") return permissionMessage;
  if (error?.code === "22023" || error?.code === "P0001") return error.message;
  return fallbackMessage;
}

export async function createPurchase(
  _previous: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const session = await getSession();
  if (!canManagePurchases(session?.profile?.role)) {
    return { error: "Sua conta não tem permissão para registrar compras." };
  }

  const purchasedOn = parseDateInput(formData.get("purchased_on"));
  if (!purchasedOn) {
    return { error: "Informe uma data válida para a compra." };
  }

  const locationCode = formString(formData, "location_code").trim();
  if (!locationCode) {
    return { error: "Selecione o local de destino da compra." };
  }

  const supplierRaw = formString(formData, "supplier_id").trim();
  if (supplierRaw && !isUuid(supplierRaw)) {
    return { error: "Fornecedor inválido. Selecione novamente." };
  }

  const accountRaw = formString(formData, "account_id").trim();
  if (accountRaw && !isUuid(accountRaw)) {
    return { error: "Conta inválida. Selecione novamente." };
  }

  const invoice = formString(formData, "invoice_no").trim();
  if (invoice.length > 80) {
    return { error: "A nota/referência deve ter no máximo 80 caracteres." };
  }

  const notes = formString(formData, "notes").trim();
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
    return {
      error: resolvePurchaseRpcError(
        error,
        "Sua conta não tem permissão para registrar compras.",
        "Não foi possível registrar a compra. Tente novamente.",
      ),
    };
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

/**
 * Confirms (or reverts) the payment of a card purchase. Cash purchases are
 * paid on the purchase date and are not editable here.
 */
export async function setPurchasePaidOn(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const session = await getSession();
  if (!canManagePurchases(session?.profile?.role)) {
    return { error: "Sua conta não tem permissão para confirmar pagamentos." };
  }

  const purchaseId = formString(formData, "purchase_id").trim();
  if (!isUuid(purchaseId)) {
    return { error: "Compra inválida." };
  }

  const paidRaw = formString(formData, "paid_on").trim();
  const paidOn = paidRaw ? parseDateInput(paidRaw) : null;
  if (paidRaw && !paidOn) {
    return { error: "Informe uma data de pagamento válida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_purchase_paid_on", {
    p_purchase_id: purchaseId,
    p_paid_on: paidOn,
  });

  if (error) {
    console.error("setPurchasePaidOn: falha ao atualizar pagamento", error);
    return {
      error: resolvePurchaseRpcError(
        error,
        "Sua conta não tem permissão para confirmar pagamentos.",
        "Não foi possível atualizar o pagamento. Tente novamente.",
      ),
    };
  }

  revalidatePath("/compras");
  revalidatePath(`/compras/${purchaseId}`);
  revalidatePath("/painel");
  revalidatePath("/financeiro/caixa");
  revalidatePath("/financeiro/fechamento");

  redirect(
    `/compras/${purchaseId}?ok=${paidOn ? "pagamento" : "pagamento_removido"}`,
  );
}
