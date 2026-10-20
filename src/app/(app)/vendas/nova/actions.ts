"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { parseDateInput, parseMoneyInput, parsePercentInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type SaleFormState = {
  error: string | null;
};

const ORIGINS = new Set(["EVS", "CASA"]);
const INSTALLMENT_KINDS = new Set(["credit", "ticket", "exception"]);

type ParsedInstallment = {
  due_on: string | null;
  amount: number;
};

function optionalMoney(
  raw: FormDataEntryValue | null,
): { ok: true; value: number } | { ok: false } {
  const text = raw === null ? "" : String(raw).trim();
  if (!text) return { ok: true, value: 0 };
  const parsed = parseMoneyInput(text);
  return parsed === null ? { ok: false } : { ok: true, value: parsed };
}

export async function createSale(
  _previous: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const user = await getSessionUser();
  if (!user) {
    return { error: "Sessão expirada. Entre novamente." };
  }

  const soldOn = parseDateInput(formData.get("sold_on"));
  if (!soldOn) {
    return { error: "Informe uma data válida para a venda." };
  }

  const origin = String(formData.get("origin") ?? "");
  if (!ORIGINS.has(origin)) {
    return { error: "Selecione a origem (EVS ou CASA)." };
  }

  const paymentCode = String(formData.get("payment_method_code") ?? "").trim();
  if (!paymentCode) {
    return { error: "Selecione a forma de pagamento." };
  }

  const dealInput = String(formData.get("deal_type_code") ?? "").trim();
  if (!dealInput) {
    return { error: "Selecione o tipo de negócio." };
  }

  const amount = parseMoneyInput(formData.get("amount_received"));
  if (amount === null) {
    return { error: "Informe o valor recebido (ex.: 1.234,56)." };
  }

  const productCost = optionalMoney(formData.get("product_cost"));
  if (!productCost.ok) {
    return { error: "Custo do produto inválido (ex.: 12,50)." };
  }

  const financialCost = optionalMoney(formData.get("financial_cost"));
  if (!financialCost.ok) {
    return { error: "Custo financeiro inválido (ex.: 3,20)." };
  }

  const pvInput = optionalMoney(formData.get("pv"));
  if (!pvInput.ok) {
    return { error: "PV inválido (ex.: 1,95)." };
  }
  const pvFilled = String(formData.get("pv") ?? "").trim() !== "";

  let dealCode = dealInput;
  let discountPct = 0;

  if (dealInput === "DESC") {
    const percent = parsePercentInput(formData.get("discount_pct"));
    if (percent === undefined || percent <= 0 || percent >= 1) {
      return { error: "Informe o desconto em % (entre 0 e 100)." };
    }
    // Convenção da planilha: desconto vira venda (0) + fração de desconto.
    dealCode = "0";
    discountPct = percent;
  }

  const observation = String(formData.get("obs") ?? "").trim() || null;

  const supabase = await createClient();

  const { data: method } = await supabase
    .from("payment_methods")
    .select("code, kind, fee_pct")
    .eq("code", paymentCode)
    .maybeSingle();

  if (!method) {
    return { error: "Forma de pagamento inválida." };
  }

  const { data: dealType } = await supabase
    .from("deal_types")
    .select("code, kind, affects_stock")
    .eq("code", dealCode)
    .maybeSingle();

  if (!dealType) {
    return { error: "Tipo de negócio inválido." };
  }

  const clientIdRaw = String(formData.get("client_id") ?? "").trim();
  let clientId: string | null = null;
  let clientName: string | null = null;

  if (clientIdRaw) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", clientIdRaw)
      .maybeSingle();
    if (!client) {
      return { error: "Cliente não encontrado. Selecione novamente." };
    }
    clientId = client.id;
    clientName = client.name;
  }

  const productIdRaw = String(formData.get("product_id") ?? "").trim();
  let productId: string | null = null;
  let productName: string | null = null;
  let productPv: number | null = null;

  if (productIdRaw) {
    const { data: product } = await supabase
      .from("products")
      .select("id, name, pv")
      .eq("id", productIdRaw)
      .maybeSingle();
    if (!product) {
      return { error: "Produto não encontrado. Selecione novamente." };
    }
    productId = product.id;
    productName = product.name;
    productPv = product.pv;
  }

  const parsedInstallments: ParsedInstallment[] = [];

  if (INSTALLMENT_KINDS.has(method.kind)) {
    for (let index = 1; index <= 3; index += 1) {
      const dueRaw = formData.get(`installment_due_${index}`);
      const amountRaw = formData.get(`installment_amount_${index}`);

      const dueText = String(dueRaw ?? "").trim();
      const amountText = String(amountRaw ?? "").trim();

      if (!dueText && !amountText) continue;

      const due = dueText ? parseDateInput(dueText) : null;
      if (dueText && !due) {
        return { error: `Data da parcela ${index} inválida.` };
      }

      const installmentAmount = amountText ? parseMoneyInput(amountText) : 0;
      if (installmentAmount === null) {
        return { error: `Valor da parcela ${index} inválido.` };
      }

      parsedInstallments.push({ due_on: due, amount: installmentAmount });
    }
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      sold_on: soldOn,
      client_id: clientId,
      client_name_raw: clientName,
      payment_method_code: paymentCode,
      deal_type_code: dealCode,
      discount_pct: discountPct,
      product_id: productId,
      product_name_raw: productName,
      origin,
      amount_received: amount,
      product_cost: productCost.value,
      financial_cost: financialCost.value,
      pv: pvFilled ? pvInput.value : (productPv ?? 0),
      obs: observation,
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

  if (parsedInstallments.length > 0) {
    const { error: paymentsError } = await supabase
      .from("sale_payments")
      .insert(
        parsedInstallments.map((installment, index) => ({
          sale_id: sale.id,
          installment: index + 1,
          due_on: installment.due_on,
          amount: installment.amount,
          method_code: paymentCode,
          fee_pct: method.fee_pct,
        })),
      );

    if (paymentsError) {
      console.error("createSale: falha ao inserir parcelas", paymentsError);
      await supabase.from("sales").delete().eq("id", sale.id);
      return {
        error:
          "Venda não registrada: falha ao salvar as parcelas. Tente novamente.",
      };
    }
  }

  // Baixa/entrada de estoque para negócios que movimentam produto. A venda já
  // foi gravada; se a movimentação falhar, desfazemos a venda inteira.
  if (productId && origin && dealType.affects_stock) {
    const isReturn = dealType.kind === "return";
    const movementType =
      dealType.kind === "return"
        ? "return"
        : dealType.kind === "loan_out"
          ? "loan_out"
          : "sale";

    const { error: stockError } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: productId,
        moved_on: soldOn,
        type: movementType,
        location_from: isReturn ? null : origin,
        location_to: isReturn ? origin : null,
        qty: 1,
        event_label: "Venda",
        sale_id: sale.id,
        notes: observation,
        created_by: user.id,
      });

    if (stockError) {
      console.error("createSale: falha ao movimentar estoque", stockError);
      await supabase.from("sales").delete().eq("id", sale.id);
      return {
        error:
          "Venda não registrada: falha ao atualizar o estoque. Tente novamente.",
      };
    }
  }

  revalidatePath("/painel");
  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/estoque/movimentacoes");
  if (productId) revalidatePath(`/estoque/${productId}`);
  redirect("/vendas?ok=1");
}
