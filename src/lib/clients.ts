const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 11;

/** Remove tudo que não é dígito. */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Normaliza telefones brasileiros para 10 ou 11 dígitos, descartando o
 * código do país quando presente. Retorna null quando não há número válido.
 */
function nationalDigits(value: string | null | undefined): string | null {
  let digits = digitsOnly(value);
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    digits = digits.slice(2);
  }
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return null;
  }
  return digits;
}

/** "11912345678" -> "(11) 91234-5678"; texto inválido volta como veio. */
export function formatPhoneBR(value: string | null | undefined): string {
  if (!value) return "";
  const digits = nationalDigits(value);
  if (!digits) return value.trim();
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
}

export type ParsedPhone = {
  formatted: string | null;
  digits: string | null;
  error: string | null;
};

/** Valida e formata um telefone/WhatsApp para armazenamento. */
export function parsePhoneBR(
  value: FormDataEntryValue | null | undefined,
): ParsedPhone {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return { formatted: null, digits: null, error: null };

  const digits = nationalDigits(raw);
  if (!digits) {
    return {
      formatted: null,
      digits: null,
      error: "Informe DDD e número (10 ou 11 dígitos).",
    };
  }

  return { formatted: formatPhoneBR(digits), digits, error: null };
}

export function phoneHref(value: string | null | undefined): string | null {
  const digits = nationalDigits(value);
  return digits ? `tel:+55${digits}` : null;
}

export function whatsappHref(value: string | null | undefined): string | null {
  const digits = nationalDigits(value);
  return digits ? `https://wa.me/55${digits}` : null;
}

/** Mesma normalização usada pelo ETL: minúsculas e espaços colapsados. */
export function normalizeClientName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type ClientDuplicate = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  reason: string;
};
