import { LayoutDashboard, ReceiptText, type LucideIcon } from "lucide-react";

import type { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  roles: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/painel",
    label: "Painel",
    shortLabel: "Painel",
    icon: LayoutDashboard,
    roles: ["admin", "operator"],
  },
  {
    href: "/vendas",
    label: "Vendas",
    shortLabel: "Vendas",
    icon: ReceiptText,
    roles: ["admin", "operator"],
  },
];

export const NEW_SALE_PATH = "/vendas/nova";

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
