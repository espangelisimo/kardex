export type MovementField = "kind" | "quantity" | "note";

export type MovementErrorResult = {
  /** Mensaje general, cuando el fallo no pertenece a un campo. */
  error?: string;
  fieldErrors?: Partial<Record<MovementField, string>>;
};

export const GENERIC_MOVEMENT_ERROR = "No se ha podido registrar el movimiento. Inténtalo de nuevo.";

const REQUEST_REUSED_ERROR = "Esta solicitud ya se usó para otro movimiento. Recarga la página e inténtalo de nuevo.";

const numberFormat = new Intl.NumberFormat("es-ES");

/**
 * Traduce un error de Postgres (vía PostgREST) de register_movement a un mensaje propio (S-08).
 * `message` y `details` solo se usan para identificar el error y extraer el stock;
 * el texto crudo nunca se devuelve.
 */
export function translateMovementError(error: {
  code?: string;
  message?: string;
  details?: string | null;
}): MovementErrorResult {
  const message = error.message ?? "";

  if (error.code === "23514" && message.includes("stock_movements_adjust_requires_note")) {
    return { fieldErrors: { note: "El ajuste requiere una nota" } };
  }

  // Doble envío concurrente con la misma clave: el unique de request_id.
  if (error.code === "23505" && message.includes("stock_movements_request_id_key")) {
    return { error: REQUEST_REUSED_ERROR };
  }
  if (error.code === "23514" && message.includes("stock_movements_note_length")) {
    return { fieldErrors: { note: "La nota admite 500 caracteres como máximo" } };
  }

  // Los errores propios de la función llevan su identificador en el mensaje (no en el código).
  switch (message) {
    case "insufficient_stock": {
      const detail = (error.details ?? "").trim();
      const stock = /^-?\d+$/.test(detail) ? Number(detail) : Number.NaN;
      return {
        fieldErrors: {
          quantity: Number.isSafeInteger(stock) ? `Stock insuficiente: hay ${numberFormat.format(stock)}` : "Stock insuficiente",
        },
      };
    }
    case "invalid_quantity_sign":
      return { fieldErrors: { quantity: "La cantidad no es válida para este tipo de movimiento" } };
    case "invalid_kind":
      return { fieldErrors: { kind: "Tipo de movimiento no válido" } };
    case "idempotency_conflict":
      return { error: REQUEST_REUSED_ERROR };
    case "product_archived":
      return { error: "El producto está archivado: desarchívalo para registrar movimientos" };
    case "product_not_found":
      return { error: "El producto no existe o no tienes acceso a él." };
    default:
      return { error: GENERIC_MOVEMENT_ERROR };
  }
}
