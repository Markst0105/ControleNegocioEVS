import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="num text-sm text-ink-soft">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="mt-2 text-sm text-ink-soft">
          O endereço não existe ou foi movido. Confira o link e tente de novo.
        </p>
        <Link
          href="/painel"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-moss-ink"
        >
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
