import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ReservationStatusBadge } from "@/components/app/reservation-status-badge";
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
import { formatDate, formatInt, formatMoney } from "@/lib/format";
import {
  getReservationStatusCounts,
  getReservationsPage,
} from "@/lib/reservations-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Minhas reservas",
};

const PAGE_SIZE = 20;

type SearchParams = Promise<{ pagina?: string }>;

export default async function MembroReservasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const supabase = await createClient();

  const [pageResult, countByStatus] = await Promise.all([
    getReservationsPage(supabase, {
      page,
      pageSize: PAGE_SIZE,
      includeSales: false,
    }),
    getReservationStatusCounts(supabase),
  ]);

  const reservations = pageResult.rows;
  const total = pageResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    return target > 1 ? `/membro/reservas?pagina=${target}` : "/membro/reservas";
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Minhas reservas"
        description="Acompanhe o que você reservou e o que já foi confirmado pela loja."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/membro/reservas/nova">
              <Plus />
              Nova reserva
            </Link>
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {[
          ["Abertas", countByStatus.get("open") ?? 0],
          ["Confirmadas", countByStatus.get("confirmed") ?? 0],
          ["Convertidas", countByStatus.get("converted") ?? 0],
          [
            "Total",
            Array.from(countByStatus.values()).reduce(
              (sum, value) => sum + value,
              0,
            ),
          ],
        ].map(([label, value]) => (
          <div key={label} className="bg-paper px-4 py-4 sm:pl-0">
            <dt className="text-[11px] font-medium text-ink-soft">{label}</dt>
            <dd className="num mt-1.5 text-[19px] leading-none font-medium">
              {formatInt(Number(value))}
            </dd>
          </div>
        ))}
      </dl>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              Você ainda não tem reservas
            </EmptyTitle>
            <EmptyDescription>
              Escolha produtos no catálogo e envie uma reserva para a loja.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" className="font-bold">
            <Link href="/membro">
              <BookOpen />
              Ver catálogo
            </Link>
          </Button>
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Reserva
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Itens
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium text-ink-soft">
                    Total
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Situação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((reservation) => (
                  <TableRow
                    key={reservation.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="border-l-[3px] border-l-transparent py-3 pl-3">
                      <Link
                        href={`/membro/reservas/${reservation.id}`}
                        className="block text-[13px] font-medium underline-offset-2 hover:underline"
                      >
                        Reserva de {formatDate(reservation.created_at)}
                      </Link>
                      <span className="mt-0.5 block text-[10.5px] text-ink-soft">
                        {reservation.confirmed_at
                          ? `Confirmada em ${formatDate(reservation.confirmed_at)}`
                          : "Aguardando confirmação"}
                      </span>
                    </TableCell>
                    <TableCell className="num hidden px-2 py-3 text-right text-[12px] text-ink-soft sm:table-cell">
                      {formatInt(reservation.item_count)}
                    </TableCell>
                    <TableCell className="num px-2 py-3 text-right text-[13px] whitespace-nowrap">
                      {formatMoney(reservation.total)}
                    </TableCell>
                    <TableCell className="px-2 py-3 pr-3 text-right">
                      <ReservationStatusBadge status={reservation.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)} {total === 1 ? "reserva" : "reservas"} · página{" "}
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
