import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Pencil, Plus } from "lucide-react";

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
import { isUuid } from "@/lib/clients";
import { formatDate, formatInt, formatMoney } from "@/lib/format";
import { supplierRoleLabel } from "@/lib/suppliers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Fornecedor",
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ok?: string }>;

const OK_MESSAGES: Record<string, string> = {
  novo: "Fornecedor cadastrado.",
  editado: "Fornecedor atualizado.",
};

export default async function FornecedorPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [supplierResult, purchasesResult] = await Promise.all([
    supabase
      .from("v_supplier_overview")
      .select(
        "id, name, role_hint, active, created_at, purchase_count, total_cost, last_purchase_on",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("v_purchase_overview")
      .select("id, purchased_on, invoice_no, item_count, total_cost")
      .eq("supplier_id", id)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const firstError = [supplierResult.error, purchasesResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const supplier = supplierResult.data;
  if (!supplier) notFound();

  const purchases = purchasesResult.data ?? [];
  const okMessage = query.ok ? OK_MESSAGES[query.ok] : null;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        {okMessage ? <FlashToast message={okMessage} /> : null}
      </Suspense>

      <div>
        <Link
          href="/fornecedores"
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Fornecedores
        </Link>
      </div>

      <PageHeader
        title={supplier.name}
        description={`${supplierRoleLabel(supplier.role_hint)} · Cadastrado desde ${formatDate(supplier.created_at)}`}
        actions={
          <>
            {supplier.active ? (
              <Button asChild variant="outline" size="sm" className="h-9">
                <Link href={`/compras/nova?fornecedor=${supplier.id}`}>
                  <Plus />
                  Nova compra
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" className="h-9">
              <Link href={`/fornecedores/${supplier.id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
          </>
        }
      />

      {!supplier.active ? (
        <p className="rounded-md border border-steel/20 bg-steel-soft px-4 py-3 text-sm text-steel-ink">
          Este fornecedor está inativo e não aparece em novas compras. O
          histórico abaixo continua preservado.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3">
        <div className="bg-paper px-4 py-4 sm:pl-0">
          <dt className="text-[11px] font-medium text-ink-soft">Compras</dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatInt(Number(supplier.purchase_count))}
          </dd>
        </div>
        <div className="bg-paper px-4 py-4">
          <dt className="text-[11px] font-medium text-ink-soft">
            Custo total
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium whitespace-nowrap">
            {formatMoney(supplier.total_cost)}
          </dd>
        </div>
        <div className="col-span-2 bg-paper px-4 py-4 sm:col-span-1">
          <dt className="text-[11px] font-medium text-ink-soft">
            Última compra
          </dt>
          <dd className="num mt-1.5 text-[18px] leading-none font-medium">
            {formatDate(supplier.last_purchase_on)}
          </dd>
        </div>
      </dl>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-[24px] leading-none font-normal">
              Compras recentes
            </h2>
            <p className="mt-1 text-[12px] text-ink-soft">
              {purchases.length === 0
                ? "Nenhuma compra registrada para este fornecedor."
                : `Últimas ${purchases.length} ${
                    purchases.length === 1 ? "compra" : "compras"
                  } registradas.`}
            </p>
          </div>
        </div>

        {purchases.length === 0 ? (
          <p className="mt-3 border-y border-line py-8 text-center text-sm text-ink-soft">
            As compras com este fornecedor aparecerão aqui.
          </p>
        ) : (
          <div className="mt-3 border-t border-ink/70">
            <Table>
              <TableHeader>
                <TableRow className="border-b-ink/70 hover:bg-transparent">
                  <TableHead className="h-9 border-l-[3px] border-l-transparent pl-3 text-[10.5px] font-medium text-ink-soft">
                    Data
                  </TableHead>
                  <TableHead className="h-9 text-[10.5px] font-medium text-ink-soft">
                    Nota / referência
                  </TableHead>
                  <TableHead className="hidden h-9 text-right text-[10.5px] font-medium text-ink-soft sm:table-cell">
                    Itens
                  </TableHead>
                  <TableHead className="h-9 pr-3 text-right text-[10.5px] font-medium text-ink-soft">
                    Custo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow
                    key={purchase.id}
                    className="border-line/80 hover:bg-moss-soft/25"
                  >
                    <TableCell className="num border-l-[3px] border-l-moss py-2.5 pl-3 text-[12px] whitespace-nowrap text-ink-soft">
                      <Link
                        href={`/compras/${purchase.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {formatDate(purchase.purchased_on)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[280px] px-2 py-2.5 text-[12px]">
                      <span className="block truncate">
                        {purchase.invoice_no || "Sem nota/referência"}
                      </span>
                    </TableCell>
                    <TableCell className="num hidden px-2 py-2.5 text-right text-[12px] text-ink-soft sm:table-cell">
                      {formatInt(Number(purchase.item_count))}
                    </TableCell>
                    <TableCell className="num px-2 py-2.5 pr-3 text-right text-[13px] whitespace-nowrap">
                      {formatMoney(purchase.total_cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
