"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import {
  addDays,
  nextMonthFirstDay,
  parseDateInput,
  todayISO,
} from "@/lib/format";
import { MDO_FIELDS, type MdoField } from "@/lib/mdo";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type MdoFormState = {
  error: string | null;
};

export async function saveDailyKpis(
  _previous: MdoFormState,
  formData: FormData,
): Promise<MdoFormState> {
  const session = await getSession();
  if (
    !session?.profile ||
    (session.profile.role !== "admin" && session.profile.role !== "operator")
  ) {
    return { error: "Sua conta não tem permissão para registrar o MDO." };
  }

  const date = parseDateInput(formData.get("kpi_date"));
  if (!date) {
    return { error: "Informe uma data válida para o dia." };
  }

  const values = {} as Record<MdoField, number>;

  for (const field of MDO_FIELDS) {
    const raw = String(formData.get(field.name) ?? "").trim();
    if (!raw) {
      values[field.name] = 0;
      continue;
    }

    if (!/^\d+$/.test(raw)) {
      return { error: `Informe um número inteiro em “${field.label}”.` };
    }

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000) {
      return { error: `“${field.label}” deve ficar entre 0 e 100.000.` };
    }

    values[field.name] = value;
  }

  const payload: Database["public"]["Tables"]["daily_kpis"]["Insert"] = {
    kpi_date: date,
    created_by: session.user.id,
    ...values,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_kpis")
    .upsert(payload, { onConflict: "kpi_date" });

  if (error) {
    console.error("saveDailyKpis: falha ao salvar", error);
    if (error.code === "42501") {
      return { error: "Sua conta não tem permissão para registrar o MDO." };
    }
    return { error: "Não foi possível salvar o dia. Tente novamente." };
  }

  revalidatePath("/mdo");
  revalidatePath(`/mdo/${date}`);
  if (date === todayISO()) redirect("/mdo?ok=salvo");

  const month = date.slice(0, 7);
  const monthEnd = addDays(nextMonthFirstDay(month), -1);
  redirect(`/mdo?aba=mes&de=${month}-01&ate=${monthEnd}&ok=salvo`);
}
