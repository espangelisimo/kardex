import { INT_MAX, INT_MIN, type Movement, type MovementKind } from "./types";

// Lógica de stock pura. No lanza excepciones: devuelve resultados discriminados.
// Los códigos de error coinciden con los de register_movement() en Postgres,
// que es quien garantiza de verdad las reglas (D-03); esto es UX y cálculo.
// Código propio (no existe en Postgres): 'quantity_out_of_range', cantidad que no
// cabe en un integer o no es un entero.

export type QuantityError = "invalid_quantity_sign" | "quantity_out_of_range";

export type ValidateQuantityResult = { ok: true } | { ok: false; error: QuantityError };

export type ApplyMovementResult =
  | { ok: true; stock: number }
  | { ok: false; error: QuantityError | "note_required" }
  | { ok: false; error: "insufficient_stock"; stock: number };

/** Stock = suma de las cantidades con signo (ADR-0002). */
export function computeStock(movements: readonly Pick<Movement, "quantity">[]): number {
  return movements.reduce((total, m) => total + m.quantity, 0);
}

/** in > 0, out < 0, adjust distinto de 0; entero dentro del rango integer. */
export function validateQuantitySign(kind: MovementKind, quantity: number): ValidateQuantityResult {
  if (!Number.isInteger(quantity) || quantity < INT_MIN || quantity > INT_MAX) {
    return { ok: false, error: "quantity_out_of_range" };
  }
  const validSign =
    (kind === "in" && quantity > 0) ||
    (kind === "out" && quantity < 0) ||
    (kind === "adjust" && quantity !== 0);
  return validSign ? { ok: true } : { ok: false, error: "invalid_quantity_sign" };
}

/** Stock resultante de aplicar un movimiento, o el motivo por el que se rechaza. */
export function applyMovement(stock: number, movement: Movement): ApplyMovementResult {
  const sign = validateQuantitySign(movement.kind, movement.quantity);
  if (!sign.ok) return sign;
  if (movement.kind === "adjust" && (movement.note ?? "").trim().length === 0) {
    return { ok: false, error: "note_required" };
  }
  const next = stock + movement.quantity;
  if (next < 0) return { ok: false, error: "insufficient_stock", stock };
  return { ok: true, stock: next };
}

/** Stock bajo: stock <= mínimo (AC-04.1). */
export function isLowStock(stock: number, minStock: number): boolean {
  return stock <= minStock;
}

/** Stock acumulado tras cada movimiento, en el orden recibido. */
export function runningBalance(movements: readonly Pick<Movement, "quantity">[]): number[] {
  let total = 0;
  return movements.map((m) => (total += m.quantity));
}
