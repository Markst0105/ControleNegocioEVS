"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

import { Button } from "@/components/ui/button";
import type { Profile, SessionUser } from "@/lib/auth";
import { NEW_SALE_PATH } from "@/lib/nav";

export function AppShell({
  user,
  profile,
  children,
}: {
  user: SessionUser;
  profile: Profile;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-58 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>

        <Button asChild size="sm" className="mt-5 h-9 w-full justify-start gap-2 px-3">
          <Link href={NEW_SALE_PATH}>
            <Plus />
            Lançar venda
          </Link>
        </Button>

        <SidebarNav role={profile.role} />

        <div className="mt-auto border-t border-line pt-3">
          <UserMenu user={user} profile={profile} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-13 items-center justify-between border-b border-line/80 bg-paper/85 px-4 backdrop-blur-md lg:hidden">
          <Brand subtitle={false} />
          <UserMenu user={user} profile={profile} compact />
        </header>

        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
          {children}
        </main>

        <MobileNav role={profile.role} />
      </div>
    </div>
  );
}
