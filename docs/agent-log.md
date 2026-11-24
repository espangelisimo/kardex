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

### Cambios del humano tras T-01
- D-05 reformulada (aprobada por el humano): "Nunca se edita una migración ya aplicada o publicada (incluida en un commit enviado al remoto o aplicada con `db push`); hasta entonces puede corregirse en el mismo archivo."
- AC-04.3 cambia: los productos nunca se borran, se archivan siempre, tengan o no movimientos. Motivo del humano: no perder historial y no tener dos formas distintas de quitar un producto. El esquema de T-01 ya es coherente con esto: `products` no tiene grant ni política de `delete`.
- Productos archivados: el humano acepta que se puedan editar y desarchivar, porque `register_movement` ya bloquea los movimientos y el historial no corre peligro. Se recoge en AC-04.3.
- Nuevo AC-04.5: `update` de `products` limitado por columnas (`id`, `workspace_id` y `created_at` inmutables), con una migración nueva porque T-01 está cerrada y un test pgTAP.

### T-02 · ronda 1 · PASS
- Decisiones del humano antes de delegar (ya recogidas en AC-02.2 y AC-04.5):
  - El SKU se guarda sin ningún espacio y en mayúsculas. T-04 añadirá además un `check` en Postgres con la misma regla.
  - En `in`/`out` la cantidad se introduce en positivo y el esquema le pone el signo; `adjust` admite cualquier entero salvo 0.
  - `verify` pasa a ejecutar `test:coverage` para que CI también exija el 90 % de cobertura.
- Develop:
  - `src/domain/` con `types.ts`, `stock.ts` y `schemas.ts`. Las funciones de `stock.ts` son puras: devuelven un resultado `{ok…}` en lugar de lanzar excepciones, y usan los mismos códigos de error que Postgres. `quantity_out_of_range` es un código propio del dominio para decimales y valores fuera de rango.
  - 76 tests, entre ellos un `expectTypeOf` que hace fallar `typecheck` si `MovementKind` deja de coincidir con `database.types.ts`.
  - `verify` ejecuta `test:coverage`, y eslint ignora `coverage/**`.
- Testing: todo OK.
  - `verify` termina con exit 0, con cobertura del 100 % en líneas y ramas. Forzando el umbral a 101 la ejecución falla con exit 1, así que el control de cobertura funciona. `vitest.config.mts` no ha cambiado.
  - Intentó romper las validaciones con espacios Unicode, `"1e3"`, `"0x10"`, `-0` e INT_MIN/INT_MAX, y no encontró ninguna entrada que el dominio acepte y Postgres rechace.
- Decisión: commit `feat(T-02)`. Notas que pasan a T-04 y T-05:
  - El `check` de SKU de AC-04.5 tiene que aceptar todo lo que genera zod. Hay diferencias entre las dos normalizaciones:
    - `\s` de JS no elimina U+200B.
    - Las clases de espacio de Postgres no coinciden con las de JS.
    - `toUpperCase()` convierte `ß` en `SS`, y `upper()` de Postgres no.
  - `products.name` está limitado a 120 caracteres en zod, pero no en Postgres. Hay que decidirlo en T-04.
  - `note_required` llega desde Postgres como 23514 (check), no como un mensaje del error. La Server Action de T-05 tendrá que traducirlo.

### Decisiones del humano antes de T-03
- T-04:
  - SKU solo con letras ASCII, números, guion, guion bajo y punto (`[A-Z0-9._-]`), tanto en zod como en un `check` de Postgres.
  - `products.name` limitado a 120 caracteres también en la base de datos.
  - Motivo: una regla sencilla e idéntica en los dos sitios. Así se evitan las diferencias de normalización entre JS y Postgres que detectó Testing en T-02.
- T-03:
  - Registro abierto y sin confirmación por email, "lo más sencillo posible". AC-03.2 se amplía para incluir el alta.
  - AC-03.1 deja fuera el cliente de navegador: con Server Actions no se usa y sería código muerto (C-06).
- El Orquestador parte T-03 en T-03a (sesión, middleware, `/app` protegido, cerrar sesión) y T-03b (login y registro), porque entre las dos superan los ~8 archivos.

### T-03a · ronda 1 · PASS
- Develop:
  - Cliente de servidor `src/lib/supabase/server.ts` y `src/middleware.ts`, que refresca la sesión con `getUser()` y hace las redirecciones `/app/*`↔`/login`.
  - `src/app/app/layout.tsx` vuelve a comprobar `getUser()`. Tiene una cabecera con "Cerrar sesión", que es una Server Action que siempre redirige.
  - `/` redirige a `/app`, el layout raíz tiene `lang="es"` y se han borrado los SVG de la plantilla.
- Testing: todo OK.
  - Con un servidor de producción, sin cookie: `/app`, `/app/x/y` y `/app?x=1` responden 307 a `/login`, y `/APP` y `/appfoo` dan 404, así que no hay bypass.
  - Con una sesión real, `/app` responde 200 sin caché. Una cookie caducada se refresca, y la cookie nueva se mantiene en los redirects.
  - `signOut` responde 303 a `/login` y revoca el token en el servidor.
  - Archivo de entorno local: el hook `guard.mjs` impide a los agentes tocar ficheros de entorno. Testing pasó las variables por la línea de comandos, y el humano crea el archivo.
- Decisión: commit `feat(T-03a)`. Acepto la justificación de C-04 para `signOut`: siempre redirige y no hay ningún resultado que modelar.
- Notas para T-03b:
  - `signOut()` usa por defecto `scope: 'global'`. El Orquestador decide `scope: 'local'`: cerrar sesión en un navegador no debería expulsar al usuario de los demás.
  - Sin variables de entorno, el middleware falla en todas las rutas. Se documentará en el README.

### T-03b · ronda 1 · PASS
- Develop:
  - `credentialsSchema` en el dominio y `authErrorMessage` (src/lib), cada uno con sus tests.
  - `/login`: un solo formulario y una sola Server Action, `authenticate`. El `intent` del botón pulsado indica qué hacer, así que funciona sin JS.
  - `signOut` pasa a `scope: 'local'`, y el README explica la configuración local y la opción "Confirm email" del proyecto remoto.
- Testing: todo OK.
  - `verify` en verde, con 84 tests y cobertura del 100 % en el dominio.
  - Con POST reales sin JS, todos los errores salen en español y no aparece ningún mensaje crudo de Supabase (S-08). El log del servidor registra solo el código de error.
  - Probado el flujo completo: registrarse, `/app`, cerrar sesión (la cookie antigua deja de valer en el servidor) y volver a entrar.
- Decisión: commit `feat(T-03b)`. El humano acepta una sola acción en lugar de dos.
- Notas abiertas:
  - Se acepta una contraseña formada solo por espacios.
  - Falta `.max()` en email y contraseña (sin él, el usuario ve el mensaje genérico).
  - Con el email vacío sale "email válido" en lugar de "obligatorio".
- Queda pendiente la prueba E2E en Chrome: botones deshabilitados, 360 px y que Enter equivalga a "Entrar". Por el código, "Entrar" es el primer submit del DOM y ningún CSS altera el orden.

### T-03 · prueba E2E en Chrome (Orquestador) · OK
- Al pulsar Enter en el formulario se envía `intent=signIn`: lo confirma `e.submitter` y un email nuevo no se registra, sino que devuelve "Email o contraseña incorrectos.".
- Durante el envío los dos botones quedan deshabilitados y se rehabilitan al llegar la respuesta. Lo comprueba un MutationObserver sobre `disabled`.
- Probado el flujo completo: registro → `/app` con el email → cerrar sesión → `/login`, y `/app` vuelve a redirigir. Con un email ya registrado sale "Ya existe una cuenta con ese email.". Entrar con Enter lleva a `/app`.
- A 360 px (iframe de 360 px, porque la ventana no se podía reducir), `/login` y `/app` no tienen scroll horizontal (`scrollWidth == clientWidth`). El email largo se trunca y los errores salen junto a cada campo.
- El aviso de hidratación en desarrollo lo causan atributos `bis_*` que inyecta una extensión del navegador, no la app.
- T-03 queda cerrada.

### Decisiones del humano antes de T-04
- T-04 se parte en T-04a (BD, dominio y Server Actions) y T-04b (UI), porque entre las dos superan los ~8 archivos.
- Grants por columna también en `insert` (`workspace_id, sku, name, unit, min_stock`): al crear, el cliente no puede fijar `id`, `created_at` ni `archived_at`. Amplía AC-04.5.
- Límites idénticos en zod y en un `check`: SKU `^[A-Z0-9._-]{1,32}$`, `name` ≤ 120 y `unit` ≤ 20. El humano fijó el máximo de 32 del SKU en T-02, pero no se había escrito; queda recogido ahora en AC-04.5.
- Los archivados se ocultan en el listado por defecto; `?archivados=1` los muestra, y funciona sin JS.

### Cambio de modo del humano (durante T-04a)
- A partir de T-04b, el Orquestador encadena T-04b, T-05 y T-06 sin pararse entre tareas. Solo para si hay una decisión del humano, si una tarea llega a 4 rondas sin PASS o si hay que tocar algo externo (GitHub, Supabase remoto o Vercel). Las dudas pequeñas se resuelven con la opción más simple y se anotan aquí.

### T-04a · ronda 1 · PASS
- Develop:
  - Migración nueva `20260102000000_products_hardening.sql`: `revoke insert, update` y grants por columna. También añade los checks `products_sku_format`, `products_name_length` y `products_unit_length`.
  - `products.test.sql` con 24 aserciones.
  - zod: el SKU admite como máximo 32 caracteres de `[A-Z0-9._-]` y la unidad, 20.
  - `product-errors.ts`: el error 23505 se muestra en el campo `sku` y el 23514, en el campo de la constraint que falla.
  - Acciones `saveProduct` y `setArchived`.
  - `ß` se guarda como `SS`, y esa expansión cuenta para el límite.
- Testing: todo OK.
  - `verify` en verde: 101 tests y el dominio al 100 %. `test:db` da Files=3, Tests=73, PASS.
  - Con PostgREST real, un PATCH de `id`, `workspace_id` o `created_at` y un POST con `id`, `created_at` o `archived_at` devuelven 403 42501. `product_stock` sigue funcionando.
  - Fuzz del SKU de U+0000 a U+2FFFF, sin ninguna discrepancia entre zod y Postgres.
  - Las acciones reales responden con el SKU duplicado en el campo, sin dejar pasar ningún mensaje crudo (S-08).
- Decisión: commit `feat(T-04a)`.
  - C-04: el éxito de `saveProduct` es un `redirect` y no `{ok:true,data}`. Lo acepto con el mismo criterio que `signOut`: no hay datos que devolver a la UI.
  - Las notas pasan a T-04b, porque son baratas y tocan archivos de T-04 todavía no publicados (D-05 lo permite):
    - El comentario de la migración está mal: zod 4 cuenta puntos de código, igual que `char_length`, así que el límite es idéntico y no "más estricto". Se corrige y se añade un test con 120/121 caracteres fuera del BMP.
    - Archivar un producto que ya está archivado reescribe `archived_at`. Se cambia para que conserve la fecha original.
    - El formulario debe enviar y rellenar siempre los cuatro campos, porque `saveProduct` sobrescribe con los valores por defecto.
  - Deuda aceptada: `database.types.ts` tipa `Insert` con `id`, `created_at` y `archived_at` opcionales porque el generador ignora los grants por columna. La BD lo rechaza con 42501.

### T-04b · ronda 1 · PASS
- Develop:
  - `/app/productos`: tarjetas con el stock en formato `es-ES` y la unidad, la insignia de texto "Stock bajo", el filtro `?archivados=1` y estados vacío y de error.
  - `/app/productos/nuevo` y `/app/productos/[id]`: si el id no es un uuid o no se encuentra, responde con `notFound()`. Incluye el aviso de archivado y archivar/desarchivar.
  - `product-form.tsx` usa `useActionState` y envía siempre los 4 campos.
  - Navegación en el layout.
  - `setArchived` conserva la `archived_at` original y es idempotente.
  - Test con 😀 en los límites de `name` y `unit`.
- Testing: todo OK.
  - `verify` en verde con 102 tests, y `test:db` da 73 PASS.
  - Prueba HTTP real contra `next start` con dos usuarios: estados vacíos, alta con SKU normalizado, SKU duplicado en el campo al crear y al editar, stock bajo visible, 404 para un producto ajeno o un id que no es uuid, y archivar dos veces conservando la fecha. Editar y desarchivar archivados funciona, B no puede tocar nada de A y un DELETE da 403.
- Decisión: commit `feat(T-04b)`.
  - Se mantiene el bloqueo del hook: `guard.mjs` impide editar migraciones existentes, aunque D-05 lo permita mientras no estén publicadas. Develop no lo esquivó y el Orquestador tampoco lo hace. El comentario erróneo sobre UTF-16 pasa a deuda conocida.
  - Deuda aceptada (opción más simple):
    - Conservar `archived_at` es una regla de la Server Action, no de la BD (un PATCH directo puede reescribir la fecha). No afecta a la integridad: solo es la fecha de archivado. Tampoco tiene test automático: no hay infraestructura de tests de Server Actions y Testing lo comprobó por HTTP.
    - `?archivados=1&archivados=1` muestra los activos.
    - Los enlaces "← Productos" no llevan la clase `focus-visible` propia (sí el anillo del navegador).
  - Notas que se resuelven en T-05, porque toca la ficha:
    - Al guardar un producto archivado, la app vuelve al listado de activos, donde no aparece. Debe volver a la ficha.
    - Comprobar en la E2E una unidad de 20 caracteres anchos a 360 px.

### T-04 · prueba E2E en Chrome (Orquestador) · OK
- Con una cuenta nueva:
  - Estado vacío con su CTA.
  - Alta con el SKU `" tor 01 "`, que se guarda como `TOR01`. Lleva un nombre de 87 caracteres, la unidad `WWWWWWWWWWWWWWWWWWWW` (20 caracteres anchos) y mínimo 5, así que sale "Stock bajo · 0 WWWW…".
  - Repetir el SKU `tor01` deja "Ya existe un producto con ese SKU" en `#sku-error`, con `aria-invalid="true"` y los valores conservados.
- A 360 px (iframe), el listado y la ficha tienen `scrollWidth == clientWidth == 360`. El caso de la unidad ancha que señaló Testing no desborda.
- Archivar muestra el aviso "Producto archivado…" y el botón "Desarchivar". El producto desaparece de los activos y aparece en `?archivados=1`. Al desarchivar vuelve. `/app/productos/no-uuid` responde 404.
- Nota que paso a T-05b: si todos los productos están archivados, el listado de activos dice "Aún no tienes productos", lo que confunde. Debería decir que no hay productos activos y remitir a los archivados.
- T-04 queda cerrada.

### Decisiones del Orquestador antes de T-05 (modo auto, la opción más simple que sea robusta)
- AC-05.4 con clave de idempotencia en Postgres (`request_id`), no solo con el botón deshabilitado. El botón deshabilitado no cubre:
  - el envío sin JS;
  - los reintentos del navegador;
  - dos pestañas abiertas.
  - Como `register_movement` ya bloquea la fila del producto, dos peticiones con la misma clave se serializan, y la segunda devuelve el movimiento de la primera.
- Autor: `created_by_email` se copia de `auth.users` al registrar. El log es inmutable, así que guarda quién era en ese momento, y la RLS de `auth.users` no permite hacer un join desde el cliente.
- Stock acumulado: vista `movement_history` con `security_invoker` (S-04), que usa `sum(quantity) over (partition by product_id order by created_at, id)`.
- Se aprovecha la nueva `register_movement` para cerrar la nota de T-01: `p_kind` null devuelve un error propio, no 23502.
- T-05 se parte en T-05a (BD, errores y acción) y T-05b (UI), porque entre las dos superan los ~8 archivos.

### T-05a · ronda 1 · FAIL
- Develop:
  - Migración `20260103000000_movements_idempotency_history.sql`:
    - `request_id` con `unique (workspace_id, request_id)` y `created_by_email`.
    - `register_movement` admite `p_request_id` y comprueba la idempotencia después del `for update`. Con `p_kind` null devuelve `invalid_kind`.
    - Vista `movement_history` con `running_stock`.
  - `movements.test.sql` con 36 tests.
  - `requestId` en zod.
  - `movement-errors.ts`.
  - La acción `registerMovement` en `[id]/actions.ts`.
- Testing:
  - Lo que está bien:
    - `verify` en verde con 117 tests, y `test:db` da 109 PASS.
    - 25 RPC en paralelo con el mismo `request_id` crean 1 fila, sin ningún 23505.
    - AC-05.2 de extremo a extremo: "Stock insuficiente: hay 1241" y no se crea nada.
    - `running_stock` coincide con `product_stock`.
    - No hay fuga entre workspaces por `request_id`.
  - [D-04] 🔴 Ajuste "sin nota" aceptado por la BD:
    - El check `stock_movements_adjust_requires_note` de T-01 usa `btrim(note)`, que solo quita espacios.
    - Una nota `E'\t\n'` pasa el check por RPC directo, mientras que zod la rechaza.
    - La regla de negocio depende, por tanto, del cliente.
- Decisión: ronda 2.
  - Se recrea el check en la migración nueva (sin commit) con una condición que rechace cualquier espacio en blanco, y se añade un test que primero falle (T-02).
  - Notas que se incorporan porque son baratas y del mismo tipo:
    - Los checks de `products.name` y `products.unit` de T-01 tienen el mismo defecto de `btrim`: un nombre `E'\t'` pasa la BD. Se corrigen en la misma migración.
    - Idempotencia con una petición distinta: si se reutiliza la misma clave con otro producto, tipo o cantidad, `register_movement` devuelve en silencio el movimiento original. Debe lanzar `idempotency_conflict`, que se traduce a un mensaje propio.
    - Nota de 500 caracteres como máximo, en zod y en un `check`: el historial es inmutable y no debe aceptar textos de megabytes.
  - Decisión de formato (Orquestador): `Intl.NumberFormat('es-ES')` escribe 1234 y 12.345, porque CLDR y la RAE no agrupan las cifras de 4 dígitos. Se mantiene así en toda la app; no se fuerza `useGrouping: "always"`.

### T-05a · ronda 2 · FAIL
- Develop:
  - Checks con `~ '[^[:space:]]'` para la nota (`NOT VALID`, el historial es inmutable) y para `products.name` y `products.unit`.
  - `idempotency_conflict`.
  - Nota de 500 caracteres como máximo.
  - 9 tests nuevos que fallaban antes del arreglo (T-02).
  - `verify` da 123, y `test:db` 122 PASS.
- Testing:
  - Comprobado: idempotencia en concurrencia (el reintento idéntico devuelve el original y el conflicto se traduce, sin ningún 23505 crudo), `NOT VALID` justificado y ningún test debilitado.
  - [D-04] 🔴 `[:space:]` depende de la collation y no coincide con el `.trim()` de JS:
    - U+FEFF no cuenta como blanco con ninguna collation, así que por RPC se acepta un ajuste con nota invisible, y también un `name` o un `unit` invisibles.
    - NBSP, U+2007 y U+202F solo se rechazan con ICU (el local). Con libc o `C` pasan, así que la regla dependería de cómo esté creado el proyecto remoto.
- Decisión: ronda 3.
  - Para que converja, se exige una regla determinista y única: una función SQL `immutable` que use una clase de caracteres explícita, idéntica a la de `String.prototype.trim` (la que propone Testing). Los tres checks y la normalización previa la usan.
  - Tests pgTAP con U+FEFF, U+00A0 y U+3000, y uno con `collate "C"`.
  - Deuda aceptada:
    - U+200B y U+180E son invisibles y pasan en zod y en la BD. Las dos reglas coinciden y ninguna directriz lo exige.
    - `workspaces.name` sigue usando `btrim`. Lo genera el trigger de alta y no hay ninguna UI que lo edite.

### T-05a · ronda 3 · PASS
- Develop:
  - Crea `public.has_visible_text(p text)` (`sql immutable`, `search_path=''`, sin `security definer`), con una clase explícita idéntica a la de `String.prototype.trim`, sin `[:space:]` ni `btrim`.
  - La usan `stock_movements_adjust_requires_note` (con `coalesce`, para que una nota null no pase), `products_name_not_blank`, `products_unit_not_blank` y la normalización previa.
  - Los tests nuevos con FEFF fallaban antes del arreglo.
- Testing:
  - Todo OK. Barrido de U+0001 a U+FFFF: `has_visible_text` rechaza exactamente los mismos caracteres que `.trim()`, con la collation por defecto (ICU) y con `"C"`.
  - Ataques por RPC con JWT con combinaciones de espacios Unicode en la nota, el nombre y la unidad: todos rechazados.
  - AC-05.1 a AC-05.4 OK, y ningún test debilitado.
  - Nota importante: la clase estaba escrita con caracteres invisibles literales, mientras que el comentario hablaba de escapes `\uXXXX`.
- Corrección previa al commit (no es una ronda nueva, porque no incumple ninguna directriz):
  - La clase se reescribe con escapes ASCII. Lo he comprobado con `od -c` y no queda ningún byte no ASCII fuera de los comentarios.
  - Se añade un test que recorre los 25 códigos de `trim`.
  - Lo he ejecutado yo: `db reset`, `test:db` (Files=4, Tests=138, PASS) y `verify` con exit 0 (123 tests, sin secretos, build OK).
- Decisión: commit `feat(T-05a)`.
  - Diagnóstico de las tres rondas: el fallo de fondo era que la BD y JS definían de forma distinta qué es un espacio en blanco. La solución que converge es una sola definición explícita y probada de forma exhaustiva, no ir tapando caracteres uno a uno.
  - Los reintentos con la misma clave y una nota `''` o `null` dan `idempotency_conflict` por RPC. La acción no puede provocarlo, porque zod convierte `''` en `null`.

### T-05b · ronda 1 · PASS
- Develop:
  - La ficha muestra el stock actual en es-ES y genera el `requestId` con `crypto.randomUUID()` cada vez que se pinta.
  - `MovementForm` es un componente cliente con un select de tipo controlado y la nota con `required` dinámico en los ajustes. Solo aparece si el producto no está archivado.
  - Historial en tarjetas, ordenado por `created_at desc, id desc`.
  - `src/domain/format.ts`: etiquetas de tipo y cantidad con signo (U+2212).
  - `saveProduct` redirige a la ficha, y el listado dice "No hay productos activos" cuando solo quedan archivados.
- Testing: todo OK.
  - `verify` da 128 tests con el dominio al 100 %, y `test:db` 138 PASS.
  - Prueba HTTP real contra `next start` con dos sesiones:
    - entrada, salida y ajuste con redirect a la ficha;
    - "Stock insuficiente: hay 1500" en el campo de cantidad, sin crear nada;
    - un ajuste sin nota o con nota en blanco da el error en el campo de la nota;
    - el mismo POST dos veces y 6 POST en paralelo con la misma clave dejan 1 movimiento, y cada ficha que se pinta trae una clave distinta;
    - los acumulados cuadran y la nota se escapa;
    - un producto archivado no muestra el formulario, y un POST forzado da el error traducido;
    - B no puede tocar productos de A.
- Decisión: commit `feat(T-05b)`. Notas:
  - Comprobar en Chrome que el select sigue en "Ajuste" después de un error, porque React 19 hace `form.reset()`.
  - Zona horaria: el historial se formatea en el servidor, y en Vercel (UTC) saldría desfasado. Decisión del Orquestador: formatear con `timeZone: "Europe/Madrid"` con una función compartida del dominio. Se hace en T-06, porque el panel también muestra movimientos.
  - Deuda: el `useState` inicial de `movement-form.tsx` no tiene efecto (C-06 ⚪), y los errores de campo no se anuncian con `role="alert"`, aunque sí están enlazados con `aria-describedby`.

### Deuda conocida (aceptada por el humano, pendiente)
- `credentialsSchema` acepta una contraseña formada solo por espacios (zod y GoTrue la admiten).
- Si el email llega vacío (`""`) se muestra "Introduce un email válido" en lugar de "El email es obligatorio".
- Ninguna de las dos bloquea: se corregirán en una ronda corta cuando el humano lo decida.
- (T-04, decidida por el Orquestador en modo auto) El comentario de `20260102000000_products_hardening.sql:18-20` dice que zod cuenta en UTF-16. En realidad cuenta puntos de código, igual que `char_length`, así que los límites son idénticos, y lo fija `schemas.test.ts`. El hook impide editar la migración: lo corrige el humano a mano antes del primer push, o se deja.
- (T-04) La fecha original de `archived_at` solo la conserva la Server Action, no la BD.
- (T-05a) U+200B y U+180E (invisibles) se aceptan como texto. zod y la BD coinciden.
- (T-05a) `workspaces.name` sigue con `btrim`. Lo genera el trigger y no hay ninguna UI que lo edite.
- (T-05a) Los checks de `stock_movements` son `NOT VALID`, porque el historial es inmutable. Cuando se confirme que el remoto no tiene filas que los incumplan, se puede añadir `validate constraint` en una migración posterior.
