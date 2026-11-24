import { z } from "zod";
import { INT_MAX, INT_MIN, MOVEMENT_KINDS } from "./types";

// Esquemas de entrada (zod 4). Mensajes en español. Es UX: la garantía real
// está en Postgres (D-03); los errores llevan path para mostrarlos junto al input.

/** Acepta number o string entero ("12", " -3 "); cualquier otra cosa llega tal cual y falla. */
const integerInput = z.preprocess((value) => {
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return value;
}, z.number({ error: "Debe ser un número entero" }).int("Debe ser un número entero").min(INT_MIN, "Número demasiado pequeño").max(INT_MAX, "Número demasiado grande"));

export const productSchema = z.object({
  // Sin ningún espacio en blanco (también internos y tabs) y en mayúsculas.
  // Debe coincidir con los checks de products en Postgres (migración products_hardening):
  // el SKU es ASCII, así que ambos validan lo mismo. toUpperCase() puede expandir
  // ("ß" → "SS"): se acepta, y la base de datos guarda lo que produce zod.
  // El regex usa `*` porque la vacía ya la rechaza min(1) (un solo error por campo vacío).
  sku: z
    .string({ error: "El SKU es obligatorio" })
    .transform((value) => value.replace(/\s+/g, "").toUpperCase())
    .pipe(
      z
        .string()
        .min(1, "El SKU es obligatorio")
        .max(32, "El SKU admite 32 caracteres como máximo")
        .regex(/^[A-Z0-9._-]*$/, "El SKU solo admite letras (A-Z sin acentos ni ñ), números, punto, guion y guion bajo"),
    ),
  name: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(120, "El nombre admite 120 caracteres como máximo"),
  unit: z.string({ error: "La unidad es obligatoria" }).trim().min(1, "La unidad es obligatoria").max(20, "La unidad admite 20 caracteres como máximo").default("ud"),
  min_stock: integerInput.pipe(z.number().min(0, "El stock mínimo no puede ser negativo")).default(0),
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

export const movementSchema = z
  .object({
    productId: z.uuid({ error: "Producto no válido" }),
    kind: z.enum(MOVEMENT_KINDS, { error: "Tipo de movimiento no válido" }),
    // in/out: positivo (el esquema aplica el signo). adjust: cualquier entero salvo 0.
    quantity: integerInput,
    note: z
      .string()
      .trim()
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((data, ctx) => {
    // Fuera de rango ya tiene su propio error; no se duplica.
    if (data.quantity < INT_MIN) return;
    if (data.kind !== "adjust" && data.quantity <= 0) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "La cantidad debe ser mayor que 0" });
    } else if (data.kind === "adjust" && data.quantity === 0) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "El ajuste no puede ser 0" });
    }
    if (data.kind === "adjust" && data.note === null) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "El ajuste requiere una nota" });
    }
  })
  .transform((data) => ({
    productId: data.productId,
    kind: data.kind,
    quantity: data.kind === "out" ? -data.quantity : data.quantity,
    note: data.note,
  }));

export type MovementInput = z.input<typeof movementSchema>;
export type MovementData = z.output<typeof movementSchema>;

/** Longitud mínima de contraseña: debe coincidir con minimum_password_length de supabase/config.toml. */
export const PASSWORD_MIN_LENGTH = 6;

export const credentialsSchema = z.object({
  email: z
    .string({ error: "El email es obligatorio" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Introduce un email válido" })),
  // Sin trim: los espacios al principio o al final forman parte de la contraseña.
  password: z
    .string({ error: "La contraseña es obligatoria" })
    .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`),
});

export type CredentialsData = z.output<typeof credentialsSchema>;
