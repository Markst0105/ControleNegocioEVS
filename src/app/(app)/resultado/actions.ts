"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type StatementFormState = {
  error: string | null;
};

function parseRate(raw: FormDataEntryValue | null): number | null {
  const value = parseMoneyInput(raw);
  if (value === null || value <= 0) return null;
  return value;
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

  revalidatePath("/resultado");
  revalidatePath("/painel");
  redirect(
    `/resultado?mes=${month.slice(0, 7)}&ok=${
      clearingStatement ? "extrato_removido" : "extrato"
    }`,
  );
}
