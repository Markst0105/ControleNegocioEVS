import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatInt, formatMoney } from "@/lib/format";
import { formatPhoneBR } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Clientes",
};

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  q?: string;
  pagina?: string;
}>;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();
  const digits = q.replace(/\D/g, "");

  let query = supabase
    .from("v_client_overview")
    .select(
      "id, name, phone, whatsapp, last_purchase_on, sales_count, open_amount",
      { count: "exact" },
    )
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    const filters = [
      `name.ilike."%${search}%"`,
      `phone.ilike."%${search}%"`,
      `whatsapp.ilike."%${search}%"`,
    ];

    if (digits.length >= 3) {
      filters.push(
        `phone_normalized.ilike."%${digits}%"`,
        `whatsapp_normalized.ilike."%${digits}%"`,
      );
    }

    query = query.or(filters.join(","));
  }

  const { data: clients, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q);

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString ? `/clientes?${queryString}` : "/clientes";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        description="Cadastro, contato e histórico de compras."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/clientes/novo">
              <Plus />
              Novo cliente
            </Link>
          </Button>
        }
      />

      <form
        method="get"
        action="/clientes"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="q" className="text-[11px] font-medium text-ink-soft">
            Buscar
          </Label>
          <Input
            id="q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nome, telefone ou WhatsApp…"
            className="h-9"
          />
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Buscar
        </Button>

        {filtered ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/clientes">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste a busca para encontrar o cadastro."
                : "Cadastre o primeiro cliente para começar."}
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <Button asChild size="sm" className="font-bold">
              <Link href="/clientes">Limpar busca</Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="font-bold">
              <Link href="/clientes/novo">Novo cliente</Link>
            </Button>
          )}
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Cliente
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Contato
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft sm:table-cell">
                    Última compra
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft lg:table-cell">
                    Compras
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Em aberto
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients?.map((client) => (
                  <TableRow
                    key={client.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="max-w-[260px] border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px]">
                      <Link
                        href={`/clientes/${client.id}`}
                        className="block truncate font-medium underline-offset-2 hover:underline"
                      >
                        {client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px] px-2 py-2.5 text-[12px] text-ink-soft">
                      {client.phone || client.whatsapp ? (
                        <span className="flex flex-col gap-0.5">
                          {client.phone ? (
                            <span className="num truncate">
                              {formatPhoneBR(client.phone)}
                            </span>
                          ) : null}
                          {client.whatsapp ? (
                            <span className="num truncate">
                              WhatsApp {formatPhoneBR(client.whatsapp)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-[12px] whitespace-nowrap text-ink-soft sm:table-cell">
                      {formatDate(client.last_purchase_on)}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] text-ink-soft lg:table-cell">
                      {formatInt(client.sales_count)}
                    </TableCell>
                    <TableCell
                      className={
                        Number(client.open_amount) > 0
                          ? "num px-2 py-2.5 pr-3 text-right text-[12px] whitespace-nowrap text-rust-ink"
                          : "num px-2 py-2.5 pr-3 text-right text-[12px] whitespace-nowrap text-ink-soft"
                      }
                    >
                      {formatMoney(client.open_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)} {total === 1 ? "cliente" : "clientes"} · página{" "}
              {page} de {totalPages}
            </p>

            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={pageHref(page - 1)}>Anterior</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8" disabled>
                  Anterior
                </Button>
              )}
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={pageHref(page + 1)}>Próxima</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8" disabled>
                  Próxima
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
