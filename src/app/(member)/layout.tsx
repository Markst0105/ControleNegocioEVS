import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MemberShell } from "@/components/app/member-shell";
import ProfileNotice from "@/components/app/profile-notice";
import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/auth";

export default async function MemberLayout({
  children,
}: {
  children: ReactNode;
}) {
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

  if (profile.role !== "member") {
    redirect("/painel");
  }

  return (
    <>
      <MemberShell user={user} profile={profile}>
        {children}
      </MemberShell>
      <Toaster position="top-center" theme="light" />
    </>
  );
}
