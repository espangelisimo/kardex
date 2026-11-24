import { describe, expect, it } from "vitest";
import { formatSignedQuantity, MOVEMENT_KIND_LABEL } from "./format";

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
