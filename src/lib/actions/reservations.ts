"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type ReservationFormState = {
  error: string | null;
};

type ReservationLine = {
  product_id: string;
  qty: number;
};

function parseLines(raw: FormDataEntryValue | null): ReservationLine[] | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50) {
    return null;
  }

  const lines: ReservationLine[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    const productId = String(record.product_id ?? "").trim();
    const qty = parseMoneyInput(String(record.qty ?? ""));

    if (!isUuid(productId) || qty === null || qty <= 0 || qty > 1000) {
      return null;
    }

    lines.push({ product_id: productId, qty });
  }

  return lines;
}

function reservationPath(role: "admin" | "operator" | "member", id: string) {
  return role === "member" ? `/membro/reservas/${id}` : `/reservas/${id}`;
}

function fail(path: string, message: string): never {
  redirect(`${path}?erro=${encodeURIComponent(message)}`);
}

export async function createReservation(
  _previous: ReservationFormState,
  formData: FormData,
): Promise<ReservationFormState> {
  const session = await getSession();
  if (!session?.profile) {
    return { error: "Sessão expirada. Entre novamente." };
  }

  const role = session.profile.role;
  const memberRaw = String(formData.get("member_id") ?? "").trim();
  const memberId = role === "member" ? session.profile.id : memberRaw;

  if (!isUuid(memberId)) {
    return { error: "Selecione o membro da reserva." };
  }

  const lines = parseLines(formData.get("items"));
  if (!lines) {
    return {
      error: "Adicione pelo menos um produto com quantidade maior que zero.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_reservation", {
    p_member_id: memberId,
    p_items: lines as unknown as Json,
  });

  if (error || !data) {
    console.error("createReservation: falha ao criar reserva", error);
    if (error?.code === "42501") {
      return { error: "Sua conta não tem permissão para criar esta reserva." };
    }
    if (error?.code === "22023" || error?.code === "P0001") {
      return { error: error.message };
    }
    return { error: "Não foi possível criar a reserva. Tente novamente." };
  }

  revalidatePath("/reservas");
  revalidatePath("/membro");
  revalidatePath("/membro/reservas");
  redirect(`${reservationPath(role, data)}?ok=nova`);
}

export async function cancelReservation(formData: FormData) {
  const session = await getSession();
  if (!session?.profile) redirect("/login");

  const id = String(formData.get("reservation_id") ?? "").trim();
  const detailPath = reservationPath(session.profile.role, id || "0");
  if (!isUuid(id)) fail(detailPath, "Reserva inválida.");

  const supabase = await createClient();
  let query = supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (session.profile.role === "member") {
    query = query
      .eq("member_id", session.profile.id)
      .eq("status", "open");
  } else {
    query = query.in("status", ["open", "confirmed"]);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    console.error("cancelReservation: falha ao cancelar", error);
    fail(detailPath, "Não foi possível cancelar a reserva. Tente novamente.");
  }
  if (!data) {
    fail(detailPath, "Esta reserva não pode mais ser cancelada.");
  }

  revalidatePath("/reservas");
  revalidatePath(detailPath);
  revalidatePath("/membro/reservas");
  revalidatePath(`/membro/reservas/${id}`);
  redirect(`${detailPath}?ok=cancelada`);
}

export async function confirmReservation(formData: FormData) {
  const session = await getSession();
  if (!session?.profile) redirect("/login");
  if (session.profile.role === "member") redirect("/membro");

  const id = String(formData.get("reservation_id") ?? "").trim();
  const detailPath = `/reservas/${id || "0"}`;
  if (!isUuid(id)) fail(detailPath, "Reserva inválida.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("confirmReservation: falha ao confirmar", error);
    fail(detailPath, "Não foi possível confirmar a reserva. Tente novamente.");
  }
  if (!data) {
    fail(detailPath, "Esta reserva não está mais aberta.");
  }

  revalidatePath("/reservas");
  revalidatePath(detailPath);
  revalidatePath("/membro/reservas");
  revalidatePath(`/membro/reservas/${id}`);
  redirect(`${detailPath}?ok=confirmada`);
}

export async function convertReservation(formData: FormData) {
  const session = await getSession();
  if (!session?.profile) redirect("/login");
  if (session.profile.role === "member") redirect("/membro");

  const id = String(formData.get("reservation_id") ?? "").trim();
  const detailPath = `/reservas/${id || "0"}`;
  if (!isUuid(id)) fail(detailPath, "Reserva inválida.");

  const soldOn = parseDateInput(formData.get("sold_on"));
  if (!soldOn) fail(detailPath, "Informe uma data válida para a venda.");

  const origin = String(formData.get("origin") ?? "").trim();
  if (origin !== "EVS" && origin !== "CASA") {
    fail(detailPath, "Selecione a origem EVS ou CASA.");
  }

  const paymentCode = String(
    formData.get("payment_method_code") ?? "",
  ).trim();
  if (!paymentCode) fail(detailPath, "Selecione a forma de pagamento.");

  const dealCode = String(formData.get("deal_type_code") ?? "").trim();
  if (!dealCode) fail(detailPath, "Selecione o tipo de negócio.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_reservation", {
    p_reservation_id: id,
    p_sold_on: soldOn,
    p_origin: origin,
    p_payment_method_code: paymentCode,
    p_deal_type_code: dealCode,
  });

  if (error || !data) {
    console.error("convertReservation: falha ao converter", error);
    if (error?.code === "42501") {
      fail(detailPath, "Sua conta não tem permissão para converter reservas.");
    }
    if (error?.code === "22023" || error?.code === "P0001") {
      fail(detailPath, error.message);
    }
    fail(detailPath, "Não foi possível converter a reserva. Tente novamente.");
  }

  revalidatePath("/reservas");
  revalidatePath(detailPath);
  revalidatePath("/membro/reservas");
  revalidatePath(`/membro/reservas/${id}`);
  revalidatePath("/vendas");
  revalidatePath("/painel");
  revalidatePath("/estoque");
  revalidatePath("/estoque/movimentacoes");
  redirect(`${detailPath}?ok=convertida`);
}
