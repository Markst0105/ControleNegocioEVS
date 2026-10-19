"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { NEW_SALE_PATH, navForRole, type NavItem } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navForRole(role);
  const newSaleActive = pathname === NEW_SALE_PATH;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="grid grid-cols-3 items-end">
        {items[0] ? (
          <TabLink item={items[0]} pathname={pathname} />
        ) : (
          <span aria-hidden />
        )}

        <Link
          href={NEW_SALE_PATH}
          aria-label="Lançar venda"
          aria-current={newSaleActive ? "page" : undefined}
          className="flex flex-col items-center gap-1 pt-2 pb-2"
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full text-[#1d291c] transition-transform duration-150 motion-safe:active:scale-95",
              "bg-citrus",
              newSaleActive && "ring-2 ring-moss-ink/20",
            )}
          >
            <Plus size={18} strokeWidth={2.25} />
          </span>
          <span
            className={cn(
              "text-[10.5px] font-bold",
              newSaleActive ? "text-moss-ink" : "text-ink-soft",
            )}
          >
            Lançar
          </span>
        </Link>

        {items[1] ? (
          <TabLink item={items[1]} pathname={pathname} />
        ) : (
          <span aria-hidden />
        )}
      </div>
    </nav>
  );
}

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10.5px] font-medium transition-colors",
        active ? "text-moss-ink" : "text-ink-soft hover:text-ink",
      )}
    >
      <Icon
        size={19}
        strokeWidth={active ? 2 : 1.75}
        className={active ? "text-moss" : undefined}
      />
      {item.shortLabel}
    </Link>
  );
}
