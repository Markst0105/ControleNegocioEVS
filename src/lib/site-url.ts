import { headers } from "next/headers";

/**
 * Public origin of the running app. Prefer an explicit NEXT_PUBLIC_SITE_URL in
 * production; otherwise rebuild it from the request headers so confirmation
 * links point at the domain the user is actually using.
 */
export async function resolveSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return "http://127.0.0.1:3000";

  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto = forwardedProto ?? (isLocal ? "http" : "https");

  return `${proto}://${host}`;
}
