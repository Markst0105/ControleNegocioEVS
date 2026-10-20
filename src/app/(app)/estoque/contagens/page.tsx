import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDecimal, formatInt } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Contagens",
};

const PAGE_SIZE = 25;

type SearchParams = Promise<{ pagina?: string }>;

export default async function ContagensPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("v_stock_count_overview")
    .select(
      "id, location, counted_on, notes, item_count, total_adjustment",
      { count: "exact" },
    )
    .order("counted_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  const counts = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    return target > 1 ? `/estoque/contagens?pagina=${target}` : "/estoque/contagens";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Contagens"
        description="Conferência física do estoque e ajuste das diferenças."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/estoque/contagens/nova">
              <Plus />
              Nova contagem
            </Link>
          </Button>
        }
      />

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              Nenhuma contagem registrada
            </EmptyTitle>
            <EmptyDescription>
              Faça a primeira conferência para ajustar o saldo do sistema.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" className="font-bold">
            <Link href="/estoque/contagens/nova">Nova contagem</Link>
          </Button>
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Local
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Produtos
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Ajuste
                  </TableHead>
                  <TableHead className="hidden h-9 pr-3 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Observação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((countRow) => (
                  <TableRow
                    key={countRow.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="num border-l-[3px] border-l-citrus py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                      <Link
                        href={`/estoque/contagens/${countRow.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {formatDate(countRow.counted_on)}
                      </Link>
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 text-[12px]">
                      {countRow.location}
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 text-right text-[12px] text-ink-soft">
                      {formatInt(Number(countRow.item_count))}
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 text-right text-[12px]">
                      {formatDecimal(countRow.total_adjustment)}
                    </TableCell>
                    <TableCell className="hidden max-w-[260px] px-2 py-2.5 pr-3 text-[11.5px] text-ink-soft sm:table-cell">
                      <span className="block truncate">
                        {countRow.notes || "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)} {total === 1 ? "contagem" : "contagens"} ·
              página {page} de {totalPages}
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
