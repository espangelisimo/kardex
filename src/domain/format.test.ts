import { describe, expect, it } from "vitest";
import { formatDateTime, formatSignedQuantity, MOVEMENT_KIND_LABEL } from "./format";

describe("formatSignedQuantity", () => {
  it("antepone + a los positivos", () => {
    expect(formatSignedQuantity(5)).toBe("+5");
  });
  it("usa el signo menos tipográfico en los negativos", () => {
    expect(formatSignedQuantity(-3)).toBe("−3");
  });
  it("no pone signo al cero", () => {
    expect(formatSignedQuantity(0)).toBe("0");
  });
  it("formatea en es-ES los máximos", () => {
    expect(formatSignedQuantity(2147483647)).toBe("+2.147.483.647");
    expect(formatSignedQuantity(-2147483648)).toBe("−2.147.483.648");
  });
});

describe("MOVEMENT_KIND_LABEL", () => {
  it("traduce los tres tipos", () => {
    expect(MOVEMENT_KIND_LABEL).toEqual({ in: "Entrada", out: "Salida", adjust: "Ajuste" });
  });
});

describe("formatDateTime", () => {
  // Las aserciones usan regex: el separador entre fecha y hora ("," o espacio) y
  // el relleno de ceros dependen de la versión de ICU.
  it("pasa al día siguiente en Madrid cuando en UTC aún es el anterior (invierno, UTC+1)", () => {
    const text = formatDateTime("2026-01-01T23:30:00Z");
    expect(text).toMatch(/^0?2\/0?1\/(20)?26\D+0?0:30$/);
  });
  it("aplica el horario de verano (UTC+2)", () => {
    const text = formatDateTime("2026-07-15T12:00:00Z");
    expect(text).toMatch(/^0?15\/0?7\/(20)?26\D+14:00$/);
  });
  it("cambia de día en verano con las 22:30 UTC", () => {
    const text = formatDateTime("2026-06-30T22:30:00Z");
    expect(text).toMatch(/^0?1\/0?7\/(20)?26\D+0?0:30$/);
  });
});
