"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import {
  isUuid,
  normalizeClientName,
  parsePhoneBR,
  type ClientDuplicate,
} from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";

export type ClientFormState = {
  error: string | null;
  duplicates?: ClientDuplicate[];
  allowOverride?: boolean;
};

export type MergeFormState = {
  error: string | null;
};

type DuplicateLookup =
  | { error: string; duplicates: [] }
  | { error: null; duplicates: ClientDuplicate[] };

async function requireBusinessSession() {
  const session = await getSession();
  if (
    !session?.profile ||
    (session.profile.role !== "admin" && session.profile.role !== "operator")
  ) {
    return null;
  }
  return session;
}

async function findDuplicates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    normalizedName: string;
    phoneDigits: string | null;
    whatsappDigits: string | null;
    excludeId?: string;
  },
): Promise<DuplicateLookup> {
  let nameQuery = supabase
    .from("clients")
    .select("id, name, phone, whatsapp")
    .eq("name_normalized", input.normalizedName)
    .limit(5);

  if (input.excludeId) {
    nameQuery = nameQuery.neq("id", input.excludeId);
  }

  const { data: nameMatches, error: nameError } = await nameQuery;
  if (nameError) {
    console.error("findDuplicates: falha ao buscar nomes", nameError);
    return {
      error: "Não foi possível verificar duplicatas. Tente novamente.",
      duplicates: [],
    };
  }

  const digits = [
    ...new Set(
      [input.phoneDigits, input.whatsappDigits].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];

  let contactMatches: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
  }[] = [];

  if (digits.length > 0) {
    const filters = digits.flatMap((digitsValue) => [
      `phone_normalized.eq.${digitsValue}`,
      `whatsapp_normalized.eq.${digitsValue}`,
    ]);

    let contactQuery = supabase
      .from("clients")
      .select("id, name, phone, whatsapp")
      .or(filters.join(","))
      .limit(5);

    if (input.excludeId) {
      contactQuery = contactQuery.neq("id", input.excludeId);
    }

    const { data, error } = await contactQuery;
    if (error) {
      console.error("findDuplicates: falha ao buscar contatos", error);
      return {
        error: "Não foi possível verificar duplicatas. Tente novamente.",
        duplicates: [],
      };
    }
    contactMatches = data ?? [];
  }

  const byId = new Map<string, ClientDuplicate>();

  for (const row of nameMatches ?? []) {
    byId.set(row.id, { ...row, reason: "mesmo nome" });
  }

  for (const row of contactMatches) {
    const existing = byId.get(row.id);
    if (existing) {
      existing.reason = "mesmo nome e telefone/WhatsApp";
    } else {
      byId.set(row.id, { ...row, reason: "telefone/WhatsApp" });
    }
  }

  return {
    error: null,
    duplicates: [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    ),
  };
}

function validateForm(formData: FormData):
  | {
      ok: true;
      name: string;
      normalizedName: string;
      phone: string | null;
      whatsapp: string | null;
      notes: string | null;
    }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (name.length < 2) {
    return { ok: false, error: "Informe o nome do cliente." };
  }
  if (name.length > 120) {
    return { ok: false, error: "O nome deve ter no máximo 120 caracteres." };
  }

  const phone = parsePhoneBR(formData.get("phone"));
  if (phone.error) {
    return { ok: false, error: `Telefone: ${phone.error}` };
  }

  const whatsapp = parsePhoneBR(formData.get("whatsapp"));
  if (whatsapp.error) {
    return { ok: false, error: `WhatsApp: ${whatsapp.error}` };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 1000) {
    return { ok: false, error: "As observações devem ter no máximo 1000 caracteres." };
  }

  return {
    ok: true,
    name,
    normalizedName: normalizeClientName(name),
    phone: phone.formatted,
    whatsapp: whatsapp.formatted,
    notes: notes || null,
  };
}

export async function createClientRecord(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const session = await requireBusinessSession();
  if (!session) {
    return { error: "Sua conta não tem permissão para cadastrar clientes." };
  }

  const parsed = validateForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const lookup = await findDuplicates(supabase, {
    normalizedName: parsed.normalizedName,
    phoneDigits: parsePhoneBR(parsed.phone).digits,
    whatsappDigits: parsePhoneBR(parsed.whatsapp).digits,
  });

  if (lookup.error) {
    return { error: lookup.error };
  }

  const sameName = lookup.duplicates.some((duplicate) =>
    duplicate.reason.includes("mesmo nome"),
  );
  const contactDuplicate = lookup.duplicates.length > 0;
  const confirmed = formData.get("confirm_duplicate") === "1";

  if (sameName) {
    return {
      error:
        "Já existe um cliente com este nome. Abra o cadastro existente ou mescle os registros.",
      duplicates: lookup.duplicates,
      allowOverride: false,
    };
  }

  if (contactDuplicate && !confirmed) {
    return {
      error:
        "Já existe um cliente com este telefone ou WhatsApp. Revise os cadastros abaixo ou confirme para criar mesmo assim.",
      duplicates: lookup.duplicates,
      allowOverride: true,
    };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: parsed.name,
      name_normalized: parsed.normalizedName,
      phone: parsed.phone,
      whatsapp: parsed.whatsapp,
      notes: parsed.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Já existe um cliente com este nome." };
    }
    console.error("createClientRecord: falha ao inserir", error);
    return { error: "Não foi possível cadastrar o cliente. Tente novamente." };
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}?ok=novo`);
}

export async function updateClientRecord(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const session = await requireBusinessSession();
  if (!session) {
    return { error: "Sua conta não tem permissão para editar clientes." };
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!isUuid(clientId)) {
    return { error: "Cliente inválido." };
  }

  const parsed = validateForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (currentError) {
    console.error("updateClientRecord: falha ao buscar cliente", currentError);
    return { error: "Não foi possível carregar o cliente. Tente novamente." };
  }
  if (!current) {
    return { error: "Cliente não encontrado." };
  }

  const lookup = await findDuplicates(supabase, {
    normalizedName: parsed.normalizedName,
    phoneDigits: parsePhoneBR(parsed.phone).digits,
    whatsappDigits: parsePhoneBR(parsed.whatsapp).digits,
    excludeId: clientId,
  });

  if (lookup.error) {
    return { error: lookup.error };
  }

  const sameName = lookup.duplicates.some((duplicate) =>
    duplicate.reason.includes("mesmo nome"),
  );
  const contactDuplicate = lookup.duplicates.length > 0;
  const confirmed = formData.get("confirm_duplicate") === "1";

  if (sameName) {
    return {
      error:
        "Já existe outro cliente com este nome. Abra o cadastro existente ou mescle os registros.",
      duplicates: lookup.duplicates,
      allowOverride: false,
    };
  }

  if (contactDuplicate && !confirmed) {
    return {
      error:
        "Já existe outro cliente com este telefone ou WhatsApp. Revise os cadastros abaixo ou confirme para salvar mesmo assim.",
      duplicates: lookup.duplicates,
      allowOverride: true,
    };
  }

  const { error } = await supabase
    .from("clients")
    .update({
      name: parsed.name,
      name_normalized: parsed.normalizedName,
      phone: parsed.phone,
      whatsapp: parsed.whatsapp,
      notes: parsed.notes,
    })
    .eq("id", clientId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe outro cliente com este nome." };
    }
    console.error("updateClientRecord: falha ao atualizar", error);
    return { error: "Não foi possível salvar o cliente. Tente novamente." };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?ok=editado`);
}

export async function mergeClientRecords(
  _previous: MergeFormState,
  formData: FormData,
): Promise<MergeFormState> {
  const session = await getSession();
  if (!session?.profile || session.profile.role !== "admin") {
    return { error: "Apenas administradores podem mesclar clientes." };
  }

  const sourceId = String(formData.get("source_id") ?? "").trim();
  const targetId = String(formData.get("target_id") ?? "").trim();

  if (!isUuid(sourceId) || !isUuid(targetId) || sourceId === targetId) {
    return { error: "Selecione dois clientes diferentes." };
  }

  if (formData.get("confirm") !== "1") {
    return { error: "Confirme que entende que o cadastro de origem será excluído." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_clients", {
    p_source: sourceId,
    p_target: targetId,
  });

  if (error) {
    console.error("mergeClientRecords: falha ao mesclar", error);
    if (error.code === "42501") {
      return { error: "Apenas administradores podem mesclar clientes." };
    }
    if (error.code === "P0002") {
      return { error: "Um dos clientes não foi encontrado. Recarregue a página." };
    }
    return { error: "Não foi possível mesclar os clientes. Tente novamente." };
  }

  revalidatePath("/painel");
  revalidatePath("/vendas");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${sourceId}`);
  revalidatePath(`/clientes/${targetId}`);
  redirect(`/clientes/${targetId}?ok=mesclado`);
}
