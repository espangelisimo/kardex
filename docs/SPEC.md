# Kardex — Especificación

## Problema

Un pequeño negocio (una tienda, un taller, un almacén) lleva el stock en una hoja de cálculo con una
columna "cantidad" que alguien sobrescribe a mano. Cuando el número no cuadra, nadie sabe por qué:
no hay historial, y dos personas editando a la vez se pisan.

Kardex sustituye esa columna por un **registro de movimientos** (el *kardex* de contabilidad):
cada entrada, salida o ajuste queda guardado con quién lo hizo, cuándo y por qué. El stock es la
suma de esos movimientos, así que siempre se puede explicar.

## Alcance (v1)

Dentro: login, un workspace por usuario creado al registrarse, productos, movimientos,
stock calculado, alertas de stock bajo e historial por producto.
Fuera de v1: invitar a otros usuarios al workspace (el modelo de datos ya lo admite: `workspace_members`),
precios y valoración del inventario, importar CSV.

## Modelo de datos

```
workspaces          (id, name, created_at)
workspace_members   (workspace_id → workspaces, user_id → auth.users, role ∈ {owner, member}) PK(workspace_id, user_id)
products            (id, workspace_id → workspaces, sku, name, unit, min_stock ≥ 0, archived_at, created_at)
                    unique(workspace_id, sku)
stock_movements     (id, workspace_id, product_id → products, kind ∈ {in, out, adjust},
                     quantity ≠ 0, note, created_by → auth.users, created_at)
product_stock       VIEW (security_invoker) = products + sum(quantity) as stock
```

- `in` lleva `quantity > 0`; `out` lleva `quantity < 0`; `adjust` admite cualquier signo salvo 0.
  Guardar con signo hace que el stock sea un simple `sum()` sin `case`.
- Los movimientos solo se crean con la función `public.register_movement(product_id, kind, quantity, note)`,
  que bloquea la fila del producto, calcula el stock resultante y rechaza si queda negativo (D-03).
- La pertenencia se resuelve con `public.is_member(workspace_id)`, que usan todas las políticas RLS.
- Un trigger sobre `auth.users` crea el workspace y la membresía `owner` al registrarse.

## Plan de tareas

Cada tarea es una unidad del bucle Develop ⇄ Testing (ver `CLAUDE.md`).

### T-01 · Esquema, RLS y tests de aislamiento
- AC-01.1 Migración con las tablas, constraints e índices del modelo de datos.
- AC-01.2 RLS en todas las tablas con políticas por operación; `stock_movements` sin `update`/`delete`.
- AC-01.3 `register_movement` rechaza el stock negativo con un error identificable (`P0001`, mensaje `insufficient_stock`).
- AC-01.4 Trigger de alta: un usuario nuevo tiene exactamente un workspace y es `owner`.
- AC-01.5 Test SQL (pgTAP, `supabase/tests/`): A no ve ni puede insertar productos ni movimientos del workspace de B.
- AC-01.6 `src/lib/database.types.ts` generado y coherente con la migración.

### T-02 · Dominio puro
- AC-02.1 `src/domain/stock.ts`: aplicar movimientos, detectar stock bajo y validar el signo según el tipo.
- AC-02.2 Esquemas zod en `src/domain/schemas.ts` para producto y movimiento (SKU normalizado en mayúsculas y sin ningún espacio: `" ab c1 "` → `"ABC1"`). En `in`/`out` la cantidad llega en positivo y el esquema le aplica el signo; en `adjust` admite cualquier entero salvo 0.
- AC-02.3 Tests unitarios con casos límite (T-01).

### T-03 · Autenticación
- AC-03.1 Clientes Supabase de servidor y navegador con `@supabase/ssr`, y middleware que refresca la sesión.
- AC-03.2 `/login` con email y contraseña; errores en español.
- AC-03.3 Las rutas de `/app/*` redirigen a `/login` sin sesión (comprobado con `getUser()`, S-07).
- AC-03.4 Cerrar sesión.

### T-04 · Productos
- AC-04.1 Listado con stock actual, unidad y aviso visual si `stock ≤ min_stock`.
- AC-04.2 Crear y editar producto (SKU duplicado → error en el campo, no un 500).
- AC-04.3 Los productos nunca se borran: siempre se archivan, tengan o no movimientos. Un producto archivado se puede editar y desarchivar; `register_movement` ya rechaza movimientos sobre él.
- AC-04.4 Estado vacío con llamada a la acción.
- AC-04.5 Migración nueva: `authenticated` solo puede actualizar las columnas editables de `products` (`sku`, `name`, `unit`, `min_stock`, `archived_at`); `id`, `workspace_id` y `created_at` son inmutables. Además, `check` en `products.sku` con la misma normalización que AC-02.2 (mayúsculas, sin espacios). Tests pgTAP que lo demuestren.

### T-05 · Movimientos e historial
- AC-05.1 Registrar entrada, salida o ajuste desde la ficha del producto, con nota obligatoria en los ajustes.
- AC-05.2 Una salida mayor que el stock muestra "Stock insuficiente: hay N" sin crear nada.
- AC-05.3 Historial del producto con fecha, tipo, cantidad, stock acumulado y autor.
- AC-05.4 El envío doble del formulario no duplica movimientos.

### T-06 · Panel
- AC-06.1 `/app` muestra el número de productos, cuántos tienen stock bajo y los últimos 10 movimientos.
- AC-06.2 Datos de ejemplo cargables con `supabase/seed.sql` para el usuario de prueba.
