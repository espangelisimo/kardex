# ADR-0002 · El stock es un registro de movimientos, no un número

**Estado:** aceptada

## Contexto

Lo más sencillo sería `products.stock integer` con un `update`. Tiene tres problemas:
no hay historial (no se puede explicar un descuadre), dos actualizaciones concurrentes de tipo
leer-modificar-escribir se pisan, y corregir un error borra la evidencia.

## Decisión

- `stock_movements` es la única fuente de verdad, solo admite inserciones y lleva la cantidad con signo.
- El stock se calcula con una vista `product_stock` (`security_invoker = true`, para que respete la RLS).
- Las inserciones pasan por `register_movement()`, que hace `select … for update` sobre el producto,
  calcula el stock resultante y lanza `insufficient_stock` si quedaría negativo. El bloqueo serializa
  los movimientos de un mismo producto sin bloquear los demás.

## Alternativas descartadas

- **`check (stock >= 0)` sobre una columna:** evita el negativo pero no da historial.
- **Comprobar en TypeScript y luego insertar:** condición de carrera entre la lectura y la escritura.
- **Columna `stock` mantenida por un trigger:** más rápida de leer, pero duplica la verdad. A la escala de
  un pequeño negocio (miles de movimientos), `sum()` con índice en `(product_id)` sobra. Si hiciera
  falta, se añadiría una vista materializada o un snapshot periódico sin cambiar el modelo.

## Consecuencias

- Los errores se corrigen con un movimiento `adjust` con nota obligatoria, que también queda registrado.
- Las lecturas de stock agregan movimientos. Es aceptable a esta escala y se puede optimizar sin migrar datos.
