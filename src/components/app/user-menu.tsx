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
  tone = "light",
}: {
  user: SessionUser;
  profile: Profile;
  compact?: boolean;
  tone?: "light" | "dark";
}) {
  const initials = (profile.name || user.email || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const dark = tone === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Conta de ${profile.name}`}
          className={cn(
            "flex items-center gap-2.5 rounded-md p-1.5 text-left outline-none transition-colors focus-visible:ring-[3px]",
            compact ? "" : "w-full",
            dark
              ? "hover:bg-white/10 focus-visible:ring-citrus/40"
              : "hover:bg-accent focus-visible:ring-ring/50",
          )}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
              dark
                ? "bg-paper text-moss-ink ring-1 ring-white/10"
                : "bg-ink text-paper",
            )}
          >
            {initials}
          </span>
          {compact ? null : (
            <span className="min-w-0 leading-tight">
              <span
                className={cn(
                  "block truncate text-[13px] font-medium",
                  dark && "text-paper",
                )}
              >
                {profile.name}
              </span>
              <span
                className={cn(
                  "block truncate text-[11px]",
                  dark ? "text-paper/60" : "text-ink-soft",
                )}
              >
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
