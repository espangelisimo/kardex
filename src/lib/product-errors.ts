export type ProductField = "sku" | "name" | "unit" | "min_stock";

export type ProductErrorResult = {
  /** Mensaje general, cuando el fallo no pertenece a un campo. */
  error?: string;
  fieldErrors?: Partial<Record<ProductField, string>>;
};

export const GENERIC_PRODUCT_ERROR = "No se ha podido guardar el producto. Inténtalo de nuevo.";

// Constraint de Postgres (check) → campo y mensaje propio. Los nombres están en la
// migración products_hardening; los límites coinciden con productSchema.
const CHECKS: Record<string, { field: ProductField; message: string }> = {
  products_sku_format: {
    field: "sku",
    message: "El SKU solo admite letras A-Z, números, punto, guion y guion bajo (hasta 32 caracteres)",
  },
  products_name_length: { field: "name", message: "El nombre admite 120 caracteres como máximo" },
  products_unit_length: { field: "unit", message: "La unidad admite 20 caracteres como máximo" },
  products_min_stock_check: { field: "min_stock", message: "El stock mínimo no puede ser negativo" },
};

/**
 * Traduce un error de Postgres (vía PostgREST) a un mensaje propio (S-08).
 * `message` solo se usa para localizar el nombre de la constraint; nunca se devuelve.
 */
export function translateProductError(error: { code?: string; message?: string }): ProductErrorResult {
  if (error.code === "23505") {
    return { fieldErrors: { sku: "Ya existe un producto con ese SKU" } };
  }
  if (error.code === "23514") {
    const name = /violates check constraint "([^"]+)"/.exec(error.message ?? "")?.[1];
    if (name !== undefined && Object.hasOwn(CHECKS, name)) {
      const check = CHECKS[name];
      if (check) return { fieldErrors: { [check.field]: check.message } };
    }
  }
  return { error: GENERIC_PRODUCT_ERROR };
}
