import { describe, expect, it } from "vitest";
import { applyMovement, computeStock, isLowStock, runningBalance, validateQuantitySign } from "./stock";
import { INT_MAX, INT_MIN } from "./types";

describe("computeStock", () => {
  it("devuelve 0 con una lista vacía", () => {
    expect(computeStock([])).toBe(0);
  });
  it("suma cantidades con signo", () => {
    expect(computeStock([{ quantity: 10 }, { quantity: -3 }, { quantity: -7 }, { quantity: 2 }])).toBe(2);
  });
  it("puede quedar exactamente en 0", () => {
    expect(computeStock([{ quantity: 5 }, { quantity: -5 }])).toBe(0);
  });
});

describe("validateQuantitySign", () => {
  it.each([
    ["in", 1],
    ["in", INT_MAX],
    ["out", -1],
    ["out", INT_MIN],
    ["adjust", 1],
    ["adjust", -1],
    ["adjust", INT_MIN],
    ["adjust", INT_MAX],
  ] as const)("acepta %s con %d", (kind, quantity) => {
    expect(validateQuantitySign(kind, quantity)).toEqual({ ok: true });
  });

  it.each([
    ["in", 0],
    ["in", -1],
    ["out", 0],
    ["out", 1],
    ["adjust", 0],
  ] as const)("rechaza %s con %d por signo", (kind, quantity) => {
    expect(validateQuantitySign(kind, quantity)).toEqual({ ok: false, error: "invalid_quantity_sign" });
  });

  it.each([1.5, NaN, Infinity, INT_MAX + 1, INT_MIN - 1])("rechaza %d por no ser un integer válido", (quantity) => {
    expect(validateQuantitySign("adjust", quantity)).toEqual({ ok: false, error: "quantity_out_of_range" });
  });

  it("-0 no es válido para out ni adjust", () => {
    expect(validateQuantitySign("out", -0).ok).toBe(false);
    expect(validateQuantitySign("adjust", -0).ok).toBe(false);
  });
});

describe("applyMovement", () => {
  it("entrada suma al stock", () => {
    expect(applyMovement(5, { kind: "in", quantity: 3 })).toEqual({ ok: true, stock: 8 });
  });
  it("salida que deja el stock exactamente en 0 es válida", () => {
    expect(applyMovement(4, { kind: "out", quantity: -4 })).toEqual({ ok: true, stock: 0 });
  });
  it("salida que dejaría stock negativo se rechaza e informa del stock actual", () => {
    expect(applyMovement(4, { kind: "out", quantity: -5 })).toEqual({
      ok: false,
      error: "insufficient_stock",
      stock: 4,
    });
  });
  it("salida con stock 0 se rechaza", () => {
    expect(applyMovement(0, { kind: "out", quantity: -1 })).toMatchObject({ ok: false, error: "insufficient_stock" });
  });
  it("ajuste negativo también respeta el stock no negativo", () => {
    expect(applyMovement(2, { kind: "adjust", quantity: -3, note: "merma" })).toMatchObject({
      ok: false,
      error: "insufficient_stock",
      stock: 2,
    });
  });
  it("ajuste con nota se aplica en ambos sentidos", () => {
    expect(applyMovement(2, { kind: "adjust", quantity: 3, note: "recuento" })).toEqual({ ok: true, stock: 5 });
    expect(applyMovement(5, { kind: "adjust", quantity: -5, note: " recuento " })).toEqual({ ok: true, stock: 0 });
  });
  it.each([undefined, null, "", "   \t "])("ajuste sin nota útil (%j) exige nota", (note) => {
    expect(applyMovement(5, { kind: "adjust", quantity: 1, note })).toEqual({ ok: false, error: "note_required" });
  });
  it("entrada y salida no exigen nota", () => {
    expect(applyMovement(1, { kind: "in", quantity: 1 }).ok).toBe(true);
    expect(applyMovement(1, { kind: "out", quantity: -1 }).ok).toBe(true);
  });
  it("rechaza signo incorrecto y cantidad 0 antes de mirar el stock", () => {
    expect(applyMovement(5, { kind: "out", quantity: 2 })).toEqual({ ok: false, error: "invalid_quantity_sign" });
    expect(applyMovement(5, { kind: "in", quantity: 0 })).toEqual({ ok: false, error: "invalid_quantity_sign" });
  });
  it("rechaza decimales, NaN y valores sobre INT_MAX", () => {
    for (const quantity of [0.5, NaN, INT_MAX + 1]) {
      expect(applyMovement(5, { kind: "in", quantity })).toEqual({ ok: false, error: "quantity_out_of_range" });
    }
  });
});

describe("isLowStock", () => {
  it("es bajo cuando stock < mínimo", () => {
    expect(isLowStock(2, 5)).toBe(true);
  });
  it("es bajo cuando stock == mínimo", () => {
    expect(isLowStock(5, 5)).toBe(true);
  });
  it("no es bajo cuando stock > mínimo", () => {
    expect(isLowStock(6, 5)).toBe(false);
  });
  it("con mínimo 0 solo es bajo en stock 0", () => {
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(1, 0)).toBe(false);
  });
});

describe("runningBalance", () => {
  it("lista vacía devuelve vacía", () => {
    expect(runningBalance([])).toEqual([]);
  });
  it("acumula en el orden recibido", () => {
    expect(runningBalance([{ quantity: 10 }, { quantity: -4 }, { quantity: -6 }, { quantity: 3 }])).toEqual([
      10, 6, 0, 3,
    ]);
  });
});
