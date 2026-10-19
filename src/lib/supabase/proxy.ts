import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseEnv, supabaseKey, supabaseUrl } from "./env";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Sem variáveis de ambiente não há o que renovar (build local, preview…).
  if (!hasSupabaseEnv()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Não rode código entre createServerClient e getClaims(): isso evita
  // logouts aleatórios por sessão fora de sincronia.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { pathname, search } = request.nextUrl;
  const isLoginPath = pathname === "/login";
  const isAuthPath = pathname.startsWith("/auth");

  if (!claims && !isLoginPath && !isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = search ? `?proximo=${encodeURIComponent(pathname + search)}` : "";
    const redirect = NextResponse.redirect(url);
    copyCookies(supabaseResponse, redirect);
    return redirect;
  }

  if (claims && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    copyCookies(supabaseResponse, redirect);
    return redirect;
  }

  // Sempre devolva o supabaseResponse (com os cookies renovados).
  return supabaseResponse;
}
