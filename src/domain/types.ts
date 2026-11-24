// Tipos del dominio. Puros: sin imports de next, react ni @supabase/* (C-03).
// Un test comprueba en compilación que MovementKind coincide con el enum de Postgres.

export type MovementKind = "in" | "out" | "adjust";

export const MOVEMENT_KINDS = ["in", "out", "adjust"] as const satisfies readonly MovementKind[];

/** Movimiento con la cantidad YA con signo (in > 0, out < 0), como se guarda en la base. */
export type Movement = {
  kind: MovementKind;
  quantity: number;
  note?: string | null;
};

/** Rango del tipo `integer` de Postgres. */
export const INT_MIN = -2147483648;
export const INT_MAX = 2147483647;
