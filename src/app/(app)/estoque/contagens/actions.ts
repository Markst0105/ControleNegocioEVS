"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type CountFormState = {
  error: string | null;
};

type CountLine = {
  product_id: string;
  counted_qty: number;
};

function parseLines(raw: FormDataEntryValue | null): CountLine[] | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const lines: CountLine[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    const productId = String(record.product_id ?? "").trim();
    const counted = parseMoneyInput(String(record.counted_qty ?? ""));

    if (!isUuid(productId)) return null;
    if (counted === null || counted < 0) return null;

    lines.push({ product_id: productId, counted_qty: counted });
  }

  return lines;
}

export async function createStockCount(
  _previous: CountFormState,
  formData: FormData,
): Promise<CountFormState> {
  const session = await getSession();
  if (
    !session?.profile ||
    (session.profile.role !== "admin" && session.profile.role !== "operator")
  ) {
    return { error: "Sua conta não tem permissão para registrar contagens." };
  }

  const countedOn = parseDateInput(formData.get("counted_on"));
  if (!countedOn) {
    return { error: "Informe uma data válida para a contagem." };
  }

  const locationCode = String(formData.get("location_code") ?? "").trim();
  if (!locationCode) {
    return { error: "Selecione o local da contagem." };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 1000) {
    return { error: "As observações devem ter no máximo 1000 caracteres." };
  }

  const lines = parseLines(formData.get("items"));
  if (!lines) {
    return {
      error: "Adicione pelo menos um produto com quantidade contada válida.",
    };
  }

  if (new Set(lines.map((line) => line.product_id)).size !== lines.length) {
    return { error: "Cada produto deve aparecer uma única vez na contagem." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_stock_count", {
    p_counted_on: countedOn,
    p_location_code: locationCode,
    p_notes: notes || null,
    p_items: lines as unknown as Json,
  });

  if (error || !data) {
    console.error("createStockCount: falha ao registrar contagem", error);
    if (error?.code === "42501") {
      return { error: "Sua conta não tem permissão para registrar contagens." };
    }
    if (error?.code === "22023" || error?.code === "P0001") {
      return { error: error.message };
    }
    return { error: "Não foi possível registrar a contagem. Tente novamente." };
  }

  revalidatePath("/estoque");
  revalidatePath("/estoque/contagens");
  revalidatePath("/estoque/movimentacoes");
  for (const productId of new Set(lines.map((line) => line.product_id))) {
    revalidatePath(`/estoque/${productId}`);
  }

  redirect(`/estoque/contagens/${data}?ok=novo`);
}
