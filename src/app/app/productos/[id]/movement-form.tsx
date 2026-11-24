"use client";

import { useActionState, useState } from "react";
import { MOVEMENT_KIND_LABEL } from "@/domain/format";
import { MOVEMENT_KINDS, type MovementKind } from "@/domain/types";
import { registerMovement, type MovementFormState } from "./actions";

const INITIAL: MovementFormState = { ok: false };

const inputClass =
  "w-full rounded border border-black/30 bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-[invalid=true]:border-red-600 dark:border-white/40";
const buttonClass =
  "rounded border border-black/30 px-3 py-2 font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-white/40 dark:hover:bg-white/10";
const errorClass = "mt-1 text-sm text-red-700 dark:text-red-400";

function isKind(value: string | undefined): value is MovementKind {
  return MOVEMENT_KINDS.some((k) => k === value);
}

export function MovementForm({ productId, requestId }: Readonly<{ productId: string; requestId: string }>) {
  const [state, action, pending] = useActionState(registerMovement, INITIAL);
  const failed = state.ok ? undefined : state;
  const [kind, setKind] = useState<MovementKind>(isKind(failed?.values?.kind) ? failed.values.kind : "in");

  const quantityError = failed?.fieldErrors?.quantity;
  const noteError = failed?.fieldErrors?.note;
  const kindError = failed?.fieldErrors?.kind;

  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="requestId" value={requestId} />

      <div>
        <label htmlFor="kind" className="mb-1 block text-sm font-medium">
          Tipo
        </label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(e) => {
            if (isKind(e.target.value)) setKind(e.target.value);
          }}
          aria-invalid={kindError ? true : undefined}
          aria-describedby={kindError ? "kind-error" : undefined}
          className={inputClass}
        >
          {MOVEMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {MOVEMENT_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {kindError && (
          <p id="kind-error" className={errorClass}>
            {kindError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="quantity" className="mb-1 block text-sm font-medium">
          Cantidad
        </label>
        <input
          id="quantity"
          name="quantity"
          type="text"
          inputMode="numeric"
          defaultValue={failed?.values?.quantity ?? ""}
          aria-invalid={quantityError ? true : undefined}
          aria-describedby={quantityError ? "quantity-help quantity-error" : "quantity-help"}
          className={inputClass}
        />
        <p id="quantity-help" className="mt-1 text-sm opacity-70">
          {kind === "adjust" ? "Admite negativo (por ejemplo, −3 resta stock)." : "En positivo."}
        </p>
        {quantityError && (
          <p id="quantity-error" className={errorClass}>
            {quantityError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium">
          Nota{kind === "adjust" ? " (obligatoria en ajustes)" : " (opcional)"}
        </label>
        <input
          id="note"
          name="note"
          type="text"
          defaultValue={failed?.values?.note ?? ""}
          required={kind === "adjust"}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? "note-error" : undefined}
          className={inputClass}
        />
        {noteError && (
          <p id="note-error" className={errorClass}>
            {noteError}
          </p>
        )}
      </div>

      {failed?.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {failed.error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Registrando…" : "Registrar movimiento"}
        </button>
      </div>
    </form>
  );
}
