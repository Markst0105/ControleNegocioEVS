export const CREDIT_STATUS_VALUES = ["pending", "approved", "rejected"] as const;
export type CreditStatus = (typeof CREDIT_STATUS_VALUES)[number];

export const CREDIT_STATUS_LABELS: Record<CreditStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
};

export function isCreditStatus(value: unknown): value is CreditStatus {
  return (
    typeof value === "string" &&
    (CREDIT_STATUS_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Payment methods a credit can be bought with. Ticket (`TK`) and the exception
 * codes (`NP`, `NTT`) describe how an access was paid, not how credits are
 * bought, so they stay out of the credit form.
 */
export const CREDIT_PAYMENT_KINDS = [
  "cash",
  "pix",
  "debit",
  "credit",
  "voucher",
] as const;

export function isCreditPaymentKind(kind: string | null | undefined): boolean {
  return (
    typeof kind === "string" &&
    (CREDIT_PAYMENT_KINDS as readonly string[]).includes(kind)
  );
}

export const CREDIT_STATUS_CLASS: Record<CreditStatus, string> = {
  pending: "border-citrus/40 bg-citrus-soft text-citrus-ink",
  approved: "border-moss/25 bg-moss-soft text-moss-ink",
  rejected: "border-rust/25 bg-rust-soft text-rust-ink",
};
