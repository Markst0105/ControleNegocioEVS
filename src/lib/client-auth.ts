/** Client sign-in: full name or e-mail + 4–6 digit PIN. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

const PIN_AUTH_NAMESPACE = "evs-credits-v1:";

/**
 * Supabase Auth stores a password, not a PIN. The client PIN is expanded into
 * a deterministic credential so sign-in still goes through the normal Supabase
 * session (and therefore through the same RLS policies and rate limits).
 */
export function pinToPassword(pin: string): string {
  return `${PIN_AUTH_NAMESPACE}${pin}`;
}

export function isPin(value: string): boolean {
  return new RegExp(
    String.raw`^\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`,
  ).test(value);
}

/** Collapses surrounding/repeated spaces so the name matches the stored one. */
export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}
