"use client";

import { useActionState } from "react";
import { saveProduct, setArchived, type ProductFormState } from "./actions";

const INITIAL: ProductFormState = { ok: false };

const inputClass =
  "w-full rounded border border-black/30 bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-[invalid=true]:border-red-600 dark:border-white/40";
const buttonClass =
  "rounded border border-black/30 px-3 py-2 font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-white/40 dark:hover:bg-white/10";

export type ProductFormValues = { id?: string; sku: string; name: string; unit: string; min_stock: number };

type FieldName = "sku" | "name" | "unit" | "min_stock";

const FIELDS: readonly { name: FieldName; label: string; inputMode?: "numeric" }[] = [
  { name: "sku", label: "SKU" },
  { name: "name", label: "Nombre" },
  { name: "unit", label: "Unidad" },
  { name: "min_stock", label: "Stock mínimo", inputMode: "numeric" },
];

export function ProductForm({ product }: Readonly<{ product?: ProductFormValues }>) {
  const [state, action, pending] = useActionState(saveProduct, INITIAL);
  const failed = state.ok ? undefined : state;

  // Tras un error se conserva lo escrito; si no, los valores del producto o los de una alta nueva.
  const initial: Record<FieldName, string> = {
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    unit: product?.unit ?? "ud",
    min_stock: String(product?.min_stock ?? 0),
  };

  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      {product?.id && <input type="hidden" name="id" value={product.id} />}
      {FIELDS.map(({ name, label, inputMode }) => {
        const error = failed?.fieldErrors?.[name];
        return (
          <div key={name}>
            <label htmlFor={name} className="mb-1 block text-sm font-medium">
              {label}
            </label>
            <input
              id={name}
              name={name}
              type="text"
              inputMode={inputMode}
              defaultValue={failed?.values?.[name] ?? initial[name]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${name}-error` : undefined}
              className={inputClass}
            />
            {error && (
              <p id={`${name}-error`} className="mt-1 text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        );
      })}
      {failed?.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {failed.error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Guardando…" : product?.id ? "Guardar cambios" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}

export function ArchiveForm({ id, archived }: Readonly<{ id: string; archived: boolean }>) {
  const [state, action, pending] = useActionState(setArchived, INITIAL);
  const failed = state.ok ? undefined : state;

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {archived ? "Desarchivar" : "Archivar"}
      </button>
      {failed?.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {failed.error}
        </p>
      )}
    </form>
  );
}
