import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus, Search } from "lucide-react";
import { Suspense } from "react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { ReservationStatusBadge } from "@/components/app/reservation-status-badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { formatDate, formatInt, formatMoney } from "@/lib/format";
import {
  getReservationStatusCounts,
  getReservationsPage,
} from "@/lib/reservations-data";
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
} from "@/lib/reservations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reservas",
};

const PAGE_SIZE = 25;

type StatusFilter = "all" | (typeof RESERVATION_STATUSES)[number];

type SearchParams = Promise<{
  status?: string;
  pagina?: string;
  ok?: string;
  erro?: string;
}>;

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status: StatusFilter = RESERVATION_STATUSES.includes(
    params.status as (typeof RESERVATION_STATUSES)[number],
  )
    ? (params.status as (typeof RESERVATION_STATUSES)[number])
    : "all";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const supabase = await createClient();

  const [pageResult, countByStatus] = await Promise.all([
    getReservationsPage(supabase, {
      page,
      pageSize: PAGE_SIZE,
      status: status === "all" ? undefined : status,
      includeSales: true,
    }),
    getReservationStatusCounts(supabase),
  ]);

  const reservations = pageResult.rows;
  const total = pageResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = status !== "all";

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (status !== "all") sp.set("status", status);
    if (target > 1) sp.set("pagina", String(target));
    const queryString = sp.toString();
    return queryString ? `/reservas?${queryString}` : "/reservas";
  }

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {params.ok === "cancelada" ? (
          <FlashToast message="Reserva cancelada." />
        ) : null}
      </Suspense>

      {params.erro ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-3 py-2 text-sm text-rust-ink"
        >
          {params.erro}
        </p>
      ) : null}

      <PageHeader
        title="Reservas"
        description="Pré-encomendas dos membros, da confirmação à venda."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/reservas/nova">
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

      <form
        method="get"
        action="/reservas"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid gap-1.5">
          <Label
            htmlFor="status"
            className="text-[11px] font-medium text-ink-soft"
          >
            Situação
          </Label>
          <Select name="status" defaultValue={status}>
            <SelectTrigger id="status" className="h-9 w-40 bg-surface">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {RESERVATION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {RESERVATION_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {filtered ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/reservas">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {filtered
                ? "Nenhuma reserva neste filtro"
                : "Nenhuma reserva registrada"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Ajuste a situação para ver outras reservas."
                : "Crie uma reserva para um membro ou aguarde as pré-encomendas da área de membros."}
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <Button asChild size="sm" className="font-bold">
              <Link href="/reservas">Limpar filtro</Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="font-bold">
              <Link href="/reservas/nova">
                <CalendarClock />
                Nova reserva
              </Link>
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
                    Membro
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Criada em
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft md:table-cell">
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
                    <TableCell className="max-w-[300px] border-l-[3px] border-l-moss py-2.5 pl-3 text-[13px]">
                      <Link
                        href={`/reservas/${reservation.id}`}
                        className="block truncate font-medium underline-offset-2 hover:underline"
                      >
                        {reservation.member_name}
                      </Link>
                      <span className="block text-[10.5px] text-ink-soft">
                        {reservation.sale_count > 0
                          ? `${formatInt(reservation.sale_count)} venda(s)`
                          : `${formatInt(reservation.item_count)} item(ns)`}
                      </span>
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-[12px] text-ink-soft sm:table-cell">
                      {formatDate(reservation.created_at)}
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] text-ink-soft md:table-cell">
                      {formatInt(reservation.item_count)}
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 text-right text-[13px] whitespace-nowrap">
                      {formatMoney(reservation.total)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 pr-3 text-right">
                      <ReservationStatusBadge status={reservation.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatInt(total)}{" "}
              {total === 1 ? "reserva" : "reservas"} · página {page} de{" "}
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
