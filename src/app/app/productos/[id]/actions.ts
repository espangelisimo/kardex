"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { movementSchema } from "@/domain/schemas";
import { translateMovementError, type MovementField } from "@/lib/movement-errors";
import { createClient } from "@/lib/supabase/server";

const SESSION_ERROR = "Tu sesión ha caducado. Vuelve a entrar.";

// C-04: el éxito de registerMovement es un redirect a la ficha (que se pinta de nuevo
// con un request_id nuevo), así que solo modela el fallo.
export type MovementFormState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Partial<Record<MovementField, string>>;
      /** Valores enviados, para no perder lo que escribió el usuario. */
      values?: Partial<Record<MovementField, string>>;
    };

const FIELDS: readonly MovementField[] = ["kind", "quantity", "note"];

function readValues(formData: FormData): Partial<Record<MovementField, string>> {
  const values: Partial<Record<MovementField, string>> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

export async function registerMovement(_prev: MovementFormState, formData: FormData): Promise<MovementFormState> {
  const values = readValues(formData);

  const supabase = await createClient();
  // S-07: getUser() revalida el token; getSession() no.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: SESSION_ERROR, values };

  // S-06: validación en el servidor antes de tocar la base de datos.
  const parsed = movementSchema.safeParse({
    productId: formData.get("productId") ?? undefined,
    kind: formData.get("kind") ?? undefined,
    quantity: formData.get("quantity") ?? undefined,
    note: formData.get("note") ?? undefined,
    requestId: formData.get("requestId") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<MovementField, string>> = {};
    let error: string | undefined;
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const known = FIELDS.find((f) => f === field);
      if (known) {
        fieldErrors[known] ??= issue.message;
      } else {
        // productId o requestId: no tienen campo visible.
        error ??= issue.message;
      }
    }
    return { ok: false, error, fieldErrors, values };
  }

  const { productId, kind, quantity, note, requestId } = parsed.data;
  const { error } = await supabase.rpc("register_movement", {
    p_product_id: productId,
    p_kind: kind,
    p_quantity: quantity,
    p_note: note ?? undefined,
    p_request_id: requestId,
  });
  if (error) {
    console.error("registerMovement falló:", error.code);
    return { ok: false, ...translateMovementError(error), values };
  }

  const productPath = `/app/productos/${productId}`;
  revalidatePath(productPath);
  revalidatePath("/app/productos");
  revalidatePath("/app");
  redirect(productPath);
}
