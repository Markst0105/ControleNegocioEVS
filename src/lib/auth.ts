import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/roles";

export type SessionUser = { id: string; email: string | null };
export type Profile = { id: string; name: string; role: Role };

/** Usuário da sessão (via JWT) — null quando não autenticado. */
export const getSessionUser = cache(
  async (): Promise<SessionUser | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;

    const claims = data.claims as { sub?: unknown; email?: unknown };
    if (typeof claims.sub !== "string") return null;

    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
    };
  },
);

/** Sessão + profile da tabela profiles (não redireciona — quem chama decide). */
export const getSession = cache(
  async (): Promise<{
    user: SessionUser;
    profile: Profile | null;
  } | null> => {
    const user = await getSessionUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role")
      .eq("id", user.id)
      .maybeSingle();

    const profile =
      data && isRole(data.role)
        ? { id: data.id, name: data.name, role: data.role }
        : null;

    return { user, profile };
  },
);
