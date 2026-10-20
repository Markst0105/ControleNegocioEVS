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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatInt } from "@/lib/format";
import { supplierRoleLabel } from "@/lib/suppliers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Fornecedores",
};

const PAGE_SIZE = 25;

type StatusFilter = "active" | "inactive" | "all";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  pagina?: string;
}>;

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const status: StatusFilter =
    params.status === "inactive" || params.status === "all"
      ? params.status
      : "active";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();

  const supabase = await createClient();

  let query = supabase
    .from("v_supplier_overview")
    .select(
      "id, name, role_hint, active, purchase_count, last_purchase_on",
      { count: "exact" },
    )
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status === "active") query = query.eq("active", true);
  if (status === "inactive") query = query.eq("active", false);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const suppliers = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(search) || status !== "active";

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status !== "active") sp.set("status", status);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString ? `/fornecedores?${queryString}` : "/fornecedores";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fornecedores"
        description="Quem fornece os produtos e aparece no registro de compras."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/fornecedores/novo">
              <Plus />
              Novo fornecedor
            </Link>
          </Button>
        }
      />

      <form
        method="get"
        action="/fornecedores"
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
            placeholder="Nome do fornecedor…"
            className="h-9"
          />
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="status"
            className="text-[11px] font-medium text-ink-soft"
          >
            Situação
          </Label>
          <Select name="status" defaultValue={status}>
            <SelectTrigger id="status" className="h-9 w-36 bg-surface">
              <SelectValue placeholder="Ativos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {filtered ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/fornecedores">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered
                ? "Nenhum fornecedor encontrado"
                : "Nenhum fornecedor cadastrado"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste a busca ou a situação para encontrar o cadastro."
                : "Cadastre o primeiro fornecedor para usá-lo nas compras."}
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <Button asChild size="sm" className="font-bold">
              <Link href="/fornecedores">Limpar filtros</Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="font-bold">
              <Link href="/fornecedores/novo">Novo fornecedor</Link>
            </Button>
          )}
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Fornecedor
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Tipo
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Compras
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft md:table-cell">
                    Última compra
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Situação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="max-w-[320px] border-l-[3px] border-l-transparent py-2.5 pl-3 text-[13px]">
                      <Link
                        href={`/fornecedores/${supplier.id}`}
                        className="block truncate font-medium underline-offset-2 hover:underline"
                      >
                        {supplier.name}
                      </Link>
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-[12px] text-ink-soft">
                      {supplierRoleLabel(supplier.role_hint)}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] text-ink-soft sm:table-cell">
                      {formatInt(Number(supplier.purchase_count))}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-[12px] whitespace-nowrap text-ink-soft md:table-cell">
                      {formatDate(supplier.last_purchase_on)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 pr-3 text-right">
                      <span
                        className={
                          supplier.active
                            ? "inline-flex items-center rounded-sm border border-moss/25 bg-moss-soft px-1.5 py-px text-[10px] font-medium text-moss-ink"
                            : "inline-flex items-center rounded-sm border border-steel/20 bg-steel-soft px-1.5 py-px text-[10px] font-medium text-steel-ink"
                        }
                      >
                        {supplier.active ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)}{" "}
              {total === 1 ? "fornecedor" : "fornecedores"} · página {page} de{" "}
              {totalPages}
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
