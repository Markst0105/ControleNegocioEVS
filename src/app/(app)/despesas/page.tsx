import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Suspense } from "react";

import { ExpenseScopeBadge } from "@/components/app/expense-badges";
import { FlashToast } from "@/components/app/flash-toast";
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
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import {
  EXPENSE_SCOPE_OPTIONS,
  expenseScopeAccent,
  isBusinessScope,
  isExpenseScope,
  type ExpenseScope,
} from "@/lib/expenses";
import {
  currentMonthISO,
  formatDate,
  formatInt,
  formatMoney,
  formatMonth,
  isMonthISO,
  monthFirstDay,
  nextMonthFirstDay,
  shiftMonth,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Despesas",
};

const PAGE_SIZE = 30;

const OK_MESSAGES: Record<string, string> = {
  novo: "Despesa lançada.",
  editado: "Despesa atualizada.",
  excluido: "Despesa excluída.",
};

const ERROR_MESSAGES: Record<string, string> = {
  permissao: "Sua conta não tem permissão para esta ação.",
  invalida: "Despesa inválida.",
  nao_encontrada: "Despesa não encontrada ou sem permissão para alterá-la.",
  excluir: "Não foi possível excluir a despesa. Tente novamente.",
};

type SearchParams = Promise<{
  mes?: string;
  tipo?: string;
  categoria?: string;
  q?: string;
  pagina?: string;
  ok?: string;
  erro?: string;
}>;

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await getSession();
  const role = session?.profile?.role ?? "operator";
  const canUsePersonal = role === "admin";

  const currentMonth = currentMonthISO();
  const mes = isMonthISO(params.mes) ? params.mes : currentMonth;
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const q = (params.q ?? "").trim().slice(0, 80);
  const search = q.replace(/[",()%]/g, " ").replace(/\s+/g, " ").trim();

  const scopeFilter: ExpenseScope | null =
    isExpenseScope(params.tipo) &&
    (canUsePersonal || params.tipo !== "pessoal")
      ? params.tipo
      : null;
  const categoryFilter =
    params.categoria && isUuid(params.categoria) ? params.categoria : null;

  const supabase = await createClient();
  const from = monthFirstDay(mes);
  const to = nextMonthFirstDay(mes);

  let listQuery = supabase
    .from("expenses")
    .select(
      "id, incurred_on, description, category_id, account_id, amount, scope",
      { count: "exact" },
    )
    .gte("incurred_on", from)
    .lt("incurred_on", to)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (scopeFilter) listQuery = listQuery.eq("scope", scopeFilter);
  if (categoryFilter) listQuery = listQuery.eq("category_id", categoryFilter);
  if (search) listQuery = listQuery.ilike("description", `%${search}%`);

  const [summaryResult, listResult, categoriesResult, accountsResult] =
    await Promise.all([
      supabase
        .from("expenses")
        .select("scope, amount")
        .gte("incurred_on", from)
        .lt("incurred_on", to),
      listQuery,
      supabase
        .from("expense_categories")
        .select("id, name, scope, active")
        .order("name"),
      supabase.from("accounts").select("id, name").order("name"),
    ]);

  const firstError = [
    summaryResult.error,
    listResult.error,
    categoriesResult.error,
    accountsResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const summaryRows = summaryResult.data ?? [];
  const expenses = listResult.data ?? [];
  const total = listResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categories = categoriesResult.data ?? [];
  const accounts = accountsResult.data ?? [];
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const accountNames = new Map(
    accounts.map((account) => [account.id, account.name]),
  );

  let fixedTotal = 0;
  let variableTotal = 0;
  let personalTotal = 0;
  let businessExpenseCount = 0;
  let personalCount = 0;

  for (const row of summaryRows) {
    const amount = Number(row.amount);
    if (isBusinessScope(row.scope)) businessExpenseCount += 1;
    if (row.scope === "negocio_fixo") fixedTotal += amount;
    if (row.scope === "negocio_variavel") variableTotal += amount;
    if (row.scope === "pessoal") {
      personalTotal += amount;
      personalCount += 1;
    }
  }

  const businessTotal = fixedTotal + variableTotal;

  const filtered = Boolean(q || scopeFilter || categoryFilter);
  const returnedToCurrentMonth = mes === currentMonth;
  const okMessage = params.ok ? OK_MESSAGES[params.ok] : null;
  const errorMessage = params.erro ? ERROR_MESSAGES[params.erro] : null;

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    sp.set("mes", mes);
    if (scopeFilter) sp.set("tipo", scopeFilter);
    if (categoryFilter) sp.set("categoria", categoryFilter);
    if (q) sp.set("q", q);
    if (target > 1) sp.set("pagina", String(target));
    return `/despesas?${sp.toString()}`;
  }

  function monthHref(target: string) {
    const sp = new URLSearchParams();
    sp.set("mes", target);
    if (scopeFilter) sp.set("tipo", scopeFilter);
    if (categoryFilter) sp.set("categoria", categoryFilter);
    if (q) sp.set("q", q);
    return `/despesas?${sp.toString()}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <PageHeader
        title="Despesas"
        description={
          canUsePersonal
            ? "Custos do negócio e despesas pessoais, separados por tipo."
            : "Custos do negócio, separados entre fixos e variáveis."
        }
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href={`/despesas/nova?mes=${mes}`}>
              <Plus />
              Nova despesa
            </Link>
          </Button>
        }
      />

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-rust/25 bg-rust-soft px-4 py-3 text-sm text-rust-ink"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-line py-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm" className="h-8 w-8">
            <Link
              href={monthHref(shiftMonth(mes, -1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft />
            </Link>
          </Button>
          <span className="num min-w-36 text-center text-[13px] font-medium">
            {formatMonth(mes)}
          </span>
          <Button asChild variant="ghost" size="icon-sm" className="h-8 w-8">
            <Link href={monthHref(shiftMonth(mes, 1))} aria-label="Próximo mês">
              <ChevronRight />
            </Link>
          </Button>
          {!returnedToCurrentMonth ? (
            <Button asChild variant="ghost" className="h-8">
              <Link href="/despesas">Mês atual</Link>
            </Button>
          ) : null}
        </div>

        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href={`/resultado?mes=${mes}`}>Ver resultado</Link>
        </Button>
      </div>

      <form
        method="get"
        action="/despesas"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="grid gap-1.5">
          <Label
            htmlFor="mes"
            className="text-[11px] font-medium text-ink-soft"
          >
            Mês
          </Label>
          <Input
            id="mes"
            type="month"
            name="mes"
            defaultValue={mes}
            className="num h-9 w-40"
          />
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="tipo"
            className="text-[11px] font-medium text-ink-soft"
          >
            Tipo
          </Label>
          <Select name="tipo" defaultValue={scopeFilter ?? "todos"}>
            <SelectTrigger id="tipo" className="h-9 w-44 bg-surface">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {EXPENSE_SCOPE_OPTIONS.filter(
                (option) => canUsePersonal || option.value !== "pessoal",
              ).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="categoria"
            className="text-[11px] font-medium text-ink-soft"
          >
            Categoria
          </Label>
          <Select name="categoria" defaultValue={categoryFilter ?? "todas"}>
            <SelectTrigger id="categoria" className="h-9 w-52 bg-surface">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                  {category.active === false ? " (inativa)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            placeholder="Descrição da despesa…"
            className="h-9"
          />
        </div>

        <Button type="submit" variant="secondary" className="h-9">
          <Search />
          Filtrar
        </Button>

        {filtered || mes !== currentMonth ? (
          <Button asChild variant="ghost" className="h-9">
            <Link href="/despesas">Limpar</Link>
          </Button>
        ) : null}
      </form>

      <dl
        className={cn(
          "grid grid-cols-2 gap-px border-y border-line bg-line",
          canUsePersonal
            ? "lg:grid-cols-[2.05fr_1fr_1fr_1fr]"
            : "lg:grid-cols-[2.05fr_1fr_1fr]",
        )}
      >
        <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1 lg:pl-0">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Despesas do negócio
          </dt>
          <dd
            className={cn(
              "num mt-2 text-[24px] leading-none font-medium tracking-tight whitespace-nowrap",
              businessTotal < 0 ? "text-rust-ink" : "text-ink",
            )}
          >
            {formatMoney(businessTotal)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            {formatInt(businessExpenseCount)}{" "}
            {businessExpenseCount === 1
              ? "lançamento do negócio"
              : "lançamentos do negócio"}
            {canUsePersonal && personalCount > 0
              ? ` · ${formatInt(personalCount)} ${
                  personalCount === 1 ? "pessoal" : "pessoais"
                }`
              : ""}
          </p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Negócio fixo
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(fixedTotal)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">custos recorrentes</p>
        </div>

        <div className="bg-paper px-4 py-5 sm:px-5">
          <dt className="text-[11.5px] font-medium text-ink-soft">
            Negócio variável
          </dt>
          <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
            {formatMoney(variableTotal)}
          </dd>
          <p className="mt-2 text-[10.5px] text-ink-soft">
            acompanha o movimento
          </p>
        </div>

        {canUsePersonal ? (
          <div className="col-span-2 bg-paper px-4 py-5 sm:px-5 lg:col-span-1">
            <dt className="text-[11.5px] font-medium text-ink-soft">
              Pessoal
            </dt>
            <dd className="num mt-2 text-[19px] leading-none font-medium tracking-tight whitespace-nowrap sm:text-[21px]">
              {formatMoney(personalTotal)}
            </dd>
            <p className="mt-2 text-[10.5px] text-ink-soft">
              fora do resultado do negócio
            </p>
          </div>
        ) : null}
      </dl>

      {businessExpenseCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-citrus/30 bg-citrus-soft px-4 py-3">
          <div>
            <p className="text-[12.5px] font-medium text-citrus-ink">
              Nenhuma despesa do negócio lançada em {formatMonth(mes)}.
            </p>
            <p className="mt-0.5 text-[11px] text-citrus-ink/85">
              O resultado do mês fica incompleto até os custos serem
              registrados.
            </p>
          </div>
          <Button asChild size="sm" className="h-8">
            <Link href={`/despesas/nova?mes=${mes}`}>Lançar despesa</Link>
          </Button>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-[24px] leading-none font-normal">
              Lançamentos
            </h2>
            <p className="mt-1 text-[11.5px] text-ink-soft">
              {total === 0
                ? "Nenhum lançamento para os filtros atuais."
                : `${formatInt(total)} ${
                    total === 1 ? "lançamento" : "lançamentos"
                  } · página ${page} de ${totalPages}`}
            </p>
          </div>
        </div>

        {total === 0 ? (
          <Empty className="rounded-none border-y border-line bg-paper py-12">
            <EmptyHeader>
              <EmptyTitle className="font-serif text-[24px] font-normal">
                {filtered ? "Nenhum resultado" : "Nenhuma despesa neste mês"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Ajuste o mês, o tipo, a categoria ou a busca."
                  : "Lance a primeira despesa para acompanhar o resultado."}
              </EmptyDescription>
            </EmptyHeader>
            {filtered ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/despesas?mes=${mes}`}>Limpar filtros</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={`/despesas/nova?mes=${mes}`}>
                  <Plus />
                  Nova despesa
                </Link>
              </Button>
            )}
          </Empty>
        ) : (
          <div className="border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Descrição
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft md:table-cell">
                    Categoria
                  </TableHead>
                  <TableHead className="hidden h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft lg:table-cell">
                    Conta
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Tipo
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium tracking-[0.01em] text-ink-soft">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => {
                  const amount = Number(expense.amount);
                  return (
                    <TableRow
                      key={expense.id}
                      className="border-line/80 hover:bg-moss-soft/25"
                    >
                      <TableCell
                        className={cn(
                          "num border-l-[3px] py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft",
                          expenseScopeAccent(expense.scope),
                        )}
                      >
                        <Link
                          href={`/despesas/${expense.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {formatDate(expense.incurred_on)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[320px] px-2 py-2.5 text-[13px]">
                        <Link
                          href={`/despesas/${expense.id}`}
                          className="block truncate font-medium underline-offset-2 hover:underline"
                        >
                          {expense.description}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] px-2 py-2.5 text-[12px] text-ink-soft md:table-cell">
                        <span className="block truncate">
                          {expense.category_id
                            ? categoryNames.get(expense.category_id) ??
                              "Sem categoria"
                            : "Sem categoria"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] px-2 py-2.5 text-[12px] text-ink-soft lg:table-cell">
                        <span className="block truncate">
                          {expense.account_id
                            ? accountNames.get(expense.account_id) ?? "Sem conta"
                            : "Sem conta"}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-2.5">
                        <ExpenseScopeBadge scope={expense.scope} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          "num px-2 py-2.5 pr-3 text-right text-[13px] font-medium whitespace-nowrap",
                          amount < 0 ? "text-rust-ink" : "text-ink",
                        )}
                      >
                        {formatMoney(amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2">
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
        ) : null}
      </section>
    </div>
  );
}
