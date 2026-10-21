"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "invalid_credentials" || error.status === 400) {
      return { error: "E-mail ou senha incorretos." };
    }
    if (error.code === "email_not_confirmed") {
      return { error: "Confirme seu e-mail antes de entrar." };
    }
    return { error: "Não foi possível entrar agora. Tente de novo." };
  }

  const { data: profile } = data.user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle()
    : { data: null };

  redirect(profile?.role === "member" ? "/membro" : "/painel");
}
