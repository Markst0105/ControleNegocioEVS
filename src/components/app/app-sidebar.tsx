import Link from "next/link";
import { Plus } from "lucide-react";

import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

import { Button } from "@/components/ui/button";
import type { Profile, SessionUser } from "@/lib/auth";
import { NEW_SALE_PATH } from "@/lib/nav";

export function AppSidebar({
  user,
  profile,
}: {
  user: SessionUser;
  profile: Profile;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-moss-ink text-paper lg:flex">
      <div className="px-4 pt-5">
        <Brand tone="dark" />
      </div>

      <div className="px-4 pt-5">
        <Button
          asChild
          className="h-10 w-full gap-2 bg-citrus font-bold text-primary-foreground shadow-none hover:bg-citrus/90"
        >
          <Link href={NEW_SALE_PATH}>
            <Plus />
            Lançar venda
          </Link>
        </Button>
      </div>

      <SidebarNav role={profile.role} tone="dark" />

      <div className="mt-auto border-t border-white/10 px-2 py-3">
        <UserMenu user={user} profile={profile} tone="dark" />
      </div>
    </aside>
  );
}
