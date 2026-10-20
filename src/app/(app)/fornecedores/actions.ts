"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/clients";
import { isSupplierRole, type SupplierRole } from "@/lib/suppliers";
import { createClient } from "@/lib/supabase/server";

export type SupplierFormState = {
  error: string | null;
};

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

function parseSupplierForm(formData: FormData):
  | {
      ok: true;
      name: string;
      roleHint: SupplierRole;
      active: boolean;
    }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (name.length < 2) {
    return { ok: false, error: "Informe o nome do fornecedor." };
  }
  if (name.length > 120) {
    return {
      ok: false,
      error: "O nome deve ter no máximo 120 caracteres.",
    };
  }

  const roleRaw = String(formData.get("role_hint") ?? "supplier");
  const roleHint = isSupplierRole(roleRaw) ? roleRaw : "supplier";

  return {
    ok: true,
    name,
    roleHint,
    active: formData.get("active") === "1",
  };
}

async function findDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  excludeId?: string,
) {
  let query = supabase
    .from("counterparties")
    .select("id, name")
    .ilike("name", name)
    .limit(5);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) {
    console.error("findDuplicate: falha ao buscar fornecedor", error);
    return {
      error: "Não foi possível verificar o nome. Tente novamente.",
      duplicate: null,
    };
  }

  const normalized = name.toLocaleLowerCase("pt-BR");
  const duplicate =
    (data ?? []).find(
      (row) => row.name.toLocaleLowerCase("pt-BR") === normalized,
    ) ?? null;

  return { error: null, duplicate };
}

function revalidateSupplierPaths(supplierId?: string) {
  revalidatePath("/fornecedores");
  if (supplierId) revalidatePath(`/fornecedores/${supplierId}`);
  revalidatePath("/compras");
  revalidatePath("/compras/nova");
  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/estoque/movimentacoes/nova");
}

export async function createSupplier(
  _previous: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const session = await requireBusinessSession();
  if (!session) {
    return { error: "Sua conta não tem permissão para cadastrar fornecedores." };
  }

  const parsed = parseSupplierForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const lookup = await findDuplicate(supabase, parsed.name);
  if (lookup.error) return { error: lookup.error };
  if (lookup.duplicate) {
    return { error: "Já existe um fornecedor com este nome." };
  }

  const { data, error } = await supabase
    .from("counterparties")
    .insert({
      name: parsed.name,
      role_hint: parsed.roleHint,
      active: parsed.active,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Já existe um fornecedor com este nome." };
    }
    console.error("createSupplier: falha ao inserir", error);
    return { error: "Não foi possível cadastrar o fornecedor. Tente novamente." };
  }

  revalidateSupplierPaths(data.id);
  redirect(`/fornecedores/${data.id}?ok=novo`);
}

export async function updateSupplier(
  _previous: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const session = await requireBusinessSession();
  if (!session) {
    return { error: "Sua conta não tem permissão para editar fornecedores." };
  }

  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  if (!isUuid(supplierId)) {
    return { error: "Fornecedor inválido." };
  }

  const parsed = parseSupplierForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const lookup = await findDuplicate(supabase, parsed.name, supplierId);
  if (lookup.error) return { error: lookup.error };
  if (lookup.duplicate) {
    return { error: "Já existe outro fornecedor com este nome." };
  }

  const { data, error } = await supabase
    .from("counterparties")
    .update({
      name: parsed.name,
      role_hint: parsed.roleHint,
      active: parsed.active,
    })
    .eq("id", supplierId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe outro fornecedor com este nome." };
    }
    console.error("updateSupplier: falha ao atualizar", error);
    return { error: "Não foi possível salvar o fornecedor. Tente novamente." };
  }
  if (!data) {
    return { error: "Fornecedor não encontrado. Recarregue a página." };
  }

  revalidateSupplierPaths(supplierId);
  redirect(`/fornecedores/${supplierId}?ok=editado`);
}
