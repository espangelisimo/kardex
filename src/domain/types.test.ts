import { describe, expect, expectTypeOf, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { MOVEMENT_KINDS, type MovementKind } from "./types";

describe("tipos del dominio", () => {
  it("MovementKind coincide con el enum movement_kind de Postgres (falla en typecheck si divergen)", () => {
    expectTypeOf<MovementKind>().toEqualTypeOf<Database["public"]["Enums"]["movement_kind"]>();
    expect([...MOVEMENT_KINDS]).toEqual(["in", "out", "adjust"]);
  });
});
