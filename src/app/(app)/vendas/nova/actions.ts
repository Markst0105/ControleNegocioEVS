"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import {
  entryString,
  formString,
  parseDateInput,
  parseMoneyInput,
  parsePercentInput,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type SaleFormState = {
  error: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ORIGINS = new Set(["EVS", "CASA"]);
const INSTALLMENT_KINDS = new Set(["credit", "ticket", "exception"]);

/**
 * Acesso pago com cartela (TK) ou "não trouxe ticket" (NTT): sem receita no
 * ato. A venda fica com valor 0,00 e o custo do produto, que é a perda do mês.
 */
function isTicketAccess(method: { code: string; kind: string }): boolean {
  return method.kind === "ticket" || method.code === "NTT";
}

type ParsedInstallment = {
  due_on: string | null;
  amount: number;
};

type ParsedSaleFields = {
  soldOn: string;
  origin: string;
  paymentCode: string;
  dealCode: string;
  discountPct: number;
  amountInput: number | null;
  productCost: number;
  financialCost: number;
  pvInput: number;
  pvFilled: boolean;
  observation: string | null;
  clientIdRaw: string;
  productIdRaw: string;
};

function optionalMoney(
  raw: FormDataEntryValue | null,
): { ok: true; value: number } | { ok: false } {
  const text = entryString(raw).trim();
  if (!text) return { ok: true, value: 0 };
  const parsed = parseMoneyInput(text);
  return parsed === null ? { ok: false } : { ok: true, value: parsed };
}

function parseDealAndDiscount(
  formData: FormData,
): { ok: true; dealCode: string; discountPct: number } | { ok: false; error: string } {
  const dealInput = formString(formData, "deal_type_code").trim();
  if (!dealInput) {
    return { ok: false, error: "Selecione o tipo de negócio." };
  }
  if (dealInput !== "DESC") {
    return { ok: true, dealCode: dealInput, discountPct: 0 };
  }
  const percent = parsePercentInput(formData.get("discount_pct"));
  if (percent === undefined || percent <= 0 || percent >= 1) {
    return { ok: false, error: "Informe o desconto em % (entre 0 e 100)." };
  }
  // Convenção da planilha: desconto vira venda (0) + fração de desconto.
  return { ok: true, dealCode: "0", discountPct: percent };
}

function parseSaleFields(
  formData: FormData,
): { ok: true; fields: ParsedSaleFields } | { ok: false; error: string } {
  const soldOn = parseDateInput(formData.get("sold_on"));
  if (!soldOn) {
    return { ok: false, error: "Informe uma data válida para a venda." };
  }

  const origin = formString(formData, "origin");
  if (!ORIGINS.has(origin)) {
    return { ok: false, error: "Selecione a origem (EVS ou CASA)." };
  }

  const paymentCode = formString(formData, "payment_method_code").trim();
  if (!paymentCode) {
    return { ok: false, error: "Selecione a forma de pagamento." };
  }

  const dealResult = parseDealAndDiscount(formData);
  if (!dealResult.ok) return dealResult;

  const productCost = optionalMoney(formData.get("product_cost"));
  if (!productCost.ok) {
    return { ok: false, error: "Custo do produto inválido (ex.: 12,50)." };
  }

  const financialCost = optionalMoney(formData.get("financial_cost"));
  if (!financialCost.ok) {
    return { ok: false, error: "Custo financeiro inválido (ex.: 3,20)." };
  }

  const pvInput = optionalMoney(formData.get("pv"));
  if (!pvInput.ok) {
    return { ok: false, error: "PV inválido (ex.: 1,95)." };
  }

  return {
    ok: true,
    fields: {
      soldOn,
      origin,
      paymentCode,
      dealCode: dealResult.dealCode,
      discountPct: dealResult.discountPct,
      amountInput: parseMoneyInput(formData.get("amount_received")),
      productCost: productCost.value,
      financialCost: financialCost.value,
      pvInput: pvInput.value,
      pvFilled: formString(formData, "pv").trim() !== "",
      observation: formString(formData, "obs").trim() || null,
      clientIdRaw: formString(formData, "client_id").trim(),
      productIdRaw: formString(formData, "product_id").trim(),
    },
  };
}

function parseInstallments(
  formData: FormData,
  enabled: boolean,
): { ok: true; installments: ParsedInstallment[] } | { ok: false; error: string } {
  if (!enabled) return { ok: true, installments: [] };

  const parsedInstallments: ParsedInstallment[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const dueText = formString(formData, `installment_due_${index}`).trim();
    const amountText = formString(formData, `installment_amount_${index}`).trim();

    if (!dueText && !amountText) continue;

    const due = dueText ? parseDateInput(dueText) : null;
    if (dueText && !due) {
      return { ok: false, error: `Data da parcela ${index} inválida.` };
    }

    const installmentAmount = amountText ? parseMoneyInput(amountText) : 0;
    if (installmentAmount === null) {
      return { ok: false, error: `Valor da parcela ${index} inválido.` };
    }

    parsedInstallments.push({ due_on: due, amount: installmentAmount });
  }

  return { ok: true, installments: parsedInstallments };
}

async function resolveClientReference(
  supabase: Supabase,
  clientIdRaw: string,
): Promise<
  | { ok: true; clientId: string | null; clientName: string | null }
  | { ok: false; error: string }
> {
  if (!clientIdRaw) {
    return { ok: true, clientId: null, clientName: null };
  }
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientIdRaw)
    .maybeSingle();
  if (!client) {
    return { ok: false, error: "Cliente não encontrado. Selecione novamente." };
  }
  return { ok: true, clientId: client.id, clientName: client.name };
}

async function resolveProductReference(
  supabase: Supabase,
  productIdRaw: string,
): Promise<
  | {
      ok: true;
      productId: string | null;
      productName: string | null;
      productPv: number | null;
    }
  | { ok: false; error: string }
> {
  if (!productIdRaw) {
    return { ok: true, productId: null, productName: null, productPv: null };
  }
  const { data: product } = await supabase
    .from("products")
    .select("id, name, pv")
    .eq("id", productIdRaw)
    .maybeSingle();
  if (!product) {
    return { ok: false, error: "Produto não encontrado. Selecione novamente." };
  }
  return {
    ok: true,
    productId: product.id,
    productName: product.name,
    productPv: product.pv,
  };
}

function resolveMovementType(dealKind: string): "return" | "loan_out" | "sale" {
  if (dealKind === "return") return "return";
  if (dealKind === "loan_out") return "loan_out";
  return "sale";
}

async function saveInstallmentsAndStock(
  supabase: Supabase,
  params: {
    saleId: string;
    userId: string;
    soldOn: string;
    origin: string;
    observation: string | null;
    paymentCode: string;
    feePct: number | null;
    installments: ParsedInstallment[];
    productId: string | null;
    dealType: { kind: string; affects_stock: boolean | null };
  },
): Promise<string | null> {
  if (params.installments.length > 0) {
    const { error: paymentsError } = await supabase
      .from("sale_payments")
      .insert(
        params.installments.map((installment, index) => ({
          sale_id: params.saleId,
          installment: index + 1,
          due_on: installment.due_on,
          amount: installment.amount,
          method_code: params.paymentCode,
          fee_pct: params.feePct,
        })),
      );

    if (paymentsError) {
      console.error("createSale: falha ao inserir parcelas", paymentsError);
      await supabase.from("sales").delete().eq("id", params.saleId);
      return "Venda não registrada: falha ao salvar as parcelas. Tente novamente.";
    }
  }

  // Baixa/entrada de estoque para negócios que movimentam produto. A venda já
  // foi gravada; se a movimentação falhar, desfazemos a venda inteira.
  if (params.productId && params.origin && params.dealType.affects_stock) {
    const isReturn = params.dealType.kind === "return";
    const movementType = resolveMovementType(params.dealType.kind);

    const { error: stockError } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: params.productId,
        moved_on: params.soldOn,
        type: movementType,
        location_from: isReturn ? null : params.origin,
        location_to: isReturn ? params.origin : null,
        qty: 1,
        event_label: "Venda",
        sale_id: params.saleId,
        notes: params.observation,
        created_by: params.userId,
      });

    if (stockError) {
      console.error("createSale: falha ao movimentar estoque", stockError);
      await supabase.from("sales").delete().eq("id", params.saleId);
      return "Venda não registrada: falha ao atualizar o estoque. Tente novamente.";
    }
  }

  return null;
}

export async function createSale(
  _previous: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const user = await getSessionUser();
  if (!user) {
    return { error: "Sessão expirada. Entre novamente." };
  }

  const parsedFields = parseSaleFields(formData);
  if (!parsedFields.ok) {
    return { error: parsedFields.error };
  }
  const fields = parsedFields.fields;

  const supabase = await createClient();

  const { data: method } = await supabase
    .from("payment_methods")
    .select("code, kind, fee_pct")
    .eq("code", fields.paymentCode)
    .maybeSingle();

  if (!method) {
    return { error: "Forma de pagamento inválida." };
  }

  const ticketAccess = isTicketAccess(method);
  const amount = ticketAccess ? 0 : fields.amountInput;
  if (amount === null) {
    return { error: "Informe o valor recebido (ex.: 1.234,56)." };
  }

  const { data: dealType } = await supabase
    .from("deal_types")
    .select("code, kind, affects_stock")
    .eq("code", fields.dealCode)
    .maybeSingle();

  if (!dealType) {
    return { error: "Tipo de negócio inválido." };
  }

  const [clientRef, productRef] = await Promise.all([
    resolveClientReference(supabase, fields.clientIdRaw),
    resolveProductReference(supabase, fields.productIdRaw),
  ]);
  if (!clientRef.ok) return { error: clientRef.error };
  if (!productRef.ok) return { error: productRef.error };

  const installmentsResult = parseInstallments(
    formData,
    INSTALLMENT_KINDS.has(method.kind) && !ticketAccess,
  );
  if (!installmentsResult.ok) {
    return { error: installmentsResult.error };
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      sold_on: fields.soldOn,
      client_id: clientRef.clientId,
      client_name_raw: clientRef.clientName,
      payment_method_code: fields.paymentCode,
      deal_type_code: fields.dealCode,
      discount_pct: fields.discountPct,
      product_id: productRef.productId,
      product_name_raw: productRef.productName,
      origin: fields.origin,
      amount_received: amount,
      product_cost: fields.productCost,
      financial_cost: fields.financialCost,
      pv: fields.pvFilled ? fields.pvInput : (productRef.productPv ?? 0),
      obs: fields.observation,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (saleError || !sale) {
    console.error("createSale: falha ao inserir venda", saleError);
    return {
      error: "Não foi possível registrar a venda. Tente novamente.",
    };
  }

  const sideEffectsError = await saveInstallmentsAndStock(supabase, {
    saleId: sale.id,
    userId: user.id,
    soldOn: fields.soldOn,
    origin: fields.origin,
    observation: fields.observation,
    paymentCode: fields.paymentCode,
    feePct: method.fee_pct,
    installments: installmentsResult.installments,
    productId: productRef.productId,
    dealType,
  });

  if (sideEffectsError) {
    return { error: sideEffectsError };
  }

  revalidatePath("/painel");
  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/estoque/movimentacoes");
  if (productRef.productId) revalidatePath(`/estoque/${productRef.productId}`);
  redirect("/vendas?ok=1");
}
