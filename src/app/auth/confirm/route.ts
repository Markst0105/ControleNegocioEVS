import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase confirmation e-mails.
 *
 * Depending on the e-mail template and auth flow the link carries either a
 * `token_hash` (verifyOtp) or a PKCE `code` (exchangeCodeForSession). Both are
 * consumed here so the browser always ends on the friendly /confirmado page
 * instead of the app root (which would look like a login error).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    return NextResponse.redirect(
      new URL(error ? "/confirmado?erro=link" : "/confirmado", origin),
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    return NextResponse.redirect(
      new URL(error ? "/confirmado?erro=link" : "/confirmado", origin),
    );
  }

  return NextResponse.redirect(new URL("/confirmado?erro=link", origin));
}
