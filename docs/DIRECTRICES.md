# Directrices de calidad

Develop las cumple; Testing las verifica. Cada una tiene un id para poder citarla en los informes.
Cambiar este documento requiere aprobación humana (ver `CLAUDE.md`).

**Severidad:** 🔴 bloqueante (impide el PASS) · 🟡 importante (impide el PASS salvo justificación
escrita de Develop aceptada por el Orquestador) · ⚪ recomendación (va a `NOTAS`).

## S — Seguridad

| Id | Regla | Sev. |
|----|-------|------|
| S-01 | Ningún secreto en el repo. Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` pueden llegar al cliente. La `service_role` key no se usa en la app. `npm run check:secrets` en verde. | 🔴 |
| S-02 | Toda tabla del esquema `public` tiene RLS activado **y** políticas explícitas por operación (`select`, `insert`, `update`, `delete`). Una operación sin política queda denegada a propósito, y se documenta en la migración. | 🔴 |
| S-03 | El aislamiento entre workspaces se apoya en RLS, no en filtros `.eq('workspace_id', …)` del cliente. Esos filtros pueden existir por rendimiento, nunca como único control. | 🔴 |
| S-04 | Las vistas se crean con `with (security_invoker = true)`. Sin esto, una vista ignora la RLS de las tablas que consulta. | 🔴 |
| S-05 | Las funciones `security definer` fijan `set search_path = ''` y usan nombres cualificados (`public.tabla`). Se evitan si `security invoker` basta. | 🔴 |
| S-06 | Toda entrada del usuario se valida en el servidor con zod antes de tocar la base de datos. | 🔴 |
| S-07 | Las rutas privadas comprueban la sesión en el servidor con `supabase.auth.getUser()`, no con `getSession()`, que no revalida el token. | 🔴 |
| S-08 | Los errores de la base de datos no se muestran tal cual al usuario. Se registran en el servidor y se traducen a un mensaje propio. | 🟡 |

## D — Datos e integridad

| Id | Regla | Sev. |
|----|-------|------|
| D-01 | El stock **no se almacena**: se calcula como la suma de `stock_movements`. No existe columna `stock` editable (ver ADR-0002). | 🔴 |
| D-02 | Los movimientos son inmutables: sin políticas de `update` ni `delete`. Un error se corrige con un movimiento de ajuste. | 🔴 |
| D-03 | El stock nunca puede quedar negativo, y eso lo garantiza Postgres en una transacción con bloqueo de fila (`select … for update`), no una comprobación previa en TypeScript (condición de carrera). | 🔴 |
| D-04 | Las restricciones de dominio están en el esquema: `check`, `not null`, `unique (workspace_id, sku)`, claves foráneas con `on delete` explícito. | 🔴 |
| D-05 | Cambios de esquema solo con migraciones nuevas en `supabase/migrations/`. Nunca se edita una migración existente. | 🔴 |
| D-06 | Los tipos de la base de datos usados en TS están en `src/lib/database.types.ts` y coinciden con las migraciones. | 🟡 |

## C — Código

| Id | Regla | Sev. |
|----|-------|------|
| C-01 | `npm run verify` en verde (lint, typecheck estricto, tests, secret scan, build). | 🔴 |
| C-02 | Sin `any`, `@ts-ignore` ni `eslint-disable` sin comentario que lo justifique. | 🔴 |
| C-03 | Lógica de dominio pura en `src/domain/`, sin imports de `next`, `react` ni `@supabase/*`. | 🟡 |
| C-04 | Las Server Actions devuelven `{ ok: true, data } \| { ok: false, error }`. No lanzan errores hacia la UI. | 🟡 |
| C-05 | Server Components por defecto. `"use client"` solo en componentes con interactividad real. | 🟡 |
| C-06 | Sin código muerto, `console.log` de depuración ni archivos sin usar. | ⚪ |

## T — Tests

| Id | Regla | Sev. |
|----|-------|------|
| T-01 | Toda función de `src/domain/` tiene tests, incluidos los casos límite (0, negativos, vacíos, máximos). | 🔴 |
| T-02 | Cada bug encontrado por Testing se corrige con un test que primero fallaba. | 🟡 |
| T-03 | Ningún test existente se borra, se salta (`.skip`) ni se debilita sin justificación aceptada. | 🔴 |
| T-04 | Los tests comprueban comportamiento observable, no detalles de implementación. | 🟡 |
| T-05 | Las políticas RLS tienen un test SQL en `supabase/tests/` que demuestra que el usuario A **no** puede leer ni escribir datos del workspace de B. | 🔴 |

## U — UX y accesibilidad

| Id | Regla | Sev. |
|----|-------|------|
| U-01 | Todo formulario tiene estado de envío (botón deshabilitado) y muestra el error junto al campo. | 🟡 |
| U-02 | Estados vacíos y de error diseñados. Nada de pantallas en blanco. | 🟡 |
| U-03 | Inputs con `<label>` asociado, foco visible y navegación con teclado. | 🟡 |
| U-04 | Usable a 360 px de ancho sin scroll horizontal. | 🟡 |
| U-05 | Interfaz en español, con cantidades y fechas en formato `es-ES`. | ⚪ |
