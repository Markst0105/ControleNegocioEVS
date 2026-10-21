import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { parseDateInput, todayISO } from "@/lib/format";
import { parsePriceSheet } from "@/lib/prices/import-price-sheet";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel accepts a 4.5 MB request body; stay below it.
const MAX_BYTES = 4 * 1024 * 1024;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.profile?.role !== "admin") {
    return fail("Apenas administradores podem importar preços.", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Não foi possível ler o arquivo enviado.", 400);
  }

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Selecione a planilha de preços.", 400);
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return fail("A planilha precisa ser um arquivo .xlsx.", 400);
  }
  if (file.size > MAX_BYTES) {
    return fail(
      "A planilha é grande demais (máximo 4 MB). Exporte apenas a aba de preços.",
      413,
    );
  }

  const validFrom = parseDateInput(formData.get("validade")) ?? todayISO();

  let parsed;
  try {
    parsed = await parsePriceSheet(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível ler a planilha.";
    return fail(message, 400);
  }

  if (parsed.rows.length === 0) {
    return fail("Nenhuma linha de preços foi reconhecida na planilha.", 400);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_price_sheet", {
    p_rows: parsed.rows,
    p_valid_from: validFrom,
  });

  if (error) {
    console.error("importPriceSheet: falha ao importar preços", error);
    if (error.code === "42501") {
      return fail("Sua conta não tem permissão para importar preços.", 403);
    }
    if (error.code === "22023") {
      return fail(error.message, 400);
    }
    return fail("Não foi possível importar os preços. Tente novamente.", 500);
  }

  return NextResponse.json({
    summary: data,
    sheet: parsed.sheet,
    skipped: parsed.skipped,
    unknownHeaders: parsed.unknownHeaders,
    duplicateSkus: parsed.duplicateSkus,
  });
}
