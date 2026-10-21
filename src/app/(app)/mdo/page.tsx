import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react";
import { Suspense } from "react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  currentMonthISO,
  formatInt,
  formatMonth,
  isMonthISO,
  monthDays,
  shiftMonth,
  todayISO,
} from "@/lib/format";
import {
  MDO_GROUPS,
  MDO_SUMMARY_FIELDS,
  mdoTotal,
  type MdoDay,
} from "@/lib/mdo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "MDO",
};

type SearchParams = Promise<{
  mes?: string;
  ok?: string;
}>;

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function weekdayShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

export default async function MdoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentMonth = currentMonthISO();
  const month = isMonthISO(params.mes) ? params.mes : currentMonth;
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_kpis")
    .select("*")
    .gte("kpi_date", from)
    .lt("kpi_date", to)
    .order("kpi_date");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MdoDay[];
  const byDate = new Map(rows.map((row) => [row.kpi_date, row]));
  const days = monthDays(month);
  const monthName = formatMonth(month).split(" de ")[0] ?? month;
  const year = month.slice(0, 4);
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const monthLink = (target: string) =>
    target === currentMonth ? "/mdo" : `/mdo?mes=${target}`;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {params.ok === "salvo" ? <FlashToast message="Dia do MDO salvo." /> : null}
      </Suspense>

      <PageHeader
        title="MDO"
        description="Atividades diárias, clientes e funil de recrutamento."
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href={`/mdo/${todayISO()}`}>
              <CalendarPlus />
              Registrar hoje
            </Link>
          </Button>
        }
      />

      <section className="flex flex-wrap items-end justify-between gap-3 border-y border-line py-4">
        <div>
          <p className="text-[10.5px] font-medium tracking-[0.16em] text-ink-soft uppercase">
            Mês do MDO
          </p>
          <h2 className="mt-1.5 font-display text-[36px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[44px]">
            <mark className="month-mark">{monthName}</mark>{" "}
            <span className="font-normal text-ink-soft">{year}</span>
          </h2>
          <p className="mt-1 text-[12px] text-ink-soft">
            {formatInt(rows.length)} de {formatInt(days.length)} dias registrados
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={monthLink(previousMonth)} aria-label="Mês anterior">
              <ChevronLeft />
              Anterior
            </Link>
          </Button>
          {month !== currentMonth ? (
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link href="/mdo">Mês atual</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={monthLink(nextMonth)} aria-label="Próximo mês">
              Próximo
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {MDO_SUMMARY_FIELDS.map((field, index) => (
          <div
            key={field.name}
            className={cn(
              "bg-paper px-4 py-4 sm:pl-0",
              index === 0 && "sm:pl-4 lg:pl-0",
            )}
          >
            <dt className="text-[11px] font-medium text-ink-soft">
              {field.label}
            </dt>
            <dd className="num mt-1.5 text-[21px] leading-none font-medium">
              {formatInt(mdoTotal(rows, field.name))}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-3 lg:grid-cols-3">
        {MDO_GROUPS.map((group) => (
          <section
            key={group.key}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <h2 className="font-serif text-[20px] leading-none font-normal">
              {group.title}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {group.fields.map((field) => (
                <div key={field.name} className="min-w-0">
                  <dt className="truncate text-[10.5px] text-ink-soft">
                    {field.label}
                  </dt>
                  <dd className="num mt-0.5 text-[13px]">
                    {formatInt(mdoTotal(rows, field.name))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-[24px] leading-none font-normal">
              Diário
            </h2>
            <p className="mt-1 text-[11.5px] text-ink-soft">
              Abra um dia para atualizar os números.
            </p>
          </div>
        </div>

        <div className="border-t border-ink/70">
          <Table>
            <TableHeader>
              <TableRow className="border-b-ink/70 hover:bg-transparent">
                <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                  Dia
                </TableHead>
                {MDO_SUMMARY_FIELDS.map((field) => (
                  <TableHead
                    key={field.name}
                    className="h-9 text-right text-[10.5px] font-medium text-ink-soft"
                  >
                    {field.shortLabel}
                  </TableHead>
                ))}
                <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                  <span className="sr-only">Ação</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((date) => {
                const row = byDate.get(date) ?? null;
                const dayNumber = Number(date.slice(8, 10));

                return (
                  <TableRow
                    key={date}
                    className={cn(
                      "border-line/80 hover:bg-moss-soft/25",
                      !row && "text-ink-soft/75",
                    )}
                  >
                    <TableCell className="border-l-[3px] border-l-transparent py-2 pl-3">
                      <Link
                        href={`/mdo/${date}`}
                        className="flex items-baseline gap-2 underline-offset-2 hover:underline"
                      >
                        <span className="num text-[13px] font-medium">
                          {String(dayNumber).padStart(2, "0")}
                        </span>
                        <span className="text-[10.5px] text-ink-soft">
                          {weekdayShort(date)}
                        </span>
                        {!row ? (
                          <span className="text-[9.5px] text-ink-soft/70">
                            sem registro
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>

                    {MDO_SUMMARY_FIELDS.map((field) => (
                      <TableCell
                        key={field.name}
                        className="num px-2 py-2 text-right text-[12px]"
                      >
                        {row?.[field.name] == null
                          ? "—"
                          : formatInt(Number(row[field.name]))}
                      </TableCell>
                    ))}

                    <TableCell className="px-2 py-2 pr-3 text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-8 text-ink-soft hover:text-ink"
                      >
                        <Link
                          href={`/mdo/${date}`}
                          aria-label={
                            row
                              ? `Editar MDO de ${date}`
                              : `Registrar MDO de ${date}`
                          }
                        >
                          {row ? <Pencil /> : <Plus />}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
