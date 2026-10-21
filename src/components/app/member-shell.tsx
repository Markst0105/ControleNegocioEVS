"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarClock } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "./brand";
import { UserMenu } from "./user-menu";

import type { Profile, SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const MEMBER_NAV = [
  {
    href: "/membro",
    label: "Catálogo",
    icon: BookOpen,
    active: (pathname: string) =>
      pathname === "/membro" || pathname.startsWith("/membro/?"),
  },
  {
    href: "/membro/reservas",
    label: "Minhas reservas",
    icon: CalendarClock,
    active: (pathname: string) => pathname.startsWith("/membro/reservas"),
  },
];

export function MemberShell({
  user,
  profile,
  children,
}: {
  user: SessionUser;
  profile: Profile;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-moss-ink text-paper">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/membro" className="min-w-0">
            <Brand tone="dark" subtitle={false} />
          </Link>
          <div className="ml-auto">
            <UserMenu user={user} profile={profile} compact tone="dark" />
          </div>
        </div>

        <div className="border-t border-white/10">
          <nav
            aria-label="Área de membros"
            className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 sm:px-4"
          >
            {MEMBER_NAV.map((item) => {
              const active = item.active(pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-citrus/40",
                    active
                      ? "text-paper"
                      : "text-paper/65 hover:text-paper",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-citrus transition-opacity",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>
    </div>
  );
}
