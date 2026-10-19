"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navForRole } from "@/lib/nav";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function SidebarNav({
  role,
  tone = "light",
  onNavigate,
}: {
  role: Role;
  tone?: "light" | "dark";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = navForRole(role);
  const dark = tone === "dark";

  return (
    <nav aria-label="Seções" className="mt-4 flex flex-col gap-0.5 px-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors",
              dark
                ? active
                  ? "bg-white/10 text-paper"
                  : "text-paper/65 hover:bg-white/10 hover:text-paper"
                : active
                  ? "bg-moss-soft text-moss-ink"
                  : "text-ink-soft hover:bg-accent hover:text-ink",
            )}
          >
            <Icon
              size={16}
              strokeWidth={1.75}
              className={
                active ? (dark ? "text-citrus" : "text-moss") : undefined
              }
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
