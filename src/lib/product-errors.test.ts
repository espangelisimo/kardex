import { describe, expect, it } from "vitest";
import { GENERIC_PRODUCT_ERROR, translateProductError } from "./product-errors";

const check = (name: string) => ({
  code: "23514",
  message: `new row for relation "products" violates check constraint "${name}"`,
});

describe("translateProductError", () => {
  it("23505 (SKU duplicado) → error en el campo sku", () => {
    expect(translateProductError({ code: "23505", message: "duplicate key ... products_workspace_id_sku_key" })).toEqual({
      fieldErrors: { sku: "Ya existe un producto con ese SKU" },
    });
  });
  it.each([
    ["products_sku_format", "sku"],
    ["products_name_length", "name"],
    ["products_unit_length", "unit"],
    ["products_min_stock_check", "min_stock"],
  ])("23514 en %s → error en el campo %s", (name, field) => {
    const result = translateProductError(check(name));
    expect(result.error).toBeUndefined();
    expect(Object.keys(result.fieldErrors ?? {})).toEqual([field]);
  });
  it("23514 de una constraint desconocida o sin mensaje → genérico", () => {
    expect(translateProductError(check("otra"))).toEqual({ error: GENERIC_PRODUCT_ERROR });
    expect(translateProductError(check("constructor"))).toEqual({ error: GENERIC_PRODUCT_ERROR });
    expect(translateProductError({ code: "23514" })).toEqual({ error: GENERIC_PRODUCT_ERROR });
  });
  it("cualquier otro código → genérico, sin filtrar el mensaje crudo", () => {
    for (const error of [{ code: "42501", message: "permission denied for table products" }, { code: undefined }, {}]) {
      expect(translateProductError(error)).toEqual({ error: GENERIC_PRODUCT_ERROR });
    }
  });
});
