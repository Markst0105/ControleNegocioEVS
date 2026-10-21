import {
  Activity,
  ChartLine,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  roles: Role[];
  /** Itens operacionais que ficam no painel lateral, mas não na barra móvel. */
  mobile?: boolean;
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
  {
    href: "/clientes",
    label: "Clientes",
    shortLabel: "Clientes",
    icon: Users,
    roles: ["admin", "operator"],
  },
  {
    href: "/mdo",
    label: "MDO",
    shortLabel: "MDO",
    icon: Activity,
    roles: ["admin", "operator"],
    mobile: false,
  },
  {
    href: "/despesas",
    label: "Despesas",
    shortLabel: "Despesas",
    icon: Wallet,
    roles: ["admin", "operator"],
    mobile: false,
  },
  {
    href: "/resultado",
    label: "Resultado",
    shortLabel: "Resultado",
    icon: ChartLine,
    roles: ["admin", "operator"],
    mobile: false,
  },
  {
    href: "/precos",
    label: "Preços",
    shortLabel: "Preços",
    icon: Tags,
    roles: ["admin", "operator"],
    mobile: false,
  },
  {
    href: "/estoque",
    label: "Estoque",
    shortLabel: "Estoque",
    icon: Package,
    roles: ["admin", "operator"],
    mobile: false,
  },
  {
    href: "/compras",
    label: "Compras",
    shortLabel: "Compras",
    icon: ShoppingCart,
    roles: ["admin", "operator"],
    mobile: false,
  },
  {
    href: "/fornecedores",
    label: "Fornecedores",
    shortLabel: "Fornecedores",
    icon: Truck,
    roles: ["admin", "operator"],
    mobile: false,
  },
];

export const NEW_SALE_PATH = "/vendas/nova";

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
