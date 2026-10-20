"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidePanel } from "./side-panel";
import { UserMenu } from "./user-menu";

import type { Profile, SessionUser } from "@/lib/auth";

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
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <AppSidebar user={user} profile={profile} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-print-hide
          className="sticky top-0 z-40 border-b border-white/10 bg-moss-ink text-paper lg:hidden print:hidden"
        >
          <div className="flex h-14 w-full items-center gap-1 px-4 sm:px-6">
            <SidePanel user={user} profile={profile} />
            <Brand
              showMark={false}
              subtitle={false}
              tone="dark"
              className="ml-1 min-w-0"
            />
            <div className="ml-auto">
              <UserMenu user={user} profile={profile} compact tone="dark" />
            </div>
          </div>
        </header>

        <main
          data-print-main
          className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-10 lg:pb-14 print:max-w-none print:p-0"
        >
          {children}
        </main>
      </div>

      <MobileNav role={profile.role} />
    </div>
  );
}
