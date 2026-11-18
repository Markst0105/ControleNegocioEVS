"use server";

import { redirect } from "next/navigation";

import {
  isEmail,
  isPin,
  normalizeEmail,
  normalizeFullName,
  pinToPassword,
} from "@/lib/client-auth";
import { formString } from "@/lib/format";
import { resolveSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type SignupState = {
  error: string | null;
  message: string | null;
};

export async function registerClient(
  _previous: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = normalizeFullName(formString(formData, "full_name"));
  const email = normalizeEmail(formString(formData, "email"));
  const pin = formString(formData, "pin").trim();
  const pinConfirm = formString(formData, "pin_confirm").trim();

  if (name.length < 3) {
    return { error: "Informe seu nome completo.", message: null };
  }
  if (name.length > 120) {
    return { error: "O nome deve ter no máximo 120 caracteres.", message: null };
  }
  if (!isEmail(email)) {
    return { error: "Informe um e-mail válido.", message: null };
  }
  if (!isPin(pin)) {
    return {
      error: "O PIN deve ter de 4 a 6 números.",
      message: null,
    };
  }
  if (pin !== pinConfirm) {
    return { error: "Os PINs não conferem.", message: null };
  }

  const supabase = await createClient();

  const { data: available, error: availableError } = await supabase.rpc(
    "login_name_available",
    { p_name: name },
  );

  if (availableError) {
    console.error("registerClient: falha ao checar o nome", availableError);
    return { error: "Não foi possível criar a conta agora. Tente de novo.", message: null };
  }

  if (available === false) {
    return {
      error:
        "Já existe uma conta com esse nome. Escolha outro nome ou entre com o e-mail.",
      message: null,
    };
  }

  const siteUrl = await resolveSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: pinToPassword(pin),
    options: {
      data: { full_name: name },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return {
        error: "Este e-mail já está cadastrado. Entre com seu PIN.",
        message: null,
      };
    }
    if (error.code === "weak_password") {
      return {
        error: "O PIN informado não foi aceito. Tente outro.",
        message: null,
      };
    }
    console.error("registerClient: falha no cadastro", error);
    return {
      error: "Não foi possível criar a conta agora. Tente de novo.",
      message: null,
    };
  }

  // Supabase returns an obfuscated user (no identities) when the e-mail exists.
  if (data.user && data.user.identities?.length === 0) {
    return {
      error: "Este e-mail já está cadastrado. Entre com seu PIN.",
      message: null,
    };
  }

  if (!data.session) {
    return {
      error: null,
      message:
        "Conta criada. Enviamos um link de confirmação para seu e-mail. Depois de confirmar, entre com seu nome e PIN.",
    };
  }

  redirect("/membro");
}
