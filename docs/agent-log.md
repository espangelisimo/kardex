# Registro del bucle Develop ⇄ Testing

Lo mantiene el Orquestador: una entrada por ronda (formato en `CLAUDE.md`).

### T-00 · ronda 1 · PASS
- Humano + Orquestador: arnés inicial (agentes, directrices, spec, ADRs, hooks, `verify`, CI). Sin código de producto.
- Testing: no aplica. `lint`, `typecheck`, `test:hooks` y `check:secrets` en verde; el `build` necesita Node moderno
  (Tailwind 4 y Vitest 4 cargan paquetes que solo se publican como ESM), así que se fija Node 26 LTS (el default de Vercel) en `engines`, `.nvmrc` y CI: misma versión en local, CI y producción.
- `npm audit`: PostCSS 8.4.31 empaquetado dentro de Next 15 (XSS y lectura de `.map` al procesar CSS de un atacante).
  Exposición real casi nula (solo se compila CSS propio), pero se corrige con `overrides.next.postcss ^8.5.23` en lugar
  del `audit fix --force`, que subiría a Next 16. Resultado: 0 vulnerabilidades y build en verde.
- esbuild (dependencia de Vitest): su `postinstall` se deja sin aprobar a propósito, porque el binario llega como dependencia opcional.
- Decisión: empezar con T-01, porque el esquema y la RLS condicionan todo lo demás.

### T-01 · ronda 1 · FAIL
- Develop: migración `20260101000000_schema.sql`, que incluye 4 tablas, enums, checks, una FK compuesta `(product_id, workspace_id)`, la vista `product_stock` con `security_invoker`, `is_member`, el trigger de alta, `register_movement` como `security definer` con `select … for update` y RLS con políticas por operación. También pgTAP `isolation.test.sql` (18 aserciones) y `database.types.ts` generado.
- Testing: [D-02/S-03] 🔴 `authenticated` conservaba TRUNCATE, REFERENCES y TRIGGER, los privilegios por defecto de Supabase. TRUNCATE no pasa por la RLS: como usuario A se podían borrar los movimientos de todos los workspaces. El resto de AC estaba OK.
- Decisión: ronda de corrección con privilegios mínimos. Además se incorporan cuatro notas baratas de Testing: el signo se valida antes que el stock, `insufficient_stock` lleva el stock actual en `detail` (para AC-05.2), el nombre del workspace se trunca si el email es largo y se añaden aserciones pgTAP que faltaban.
- Decisión humana: se edita la migración en lugar de crear una nueva porque no estaba aplicada en ningún entorno compartido. D-05 rige a partir del primer push o db push.

### T-01 · ronda 2 · PASS
- Develop: `revoke all` sobre cada tabla y grants mínimos para `authenticated`. En `stock_movements` solo `select`; el resto pasa por `register_movement`. Se añade `alter default privileges … revoke truncate`. En `register_movement`, el error `invalid_quantity_sign` se lanza antes de comprobar el stock, e `insufficient_stock` lleva `detail`. Nuevo `privileges.test.sql` (31 aserciones). `isolation.test.sql` no cambia.
- Testing: todo OK. `npm run verify` termina con exit 0, y `test:db` da Files=2, Tests=49, PASS. El ataque con TRUNCATE de la ronda 1 queda denegado, y los tipos regenerados son idénticos. También comprobó como `authenticated` lo que necesitarán T-04 y T-05: crear y archivar productos y registrar movimientos.
- Decisión: commit `feat(T-01)`. Las notas no bloqueantes quedan para tareas posteriores:
  - Los grants son por tabla y no por columna, así que `created_at` e `id` se pueden editar (decidir en T-04).
  - Un producto archivado se puede editar (decidir en T-04).
  - `p_kind` null devuelve 23502 y no el error propio.
  - Los default privileges siguen concediendo DELETE, REFERENCES y TRIGGER: cada tabla nueva debe repetir el patrón revoke/grant.
