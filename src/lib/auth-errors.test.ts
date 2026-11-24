import { describe, expect, it } from "vitest";
import { authErrorMessage, GENERIC_AUTH_ERROR } from "./auth-errors";

describe("authErrorMessage", () => {
  it("traduce los códigos conocidos a español", () => {
    expect(authErrorMessage("invalid_credentials")).toBe("Email o contraseña incorrectos.");
    expect(authErrorMessage("user_already_exists")).toBe("Ya existe una cuenta con ese email.");
    expect(authErrorMessage("over_request_rate_limit")).toContain("Demasiados intentos");
  });
  it("devuelve el mensaje genérico para códigos desconocidos o ausentes", () => {
    for (const code of [undefined, "", "algo_raro", "constructor", "__proto__"]) {
      expect(authErrorMessage(code)).toBe(GENERIC_AUTH_ERROR);
    }
  });
});
