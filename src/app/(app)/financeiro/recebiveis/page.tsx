import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HandCoins, Search } from "lucide-react";

import { FlashToast } from "@/components/app/flash-toast";
import { PageHeader } from "@/components/app/page-header";
import { ReceivableStatusBadge } from "@/components/app/receivable-badges";
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
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import {
  addDays,
  formatDate,
  formatInt,
  formatMoney,
  formatMonth,
  isMonthISO,
  monthFirstDay,
  nextMonthFirstDay,
  todayISO,
} from "@/lib/format";
import {
  hasPartialReceipt,
  isReceivableFilter,
  RECEIVABLE_FILTER_OPTIONS,
  type ReceivableFilter,
} from "@/lib/receivables";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ReconciliationForm } from "./reconciliacao-form";

export const metadata: Metadata = {
  title: "Recebíveis",
};

const PAGE_SIZE = 30;

const OK_MESSAGES: Record<string, string> = {
  lote_recebido: "Parcelas vencidas marcadas como recebidas.",
  lote_baixado: "Parcelas vencidas baixadas sem recebimento.",
  lote_vazio: "Nenhuma parcela em aberto até essa data.",
};

const ERROR_MESSAGES: Record<string, string> = {
  permissao: "Sua conta não tem permissão para esta ação.",
  data: "Informe uma data de corte válida.",
  modo: "Selecione uma forma de reconciliação válida.",
  confirmar: "Confirme a reconciliação antes de continuar.",
  observacao: "A observação deve ter no máximo 500 caracteres.",
  reconciliar: "Não foi possível reconciliar as parcelas. Tente novamente.",
};

type SearchParams = Promise<{
  situacao?: string;
  mes?: string;
  q?: string;
  cliente?: string;
  pagina?: string;
  ok?: string;
  erro?: string;
}>;

type ReceivableRow = {
  id: string;
  sale_id: string;
  installment: number;
  due_on: string | null;
  amount: number;
  received_amount: number;
  written_off_amount: number;
  open_amount: number;
  status: string;
  last_received_on: string | null;
  client_id: string | null;
  client_name: string;
  product_name_raw: string | null;
  sold_on: string;
  method_label: string | null;
  payment_method_code: string | null;
};

type ReceivablesSummaryNumbers = {
  openTotal: number;
  overdueTotal: number;
  dueTodayTotal: number;
  next7Total: number;
  openCount: number;
  overdueCount: number;
  receivedMonthTotal: number;
  writtenOffMonthTotal: number;
};

function extractReceivablesSummary(
  summary: {
    open_total?: number | null;
    overdue_total?: number | null;
    due_today_total?: number | null;
    next7_total?: number | null;
    open_count?: number | null;
    overdue_count?: number | null;
    received_month_total?: number | null;
    written_off_month_total?: number | null;
  } | null,
): ReceivablesSummaryNumbers {
  return {
    openTotal: Number(summary?.open_total ?? 0),
    overdueTotal: Number(summary?.overdue_total ?? 0),
    dueTodayTotal: Number(summary?.due_today_total ?? 0),
    next7Total: Number(summary?.next7_total ?? 0),
    openCount: Number(summary?.open_count ?? 0),
    overdueCount: Number(summary?.overdue_count ?? 0),
    receivedMonthTotal: Number(summary?.received_month_total ?? 0),
    writtenOffMonthTotal: Number(summary?.written_off_month_total ?? 0),
  };
}

function buildRecebiveisPageHref(options: {
  filter: ReceivableFilter;
  dueMonth: string | null;
  q: string;
  clienteFilter: string | null;
  target: number;
}): string {
  const sp = new URLSearchParams();
  if (options.filter !== "abertos") sp.set("situacao", options.filter);
  if (options.dueMonth) sp.set("mes", options.dueMonth);
  if (options.q) sp.set("q", options.q);
  if (options.clienteFilter) sp.set("cliente", options.clienteFilter);
  if (options.target > 1) sp.set("pagina", String(options.target));
  const query = sp.toString();
  return query ? `/financeiro/recebiveis?${query}` : "/financeiro/recebiveis";
}

function formatReceivablesSubtitle(
  total: number,
  page: number,
  totalPages: number,
): string {
  if (total === 0) return "Nenhuma parcela para os filtros atuais.";
  const label = total === 1 ? "parcela" : "parcelas";
  return `${formatInt(total)} ${label} · página ${page} de ${totalPages}`;
}

function getReceivableRowBorderClass(
  overdue: boolean,
  dueToday: boolean,
  partial: boolean,
): string {
  if (overdue) return "border-l-rust";
  if (dueToday) return "border-l-citrus";
  if (partial) return "border-l-steel";
  return "border-l-line-strong";
}

function RecebiveisSummaryGrid({
  numbers,
}: Readonly<{ numbers: ReceivablesSummaryNumbers }>) {
  const {
    openTotal,
    openCount,
    overdueTotal,
    overdueCount,
    next7Total,
    dueTodayTotal,
    receivedMonthTotal,
    writtenOffMonthTotal,
  } = numbers;

  return (
    <dl className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
      <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
        <dt className="text-[11.5px] font-medium text-ink-soft">Em aberto</dt>
        <dd className="num mt-2 text-[26px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[30px]">
          {formatMoney(openTotal)}
        </dd>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          {formatInt(openCount)}{" "}
          {openCount === 1
            ? "parcela com vencimento"
            : "parcelas com vencimento"}
        </p>
      </div>

      <div className="bg-paper px-4 py-5 sm:px-5">
        <dt className="text-[11.5px] font-medium text-ink-soft">Vencidos</dt>
        <dd
          className={cn(
            "num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]",
            overdueTotal > 0 ? "text-rust-ink" : "text-ink",
          )}
        >
          {formatMoney(overdueTotal)}
        </dd>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          {formatInt(overdueCount)}{" "}
          {overdueCount === 1 ? "parcela vencida" : "parcelas vencidas"}
        </p>
      </div>

      <div className="bg-paper px-4 py-5 sm:px-5">
        <dt className="text-[11.5px] font-medium text-ink-soft">
          Próximos 7 dias
        </dt>
        <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
          {formatMoney(next7Total)}
        </dd>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          {dueTodayTotal > 0
            ? `${formatMoney(dueTodayTotal)} vence hoje`
            : "nenhuma parcela vence hoje"}
        </p>
      </div>

      <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
        <dt className="text-[11.5px] font-medium text-ink-soft">
          Recebido no mês
        </dt>
        <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap text-moss-ink sm:text-[21px]">
          {formatMoney(receivedMonthTotal)}
        </dd>
        <p className="mt-2 text-[10.5px] text-ink-soft">
          {writtenOffMonthTotal > 0
            ? `baixas no mês: ${formatMoney(writtenOffMonthTotal)}`
            : "recebimentos registrados"}
        </p>
      </div>
    </dl>
  );
}

function RecebivelTableRow({ row }: Readonly<{ row: ReceivableRow }>) {
  const openAmount = Number(row.open_amount);
  const receivedAmount = Number(row.received_amount);
  const writtenOffAmount = Number(row.written_off_amount);
  const partial = hasPartialReceipt(receivedAmount, openAmount);
  const overdue = row.status === "vencido";
  const dueToday = row.status === "vence_hoje";

  return (
    <TableRow className="border-line/80 hover:bg-moss-soft/25">
      <TableCell
        className={cn(
          "num border-l-[3px] py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft",
          getReceivableRowBorderClass(overdue, dueToday, partial),
        )}
      >
        {formatDate(row.due_on)}
      </TableCell>
      <TableCell className="max-w-[260px] px-2 py-2.5">
        <span className="block truncate text-[13px] font-medium">
          {row.client_name}
        </span>
        <span className="block truncate text-[11px] text-ink-soft">
          {row.product_name_raw ?? "—"} · {formatDate(row.sold_on)}
        </span>
      </TableCell>
      <TableCell className="num px-2 py-2.5 text-[12px] text-ink-soft">
        #{row.installment}
      </TableCell>
      <TableCell className="hidden px-2 py-2.5 text-[12px] text-ink-soft md:table-cell">
        <span className="block max-w-28 truncate">
          {row.method_label ?? "—"}
        </span>
      </TableCell>
      <TableCell className="px-2 py-2.5">
        <ReceivableStatusBadge status={row.status} partial={partial} />
      </TableCell>
      <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] whitespace-nowrap text-ink-soft sm:table-cell">
        {formatMoney(row.amount)}
      </TableCell>
      <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] whitespace-nowrap text-ink-soft lg:table-cell">
        {formatMoney(receivedAmount)}
        {writtenOffAmount > 0 ? (
          <span className="block text-[10px] text-ink-soft">
            baixa {formatMoney(writtenOffAmount)}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="num px-2 py-2.5 text-right text-[13px] font-medium whitespace-nowrap">
        {openAmount > 0 ? (
          <span className={overdue ? "text-rust-ink" : ""}>
            {formatMoney(openAmount)}
          </span>
        ) : (
          <span className="text-ink-soft">—</span>
        )}
      </TableCell>
      <TableCell className="px-2 py-2.5 pr-3 text-right">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
        >
          <Link href={`/financeiro/recebiveis/${row.id}`}>Abrir</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RecebiveisListSection({
  rows,
  total,
  page,
  totalPages,
  hasFilters,
  filter,
  dueMonth,
  q,
  clienteFilter,
}: Readonly<{
  rows: ReceivableRow[];
  total: number;
  page: number;
  totalPages: number;
  hasFilters: boolean;
  filter: ReceivableFilter;
  dueMonth: string | null;
  q: string;
  clienteFilter: string | null;
}>) {
  const prevHref = buildRecebiveisPageHref({
    filter,
    dueMonth,
    q,
    clienteFilter,
    target: page - 1,
  });
  const nextHref = buildRecebiveisPageHref({
    filter,
    dueMonth,
    q,
    clienteFilter,
    target: page + 1,
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-[24px] leading-none font-normal">
            Parcelas
          </h2>
          <p className="mt-1 text-[11.5px] text-ink-soft">
            {formatReceivablesSubtitle(total, page, totalPages)}
          </p>
        </div>
        {dueMonth ? (
          <span className="text-[11px] text-ink-soft">
            Vencimento em {formatMonth(dueMonth)}
          </span>
        ) : null}
      </div>

      {total === 0 ? (
        <Empty className="rounded-none border-y border-line bg-paper py-12">
          <EmptyHeader>
            <EmptyTitle className="font-serif text-[24px] font-normal">
              {hasFilters ? "Nenhum resultado" : "Nenhuma parcela em aberto"}
            </EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? "Ajuste a situação, o vencimento, o cliente ou a busca."
                : "Tudo recebido ou baixado até agora. Novas parcelas aparecem aqui quando forem lançadas."}
            </EmptyDescription>
          </EmptyHeader>
          {hasFilters ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/financeiro/recebiveis">Limpar filtros</Link>
            </Button>
          ) : null}
        </Empty>
      ) : (
        <>
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Vencimento
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Cliente
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Parcela
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft md:table-cell">
                    Forma
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Situação
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft sm:table-cell">
                    Valor
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft lg:table-cell">
                    Recebido
                  </TableHead>
                  <TableHead className="h-9 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Em aberto
                  </TableHead>
                  <TableHead className="h-9 pr-3">
                    <span className="sr-only">Abrir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <RecebivelTableRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {formatReceivablesSubtitle(total, page, totalPages)}
            </p>

            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={prevHref}>Anterior</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8" disabled>
                  Anterior
                </Button>
              )}
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={nextHref}>Próxima</Link>
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
    </section>
  );
}

function parseReceivablesSearchParams(params: {
  situacao?: string;
  mes?: string;
  q?: string;
  cliente?: string;
  pagina?: string;
}) {
  const filter: ReceivableFilter = isReceivableFilter(params.situacao)
    ? params.situacao
    : "abertos";
  const dueMonth = isMonthISO(params.mes) ? params.mes : null;
  const q = (params.q ?? "").trim().slice(0, 80);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();
  const clienteFilter =
    params.cliente && isUuid(params.cliente) ? params.cliente : null;
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const hasFilters = Boolean(
    filter !== "abertos" || dueMonth || q || clienteFilter,
  );
  return { filter, dueMonth, q, search, clienteFilter, page, hasFilters };
}

export default async function RecebiveisPage({
  searchParams,
}: Readonly<{
  searchParams: SearchParams;
}>) {
  const params = await searchParams;
  const session = await getSession();
  const isAdmin = session?.profile?.role === "admin";

  const today = todayISO();
  const { filter, dueMonth, q, search, clienteFilter, page, hasFilters } =
    parseReceivablesSearchParams(params);

  const supabase = await createClient();

  let listQuery = supabase
    .from("v_receivables_detail")
    .select(
      "id, sale_id, installment, due_on, amount, received_amount, written_off_amount, open_amount, status, last_received_on, client_id, client_name, product_name_raw, sold_on, method_label, payment_method_code",
      { count: "exact" },
    )
    .order("due_on", {
      ascending: filter !== "liquidados" && filter !== "todos",
      nullsFirst: false,
    })
    .order("sold_on", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const filterBuilders: Record<
    ReceivableFilter,
    (query: typeof listQuery) => typeof listQuery
  > = {
    abertos: (query) => query.gt("open_amount", 0),
    vencidos: (query) => query.gt("open_amount", 0).lt("due_on", today),
    hoje: (query) => query.gt("open_amount", 0).eq("due_on", today),
    proximos: (query) =>
      query
        .gt("open_amount", 0)
        .gt("due_on", today)
        .lte("due_on", addDays(today, 7)),
    parciais: (query) => query.gt("received_amount", 0).gt("open_amount", 0),
    sem_vencimento: (query) => query.gt("open_amount", 0).is("due_on", null),
    liquidados: (query) => query.lte("open_amount", 0),
    todos: (query) => query,
  };

  listQuery = filterBuilders[filter](listQuery);

  if (dueMonth) {
    listQuery = listQuery
      .gte("due_on", monthFirstDay(dueMonth))
      .lt("due_on", nextMonthFirstDay(dueMonth));
  }
  if (clienteFilter) {
    listQuery = listQuery.eq("client_id", clienteFilter);
  }
  if (search) {
    listQuery = listQuery.or(
      `client_name.ilike."%${search}%",product_name_raw.ilike."%${search}%"`,
    );
  }

  const [summaryResult, listResult, clientResult] = await Promise.all([
    supabase.rpc("open_receivables_summary").maybeSingle(),
    listQuery,
    clienteFilter
      ? supabase
          .from("clients")
          .select("name")
          .eq("id", clienteFilter)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const firstError = [
    summaryResult.error,
    listResult.error,
    clientResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const numbers = extractReceivablesSummary(summaryResult.data);
  const rows = listResult.data ?? [];
  const total = listResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clientName = clientResult.data?.name ?? null;
  const okMessage = params.ok ? OK_MESSAGES[params.ok] : null;
  const errorMessage = params.erro ? ERROR_MESSAGES[params.erro] : null;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <PageHeader
        title="Recebíveis"
        description="Parcelas em aberto por vencimento, cliente e venda."
      />

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[24px] leading-none font-normal">
          Resumo
        </h2>
        <p className="text-[11px] text-ink-soft">
          todos os recebíveis com vencimento
        </p>
      </div>

      <RecebiveisSummaryGrid numbers={numbers} />

      {isAdmin ? (
        <details
          id="reconciliacao"
          className="rounded-lg border border-line bg-surface"
        >
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium">
            <HandCoins className="size-4 text-ink-soft" />
            Reconciliação histórica
            <span className="rounded-sm border border-line bg-paper px-1.5 py-px text-[10px] font-medium tracking-wide text-ink-soft">
              Admin
            </span>
            <span className="num ml-auto text-[11px] font-normal text-ink-soft">
              {formatInt(numbers.overdueCount)} vencidas ·{" "}
              {formatMoney(numbers.overdueTotal)}
            </span>
          </summary>

          <div className="border-t border-line px-4 py-4">
            <p className="max-w-3xl text-[12px] leading-relaxed text-ink-soft">
              As parcelas importadas da planilha entraram em aberto. Informe uma
              data de corte para liquidar todos os saldos com vencimento até
              essa data. Ao marcar como recebidas, a data de cada baixa será o
              próprio vencimento; ao baixar sem recebimento, o saldo sai dos
              recebíveis e fica registrado no histórico.
            </p>

            <ReconciliationForm
              defaultCutoff={addDays(today, -1)}
              today={today}
            />
          </div>
        </details>
      ) : null}

      <form
        method="get"
        action="/financeiro/recebiveis"
        className="flex flex-wrap items-end gap-2"
      >
        {clienteFilter ? (
          <input type="hidden" name="cliente" value={clienteFilter} />
        ) : null}

        <div className="grid gap-1.5">
          <Label
            htmlFor="situacao"
            className="text-[11px] font-medium text-ink-soft"
          >
            Situação
          </Label>
          <Select name="situacao" defaultValue={filter}>
            <SelectTrigger id="situacao" className="h-9 w-48 bg-surface">
              <SelectValue placeholder="Em aberto" />
            </SelectTrigger>
            <SelectContent>
              {RECEIVABLE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="mes"
            className="text-[11px] font-medium text-ink-soft"
          >
            Vencimento
          </Label>
          <Input
            id="mes"
            type="month"
            name="mes"
            defaultValue={dueMonth ?? ""}
            className="num h-9 w-40"
          />
        </div>

        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="q" className="text-[11px] font-medium text-ink-soft">
            Buscar
          </Label>
          <Input
            id="q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cliente ou produto…"
            className="h-9"
          />
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {hasFilters ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/financeiro/recebiveis">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {clienteFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-steel/20 bg-steel-soft px-3 py-2 text-[12px] text-steel-ink">
          <span>
            Cliente: <strong>{clientName ?? "selecionado"}</strong>
          </span>
          <Link
            href="/financeiro/recebiveis"
            className="font-medium underline underline-offset-2"
          >
            Remover filtro
          </Link>
        </div>
      ) : null}

      <RecebiveisListSection
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        hasFilters={hasFilters}
        filter={filter}
        dueMonth={dueMonth}
        q={q}
        clienteFilter={clienteFilter}
      />
    </div>
  );
}
