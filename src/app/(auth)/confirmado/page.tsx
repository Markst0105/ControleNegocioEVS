import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";

import { AuthShell } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "E-mail confirmado",
};

type SearchParams = Promise<{ erro?: string }>;

export default async function ConfirmadoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const failed = params.erro === "link";
  const user = await getSessionUser();

  if (failed) {
    return (
      <AuthShell>
        <span className="grid size-11 place-items-center rounded-full border border-citrus/40 bg-citrus-soft text-citrus-ink">
          <AlertTriangle aria-hidden className="size-5" />
        </span>
        <h1 className="mt-4 font-serif text-[30px] leading-none font-normal tracking-[-0.01em]">
          Link não confirmado
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          O link pode ter expirado ou já ter sido usado. Se o e-mail já estiver
          confirmado, entre com seu nome ou e-mail e o PIN. Caso contrário, peça
          um novo link para a equipe.
        </p>
        <Button asChild className="mt-6 h-10 w-full">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <span className="grid size-11 place-items-center rounded-full border border-moss/25 bg-moss-soft text-moss-ink">
        <Check aria-hidden className="size-5" />
      </span>
      <h1 className="mt-4 font-serif text-[30px] leading-none font-normal tracking-[-0.01em]">
        E-mail confirmado
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        {user
          ? "Sua conta está pronta. Acesse seus créditos para comprar e acompanhar seu saldo."
          : "Sua conta está pronta. Entre com seu nome ou e-mail e o PIN para comprar e acompanhar seus créditos."}
      </p>
      <Button asChild className="mt-6 h-10 w-full">
        <Link href={user ? "/membro" : "/login"}>
          {user ? "Acessar meus créditos" : "Ir para o login"}
        </Link>
      </Button>
    </AuthShell>
  );
}
