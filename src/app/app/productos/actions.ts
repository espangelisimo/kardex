"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { productSchema } from "@/domain/schemas";
import { translateProductError, type ProductField } from "@/lib/product-errors";
import { createClient } from "@/lib/supabase/server";

const PRODUCTS_PATH = "/app/productos";
const GENERIC_ERROR = "No se ha podido completar la operación. Inténtalo de nuevo.";
const SESSION_ERROR = "Tu sesión ha caducado. Vuelve a entrar.";

// C-04: el éxito de saveProduct es un redirect (no devuelve datos a la UI), así que
// solo modela el fallo; setArchived sí devuelve { ok: true }.
export type ProductFormState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Partial<Record<ProductField, string>>;
      /** Valores enviados, para no perder lo que escribió el usuario. */
      values?: Partial<Record<ProductField, string>>;
    };

const FIELDS: readonly ProductField[] = ["sku", "name", "unit", "min_stock"];

function readValues(formData: FormData): Partial<Record<ProductField, string>> {
  const values: Partial<Record<ProductField, string>> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

export async function saveProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const values = readValues(formData);

  const supabase = await createClient();
  // S-07: getUser() revalida el token; getSession() no.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: SESSION_ERROR, values };

  // S-06: validación en el servidor antes de tocar la base de datos.
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId !== "" ? rawId : undefined;
  if (id !== undefined && !z.uuid().safeParse(id).success) {
    return { ok: false, error: "Producto no válido", values };
  }

  const parsed = productSchema.safeParse({
    sku: formData.get("sku") ?? undefined,
    name: formData.get("name") ?? undefined,
    // Un campo vacío del formulario llega como "": que decida el esquema.
    unit: formData.get("unit") ?? undefined,
    min_stock: formData.get("min_stock") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<ProductField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (FIELDS.some((f) => f === field) && typeof field === "string" && !fieldErrors[field as ProductField]) {
        fieldErrors[field as ProductField] = issue.message;
      }
    }
    return { ok: false, fieldErrors, values };
  }

  if (id !== undefined) {
    // La RLS (S-03) es el control: un id ajeno no es visible y no afecta a ninguna fila.
    const { data, error } = await supabase.from("products").update(parsed.data).eq("id", id).select("id");
    if (error) {
      console.error("saveProduct (update) falló:", error.code);
      return { ok: false, ...translateProductError(error), values };
    }
    if (data.length === 0) {
      return { ok: false, error: "El producto no existe o no tienes acceso a él.", values };
    }
  } else {
    // v1: un usuario pertenece a un solo workspace (lo crea el trigger de alta).
    const { data: member, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.user.id)
      .limit(1)
      .maybeSingle();
    if (memberError || !member) {
      console.error("saveProduct (workspace) falló:", memberError?.code);
      return { ok: false, error: GENERIC_ERROR, values };
    }
    const { error } = await supabase.from("products").insert({ ...parsed.data, workspace_id: member.workspace_id });
    if (error) {
      console.error("saveProduct (insert) falló:", error.code);
      return { ok: false, ...translateProductError(error), values };
    }
  }

  revalidatePath(PRODUCTS_PATH);
  redirect(PRODUCTS_PATH);
}

/** Archiva (archived = "true") o desarchiva ("false") un producto. Nunca se borran (AC-04.3). */
export async function setArchived(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const parsed = z
    .object({ id: z.uuid({ error: "Producto no válido" }), archived: z.enum(["true", "false"], { error: "Acción no válida" }) })
    .safeParse({ id: formData.get("id"), archived: formData.get("archived") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: SESSION_ERROR };

  const archiving = parsed.data.archived === "true";
  // Al archivar solo se toca si sigue activo (`archived_at is null`): así se conserva
  // la fecha original de un producto ya archivado.
  let query = supabase
    .from("products")
    .update({ archived_at: archiving ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);
  if (archiving) query = query.is("archived_at", null);
  const { data, error } = await query.select("id");
  if (error) {
    console.error("setArchived falló:", error.code);
    return { ok: false, ...translateProductError(error) };
  }
  if (data.length === 0) {
    // Cero filas: o ya estaba archivado (éxito idempotente) o no existe / no es visible por RLS.
    const { data: existing, error: existsError } = archiving
      ? await supabase.from("products").select("id").eq("id", parsed.data.id).maybeSingle()
      : { data: null, error: null };
    if (existsError) {
      console.error("setArchived (comprobación) falló:", existsError.code);
      return { ok: false, ...translateProductError(existsError) };
    }
    if (!existing) return { ok: false, error: "El producto no existe o no tienes acceso a él." };
  }

  revalidatePath(PRODUCTS_PATH);
  return { ok: true };
}
