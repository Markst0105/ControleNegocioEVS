/** Papéis de usuário (profiles.role). */
export type Role = "admin" | "operator" | "member";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operador",
  member: "Membro",
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "operator" || value === "member";
}
