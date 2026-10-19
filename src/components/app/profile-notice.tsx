import { Brand } from "@/components/app/brand";
import { Button } from "@/components/ui/button";

import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        Sair
      </Button>
    </form>
  );
}

export default function ProfileNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Brand />
        </div>
        <h1 className="mt-8 font-serif text-[30px] leading-none font-normal tracking-[-0.01em]">
          {title}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">{description}</p>
        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
