import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  addDays,
  formatDate,
  formatDateLong,
  nextMonthFirstDay,
  parseDateInput,
  todayISO,
} from "@/lib/format";
import type { MdoDay } from "@/lib/mdo";
import { createClient } from "@/lib/supabase/server";

import { MdoForm } from "../mdo-form";

export const metadata: Metadata = {
  title: "Dia do MDO",
};

type Params = Promise<{ date: string }>;

export default async function MdoDayPage({ params }: { params: Params }) {
  const { date: rawDate } = await params;
  const date = parseDateInput(rawDate);
  if (!date) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_kpis")
    .select("*")
    .eq("kpi_date", date)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const day = (data ?? null) as MdoDay | null;
  const month = date.slice(0, 7);
  const monthEnd = addDays(nextMonthFirstDay(month), -1);
  const isToday = date === todayISO();
  const returnTo = isToday
    ? "/mdo"
    : `/mdo?aba=mes&de=${month}-01&ate=${monthEnd}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <Link
          href={returnTo}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          {isToday ? "MDO de hoje" : "MDO do mês"}
        </Link>
      </div>

      <PageHeader
        title={day ? "Editar dia do MDO" : "Registrar dia do MDO"}
        description={
          <span>
            {formatDateLong(date)} ·{" "}
            <span className="num">{formatDate(date)}</span>
          </span>
        }
      />

      <div className="mt-3 rounded-md border border-line bg-surface px-4 py-3 text-[12px] text-ink-soft">
        {day
          ? "Este dia já tem registros. Ajuste os números e salve."
          : "Ainda não há registro para este dia. Preencha o que aconteceu."}
      </div>

      <div className="mt-6">
        <MdoForm day={day} date={date} returnTo={returnTo} />
      </div>
    </div>
  );
}
