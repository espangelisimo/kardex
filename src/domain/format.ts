// Formato de movimientos para la interfaz. Puro (C-03).
import type { MovementKind } from "./types";

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  in: "Entrada",
  out: "Salida",
  adjust: "Ajuste",
};

const numberFormat = new Intl.NumberFormat("es-ES");

/** Cantidad con signo explícito y menos tipográfico (U+2212): +5, −3, 0. */
export function formatSignedQuantity(quantity: number): string {
  if (quantity > 0) return `+${numberFormat.format(quantity)}`;
  if (quantity < 0) return `−${numberFormat.format(Math.abs(quantity))}`;
  return numberFormat.format(0);
}

// Siempre en hora de Madrid: el servidor (UTC en Vercel) y el navegador no deben
// mostrar fechas distintas para el mismo movimiento.
const dateTimeFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

/** Fecha y hora corta en es-ES y zona Europe/Madrid, a partir de un ISO 8601. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
