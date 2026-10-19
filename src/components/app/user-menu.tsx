"use client";

import { LogOut } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";
import type { Profile, SessionUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function UserMenu({
  user,
  profile,
  compact = false,
}: {
  user: SessionUser;
  profile: Profile;
  compact?: boolean;
}) {
  const initials = (profile.name || user.email || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2.5 rounded-md p-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
            compact ? "" : "w-full",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-paper">
            {initials}
          </span>
          {compact ? null : (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-medium">
                {profile.name}
              </span>
              <span className="block truncate text-[11px] text-ink-soft">
                {ROLE_LABELS[profile.role]}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side={compact ? "bottom" : "top"}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-[13px] font-medium">
            {profile.name}
          </span>
          <span className="block truncate text-xs text-ink-soft">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button
              type="submit"
              className="w-full cursor-pointer text-rust focus:text-rust-ink"
            >
              <LogOut />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
