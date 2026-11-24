import { describe, expect, it } from "vitest";
import { credentialsSchema, movementSchema, productSchema } from "./schemas";
import { INT_MAX, INT_MIN } from "./types";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const validProduct = { sku: "abc1", name: "Tornillo", unit: "ud", min_stock: 0 };

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return result.error?.issues.map((i) => i.path.join(".")) ?? [];
}

describe("productSchema", () => {
  it("normaliza el SKU: sin espacios (internos incluidos) y en mayúsculas", () => {
    expect(productSchema.parse({ ...validProduct, sku: " ab c1 " }).sku).toBe("ABC1");
    expect(productSchema.parse({ ...validProduct, sku: "a\tb\n c" }).sku).toBe("ABC");
  });
  it("rechaza SKU vacío, solo espacios o ausente, con el error en sku", () => {
    for (const sku of ["", "   \t ", undefined]) {
      expect(issuePaths(productSchema.safeParse({ ...validProduct, sku }))).toEqual(["sku"]);
    }
  });
  it("recorta el nombre y rechaza vacío o de más de 120 caracteres", () => {
    expect(productSchema.parse({ ...validProduct, name: "  Tornillo  " }).name).toBe("Tornillo");
    expect(productSchema.parse({ ...validProduct, name: "a".repeat(120) }).name).toHaveLength(120);
    expect(issuePaths(productSchema.safeParse({ ...validProduct, name: "   " }))).toEqual(["name"]);
    expect(issuePaths(productSchema.safeParse({ ...validProduct, name: "a".repeat(121) }))).toEqual(["name"]);
    expect(issuePaths(productSchema.safeParse({ ...validProduct, name: undefined }))).toEqual(["name"]);
  });
  it("unidad: recorta, rechaza vacía y usa 'ud' si falta", () => {
    expect(productSchema.parse({ ...validProduct, unit: " kg " }).unit).toBe("kg");
    expect(productSchema.parse({ sku: "a", name: "n" }).unit).toBe("ud");
    expect(issuePaths(productSchema.safeParse({ ...validProduct, unit: "  " }))).toEqual(["unit"]);
    expect(issuePaths(productSchema.safeParse({ ...validProduct, unit: 5 }))).toEqual(["unit"]);
  });
  it("min_stock: por defecto 0, acepta 0, enteros y strings numéricos del formulario", () => {
    expect(productSchema.parse({ sku: "a", name: "n" }).min_stock).toBe(0);
    expect(productSchema.parse({ ...validProduct, min_stock: 0 }).min_stock).toBe(0);
    expect(productSchema.parse({ ...validProduct, min_stock: "12" }).min_stock).toBe(12);
    expect(productSchema.parse({ ...validProduct, min_stock: INT_MAX }).min_stock).toBe(INT_MAX);
  });
  it.each([-1, "-1", 1.5, "1.5", NaN, "abc", "", "  ", null, INT_MAX + 1, `${INT_MAX + 1}`])(
    "min_stock rechaza %j",
    (min_stock) => {
      expect(issuePaths(productSchema.safeParse({ ...validProduct, min_stock }))).toEqual(["min_stock"]);
    },
  );
});

describe("movementSchema", () => {
  const base = { productId: UUID, note: undefined };

  it("in: cantidad positiva se conserva", () => {
    expect(movementSchema.parse({ ...base, kind: "in", quantity: 5 })).toEqual({
      productId: UUID,
      kind: "in",
      quantity: 5,
      note: null,
    });
  });
  it("out: la cantidad llega en positivo y sale en negativo", () => {
    expect(movementSchema.parse({ ...base, kind: "out", quantity: 5 }).quantity).toBe(-5);
    expect(movementSchema.parse({ ...base, kind: "out", quantity: "3" }).quantity).toBe(-3);
    expect(movementSchema.parse({ ...base, kind: "out", quantity: INT_MAX }).quantity).toBe(-INT_MAX);
  });
  it.each(["in", "out"] as const)("%s rechaza 0 y negativos en quantity", (kind) => {
    for (const quantity of [0, -1, "0", "-4"]) {
      expect(issuePaths(movementSchema.safeParse({ ...base, kind, quantity }))).toEqual(["quantity"]);
    }
  });
  it("adjust admite cualquier entero salvo 0, tal cual", () => {
    expect(movementSchema.parse({ ...base, kind: "adjust", quantity: -4, note: "merma" }).quantity).toBe(-4);
    expect(movementSchema.parse({ ...base, kind: "adjust", quantity: 4, note: "recuento" }).quantity).toBe(4);
    expect(movementSchema.parse({ ...base, kind: "adjust", quantity: INT_MIN, note: "x" }).quantity).toBe(INT_MIN);
    expect(issuePaths(movementSchema.safeParse({ ...base, kind: "adjust", quantity: 0, note: "x" }))).toEqual([
      "quantity",
    ]);
  });
  it.each([1.5, "1.5", NaN, "", "abc", null, undefined, INT_MAX + 1, INT_MIN - 1])(
    "rechaza la cantidad %j",
    (quantity) => {
      expect(issuePaths(movementSchema.safeParse({ ...base, kind: "adjust", quantity, note: "x" }))).toEqual([
        "quantity",
      ]);
      expect(issuePaths(movementSchema.safeParse({ ...base, kind: "in", quantity }))).toEqual(["quantity"]);
    },
  );
  it("adjust exige nota no vacía tras recortar, con el error en note", () => {
    for (const note of [undefined, null, "", "   \t "]) {
      expect(issuePaths(movementSchema.safeParse({ ...base, kind: "adjust", quantity: 1, note }))).toEqual(["note"]);
    }
  });
  it("la nota se recorta; en in/out una nota vacía queda como null", () => {
    expect(movementSchema.parse({ ...base, kind: "adjust", quantity: 1, note: "  recuento " }).note).toBe("recuento");
    expect(movementSchema.parse({ ...base, kind: "in", quantity: 1, note: "   " }).note).toBeNull();
    expect(movementSchema.parse({ ...base, kind: "in", quantity: 1, note: "compra" }).note).toBe("compra");
  });
  it("rechaza productId no uuid y tipo desconocido", () => {
    expect(issuePaths(movementSchema.safeParse({ ...base, productId: "no", kind: "in", quantity: 1 }))).toEqual([
      "productId",
    ]);
    expect(issuePaths(movementSchema.safeParse({ ...base, kind: "bogus", quantity: 1 }))).toEqual(["kind"]);
  });
  it("los mensajes están en español", () => {
    const result = movementSchema.safeParse({ ...base, kind: "in", quantity: 0 });
    expect(result.error?.issues[0]?.message).toBe("La cantidad debe ser mayor que 0");
  });
});

describe("credentialsSchema", () => {
  it("normaliza el email (trim y minúsculas) y deja la contraseña intacta", () => {
    expect(credentialsSchema.parse({ email: "  Ana@Example.COM ", password: " abcdef " })).toEqual({
      email: "ana@example.com",
      password: " abcdef ",
    });
  });
  it("acepta una contraseña de exactamente 6 caracteres y rechaza una de 5", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.es", password: "123456" }).success).toBe(true);
    expect(issuePaths(credentialsSchema.safeParse({ email: "a@b.es", password: "12345" }))).toEqual(["password"]);
  });
  it("no recorta la contraseña: 5 caracteres más un espacio cuentan como 6", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.es", password: "12345 " }).success).toBe(true);
  });
  it("rechaza email vacío, solo espacios, ausente o sin formato válido, con el error en email", () => {
    for (const email of ["", "   ", undefined, "sin-arroba", "a@", "a b@c.es"]) {
      expect(issuePaths(credentialsSchema.safeParse({ email, password: "123456" }))).toEqual(["email"]);
    }
  });
  it("rechaza contraseña vacía o ausente, con el error en password", () => {
    for (const password of ["", undefined]) {
      expect(issuePaths(credentialsSchema.safeParse({ email: "a@b.es", password }))).toEqual(["password"]);
    }
  });
  it("informa de ambos campos a la vez", () => {
    expect(issuePaths(credentialsSchema.safeParse({ email: "", password: "" })).sort()).toEqual(["email", "password"]);
  });
});
