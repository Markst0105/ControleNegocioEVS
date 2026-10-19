export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

/**
 * Chave pública do Supabase. Aceita o nome novo (publishable key) e o
 * antigo (anon key) — os dois funcionam com @supabase/ssr.
 */
export function supabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}
