"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidePanel } from "./side-panel";
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
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-moss-ink text-paper">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center gap-1 px-4 sm:px-6 lg:px-8">
          <SidePanel role={profile.role} />
          <Brand
            showMark={false}
            subtitle={false}
            tone="dark"
            className="ml-1 min-w-0"
          />

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              asChild
              className="hidden h-9 gap-1.5 bg-citrus px-3.5 font-bold text-[#1d291c] shadow-none hover:bg-citrus/90 sm:inline-flex"
            >
              <Link href={NEW_SALE_PATH}>
                <Plus />
                Lançar venda
              </Link>
            </Button>
            <UserMenu user={user} profile={profile} compact tone="dark" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-10 lg:pb-14">
        {children}
      </main>

      <MobileNav role={profile.role} />
    </div>
  );
}
