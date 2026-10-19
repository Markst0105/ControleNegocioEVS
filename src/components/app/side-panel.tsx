"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Brand, BrandMark } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

import { Button } from "@/components/ui/button";
import type { Profile, SessionUser } from "@/lib/auth";
import { NEW_SALE_PATH } from "@/lib/nav";

export function SidePanel({
  user,
  profile,
}: {
  user: SessionUser;
  profile: Profile;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          className="group inline-flex size-10 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-citrus/50"
        >
          <BrandMark
            tone="paper"
            className="size-8 rounded-md transition-transform duration-150 group-active:scale-95 motion-reduce:transition-none"
          />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,calc(100vw_-_3rem))] flex-col overflow-y-auto border-r border-white/10 bg-moss-ink text-paper shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=open]:duration-300"
        >
          <DialogPrimitive.Title className="sr-only">
            Menu de navegação
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Navegação principal e atalho para lançar venda.
          </DialogPrimitive.Description>

          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-5">
            <Brand tone="dark" />
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-paper/65 outline-none transition-colors hover:bg-white/10 hover:text-paper focus-visible:ring-[3px] focus-visible:ring-citrus/50"
              >
                <X size={17} strokeWidth={1.75} />
                <span className="sr-only">Fechar menu</span>
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="px-4 pt-5">
            <Button
              asChild
              className="h-10 w-full gap-2 bg-citrus font-bold text-primary-foreground hover:bg-citrus/90"
            >
              <Link href={NEW_SALE_PATH} onClick={() => setOpen(false)}>
                <Plus />
                Lançar venda
              </Link>
            </Button>
          </div>

          <SidebarNav
            role={profile.role}
            tone="dark"
            onNavigate={() => setOpen(false)}
          />

          <div className="mt-auto border-t border-white/10 px-2 py-3">
            <UserMenu user={user} profile={profile} tone="dark" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
