import { describe, expect, it } from "vitest";
import { GENERIC_MOVEMENT_ERROR, translateMovementError } from "./movement-errors";

describe("translateMovementError", () => {
  it("insufficient_stock → error en quantity con el stock formateado en es-ES", () => {
    expect(translateMovementError({ code: "P0001", message: "insufficient_stock", details: "3" })).toEqual({
      fieldErrors: { quantity: "Stock insuficiente: hay 3" },
    });
    expect(translateMovementError({ code: "P0001", message: "insufficient_stock", details: "12345" })).toEqual({
      fieldErrors: { quantity: "Stock insuficiente: hay 12.345" },
    });
    expect(translateMovementError({ code: "P0001", message: "insufficient_stock", details: "0" })).toEqual({
      fieldErrors: { quantity: "Stock insuficiente: hay 0" },
    });
  });
  it.each([undefined, null, "", "abc", "1.5", "99999999999999999999"])(
    "insufficient_stock con details %j no numérico → sin cifra",
    (details) => {
      expect(translateMovementError({ code: "P0001", message: "insufficient_stock", details })).toEqual({
        fieldErrors: { quantity: "Stock insuficiente" },
      });
    },
  );
  it("23514 de stock_movements_adjust_requires_note → error en note", () => {
    expect(
      translateMovementError({
        code: "23514",
        message: 'new row for relation "stock_movements" violates check constraint "stock_movements_adjust_requires_note"',
      }),
    ).toEqual({ fieldErrors: { note: "El ajuste requiere una nota" } });
  });
  it("invalid_quantity_sign → error en quantity", () => {
    const result = translateMovementError({ code: "P0001", message: "invalid_quantity_sign" });
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["quantity"]);
    expect(result.error).toBeUndefined();
  });
  it("invalid_kind → error en kind", () => {
    const result = translateMovementError({ code: "P0001", message: "invalid_kind" });
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["kind"]);
  });
  it("product_archived → error general", () => {
    expect(translateMovementError({ code: "P0001", message: "product_archived" })).toEqual({
      error: "El producto está archivado: desarchívalo para registrar movimientos",
    });
  });
  it("product_not_found → error general", () => {
    expect(translateMovementError({ code: "P0002", message: "product_not_found" })).toEqual({
      error: "El producto no existe o no tienes acceso a él.",
    });
  });
  it("idempotency_conflict y el unique de request_id → error general de solicitud reutilizada", () => {
    const expected = {
      error: "Esta solicitud ya se usó para otro movimiento. Recarga la página e inténtalo de nuevo.",
    };
    expect(translateMovementError({ code: "P0001", message: "idempotency_conflict" })).toEqual(expected);
    expect(
      translateMovementError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "stock_movements_request_id_key"',
      }),
    ).toEqual(expected);
  });
  it("23505 de otra constraint → genérico", () => {
    expect(translateMovementError({ code: "23505", message: 'violates unique constraint "otra"' })).toEqual({
      error: GENERIC_MOVEMENT_ERROR,
    });
  });
  it("23514 de stock_movements_note_length → error en note", () => {
    expect(
      translateMovementError({
        code: "23514",
        message: 'new row for relation "stock_movements" violates check constraint "stock_movements_note_length"',
      }),
    ).toEqual({ fieldErrors: { note: "La nota admite 500 caracteres como máximo" } });
  });
  it("cualquier otro error → genérico, sin filtrar el mensaje crudo", () => {
    for (const error of [
      { code: "28000", message: "not_authenticated" },
      { code: "23514", message: 'violates check constraint "otra"' },
      { code: "XX000", message: "relation secreta falla" },
      {},
    ]) {
      const result = translateMovementError(error);
      expect(result).toEqual({ error: GENERIC_MOVEMENT_ERROR });
    }
  });
});
