export const SUPPLIER_ROLES = [
  "supplier",
  "distributor",
  "other",
] as const;

export type SupplierRole = (typeof SUPPLIER_ROLES)[number];

export const SUPPLIER_ROLE_LABELS: Record<SupplierRole, string> = {
  supplier: "Fornecedor",
  distributor: "Distribuidora",
  other: "Outro",
};

export const SUPPLIER_ROLE_OPTIONS = SUPPLIER_ROLES.map((value) => ({
  value,
  label: SUPPLIER_ROLE_LABELS[value],
}));

export function isSupplierRole(value: unknown): value is SupplierRole {
  return (
    typeof value === "string" &&
    (SUPPLIER_ROLES as readonly string[]).includes(value)
  );
}

export function supplierRoleLabel(role: string | null | undefined): string {
  if (!role) return SUPPLIER_ROLE_LABELS.supplier;
  return isSupplierRole(role) ? SUPPLIER_ROLE_LABELS[role] : role;
}
