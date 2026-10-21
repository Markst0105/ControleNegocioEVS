"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "./brand";
import { UserMenu } from "./user-menu";

import type { Profile, SessionUser } from "@/lib/auth";

export function MemberShell({
  user,
  profile,
  children,
}: {
  user: SessionUser;
  profile: Profile;
  children: ReactNode;
}) {
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
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>
    </div>
  );
}
