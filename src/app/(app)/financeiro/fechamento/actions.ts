"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isMonthISO, monthFirstDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type MonthCloseFormState = {
  error: string | null;
};

function revalidateClosingPaths() {
  revalidatePath("/financeiro/fechamento");
  revalidatePath("/financeiro/caixa");
  revalidatePath("/resultado");
  revalidatePath("/painel");
}

function noteError(note: string, maxLength = 1000): string | null {
  if (note.length > maxLength) {
    return `A observação deve ter no máximo ${maxLength} caracteres.`;
  }
  return null;
}

function actionError(code: string | undefined, fallback: string): string {
  if (code === "42501") {
    return "Sua conta não tem permissão para esta ação.";
  }
  if (code === "22023") {
    return "Verifique o mês e a observação informados.";
  }
  if (code === "P0002") {
    return "Este mês não está mais fechado. Atualize a página.";
  }
  return fallback;
}

export async function closeMonth(
  _previous: MonthCloseFormState,
  formData: FormData,
): Promise<MonthCloseFormState> {
  const session = await getSession();
  if (session?.profile?.role !== "admin") {
    return { error: "Apenas administradores podem fechar um mês." };
  }

  const month = String(formData.get("month") ?? "");
  if (!isMonthISO(month)) {
    return { error: "Informe um mês válido." };
  }

  const note = String(formData.get("note") ?? "").trim();
  const error = noteError(note);
  if (error) return { error };

  if (formData.get("confirmo") !== "on") {
    return { error: "Confirme a conferência do mês antes de fechar." };
  }

  const supabase = await createClient();
  const result = await supabase.rpc("close_month", {
    p_month: monthFirstDay(month),
    p_note: note || null,
  });
  if (result.error) {
    return {
      error: actionError(
        result.error.code,
        "Não foi possível fechar o mês. Tente novamente.",
      ),
    };
  }

  revalidateClosingPaths();
  redirect(`/financeiro/fechamento?mes=${month}&ok=fechado`);
}

export async function reopenMonth(
  _previous: MonthCloseFormState,
  formData: FormData,
): Promise<MonthCloseFormState> {
  const session = await getSession();
  if (session?.profile?.role !== "admin") {
    return { error: "Apenas administradores podem reabrir um mês." };
  }

  const month = String(formData.get("month") ?? "");
  if (!isMonthISO(month)) {
    return { error: "Informe um mês válido." };
  }

  const note = String(formData.get("note") ?? "").trim();
  if (!note) {
    return { error: "Informe o motivo da reabertura." };
  }
  const error = noteError(note);
  if (error) return { error };

  if (formData.get("confirmo") !== "on") {
    return { error: "Confirme que deseja reabrir o mês." };
  }

  const supabase = await createClient();
  const result = await supabase.rpc("reopen_month", {
    p_month: monthFirstDay(month),
    p_note: note,
  });
  if (result.error) {
    return {
      error: actionError(
        result.error.code,
        "Não foi possível reabrir o mês. Tente novamente.",
      ),
    };
  }

  revalidateClosingPaths();
  redirect(`/financeiro/fechamento?mes=${month}&ok=reaberto`);
}
