"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navForRole } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <nav aria-label="Seções" className="mt-5 flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors",
              active
                ? "bg-moss-soft text-moss-ink"
                : "text-ink-soft hover:bg-accent hover:text-ink",
            )}
          >
            <Icon
              size={16}
              strokeWidth={1.75}
              className={active ? "text-moss" : undefined}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
