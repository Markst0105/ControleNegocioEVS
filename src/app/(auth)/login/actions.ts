"use server";

import { redirect } from "next/navigation";

import { isPin, pinToPassword } from "@/lib/client-auth";
import { formString } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formString(formData, "email").trim();
  const password = formString(formData, "password");

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

/**
 * Client sign-in. The login identifier is resolved server-side to the member
 * e-mail; the PIN becomes the Supabase password. Staff profiles are never
 * resolvable here, so the admin switch stays the only way in for the team.
 */
export async function signInWithPin(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifier = formString(formData, "identifier")
    .trim()
    .replace(/\s+/g, " ");
  const pin = formString(formData, "pin").trim();

  if (!identifier || !isPin(pin)) {
    return {
      error: "Informe seu nome ou e-mail e um PIN de 4 a 6 números.",
    };
  }

  const supabase = await createClient();
  const { data: email, error: lookupError } = await supabase.rpc(
    "resolve_login_identifier",
    { p_identifier: identifier },
  );

  if (lookupError) {
    console.error("signInWithPin: falha ao resolver o login", lookupError);
    return { error: "Não foi possível entrar agora. Tente de novo." };
  }

  if (!email) {
    return { error: "Nome/e-mail ou PIN incorretos." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: pinToPassword(pin),
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirme seu e-mail antes de entrar." };
    }
    return { error: "Nome/e-mail ou PIN incorretos." };
  }

  redirect("/membro");
}
