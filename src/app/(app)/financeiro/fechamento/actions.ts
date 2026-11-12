"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import {
  isMonthISO,
  monthFirstDay,
  parseDateInput,
  parseMoneyInput,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type MonthCloseFormState = {
  error: string | null;
};

export type StatementFormState = {
  error: string | null;
};

function parseRate(raw: FormDataEntryValue | null): number | null {
  const value = parseMoneyInput(raw);
  if (value === null || value <= 0) return null;
  return value;
}

function revalidateClosingPaths() {
  revalidatePath("/financeiro/fechamento");
  revalidatePath("/financeiro/caixa");
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

export async function saveHerbalifeStatement(
  _previous: StatementFormState,
  formData: FormData,
): Promise<StatementFormState> {
  const session = await getSession();
  if (!session?.profile || session.profile.role !== "admin") {
    return { error: "Apenas administradores podem editar o extrato." };
  }

  const rawMonth = parseDateInput(formData.get("month"));
  if (!rawMonth) {
    return { error: "Mês inválido." };
  }
  const month = `${rawMonth.slice(0, 7)}-01`;

  const royaltyRaw = parseMoneyInput(formData.get("royalty_usd"));
  const bonusRaw = parseMoneyInput(formData.get("bonus_usd"));
  const royaltyUsd = royaltyRaw && royaltyRaw !== 0 ? royaltyRaw : null;
  const bonusUsd = bonusRaw && bonusRaw !== 0 ? bonusRaw : null;

  const royaltyFx = parseRate(formData.get("royalty_fx"));
  const bonusFx = parseRate(formData.get("bonus_fx"));

  if (royaltyUsd !== null && royaltyFx === null) {
    return { error: "Informe o câmbio dos royalties." };
  }
  if (bonusUsd !== null && bonusFx === null) {
    return { error: "Informe o câmbio do bônus." };
  }
  if (Math.abs(royaltyUsd ?? 0) > 1_000_000_000) {
    return { error: "O valor de royalties é alto demais." };
  }
  if (Math.abs(bonusUsd ?? 0) > 1_000_000_000) {
    return { error: "O valor de bônus é alto demais." };
  }

  const supabase = await createClient();

  const clearingStatement = royaltyUsd === null && bonusUsd === null;

  if (clearingStatement) {
    const { error } = await supabase
      .from("herbalife_statements")
      .delete()
      .eq("month", month);

    if (error) {
      console.error("saveHerbalifeStatement: falha ao remover", error);
      return { error: "Não foi possível limpar o extrato. Tente novamente." };
    }
  } else {
    const { error } = await supabase.from("herbalife_statements").upsert(
      {
        month,
        royalty_usd: royaltyUsd,
        royalty_fx: royaltyUsd === null ? null : royaltyFx,
        bonus_usd: bonusUsd,
        bonus_fx: bonusUsd === null ? null : bonusFx,
      },
      { onConflict: "month" },
    );

    if (error) {
      console.error("saveHerbalifeStatement: falha ao salvar", error);
      return {
        error:
          error.code === "42501"
            ? "Sua conta não pode editar o extrato."
            : "Não foi possível salvar o extrato. Tente novamente.",
      };
    }
  }

  revalidateClosingPaths();
  redirect(
    `/financeiro/fechamento?mes=${month.slice(0, 7)}&ok=${
      clearingStatement ? "extrato_removido" : "extrato"
    }`,
  );
}
