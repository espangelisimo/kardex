-- T-04a · Endurecimiento de products: grants por columna y límites de formato.

-- ---------------------------------------------------------------------------
-- Grants por columna (AC-04.5)
-- ---------------------------------------------------------------------------
-- id, workspace_id y created_at quedan inmutables para authenticated, y al crear
-- no se pueden fijar id, created_at ni archived_at (nace activo, con id y fecha
-- del servidor). Un intento da 42501 (permission denied), no un fallo silencioso.
-- select no cambia: la vista product_stock (security_invoker) sigue leyendo todo.
revoke insert, update on table public.products from authenticated;
grant insert (workspace_id, sku, name, unit, min_stock) on table public.products to authenticated;
grant update (sku, name, unit, min_stock, archived_at) on table public.products to authenticated;

-- ---------------------------------------------------------------------------
-- Límites (D-04). Deben coincidir con productSchema (src/domain/schemas.ts).
-- ---------------------------------------------------------------------------
-- sku: solo ASCII, así que zod y Postgres validan exactamente lo mismo.
-- name/unit: zod .max() cuenta unidades UTF-16 y char_length() cuenta puntos de
-- código; un punto de código nunca ocupa menos de una unidad UTF-16, así que
-- zod es igual o más estricto: lo que zod acepta, Postgres lo acepta.
alter table public.products
  add constraint products_sku_format check (sku ~ '^[A-Z0-9._-]{1,32}$'),
  add constraint products_name_length check (char_length(name) <= 120),
  add constraint products_unit_length check (char_length(unit) <= 20);
