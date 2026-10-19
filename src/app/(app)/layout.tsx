import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import ProfileNotice from "@/components/app/profile-notice";
import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { user, profile } = session;

  if (!profile) {
    return (
      <>
        <ProfileNotice
          title="Perfil não configurado"
          description={`A conta ${user.email ?? ""} ainda não tem um perfil na tabela "profiles". Peça ao administrador para criar o registro e definir o papel (admin, operator ou member).`}
        />
        <Toaster position="top-center" />
      </>
    );
  }

  if (profile.role === "member") {
    return (
      <>
        <ProfileNotice
          title={`Olá, ${profile.name}`}
          description="A área de membros está em preparação. Em breve você vai poder ver o catálogo de produtos e acompanhar suas reservas por aqui."
        />
        <Toaster position="top-center" />
      </>
    );
  }

  return (
    <>
      <AppShell user={user} profile={profile}>
        {children}
      </AppShell>
      <Toaster position="top-center" theme="light" />
    </>
  );
}
