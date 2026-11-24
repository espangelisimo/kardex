# Kardex

Inventario para pequeños negocios en el que el stock es la suma de un registro inmutable de movimientos,
no un número que se edita a mano. Next.js 15 · Supabase (Postgres + Auth + RLS) · Vercel.

**Demo:** _pendiente_ · **Usuario de prueba:** _pendiente_

## Cómo se ha construido: un equipo de tres agentes

```
                 ┌──────────────────────────┐
   humano ─────▶ │ Orquestador (CLAUDE.md)  │ ── registra cada ronda ─▶ docs/agent-log.md
                 └─────┬──────────────▲─────┘
          tarea + AC-* │              │ VEREDICTO PASS/FAIL + fallos [id] archivo:línea
       (+ informe FAIL)│              │
                 ┌─────▼─────┐   ┌────┴──────┐
                 │  develop  │   │  testing  │  ← solo lectura: Read, Grep, Glob, Bash
                 │ (sonnet)  │   │  (opus)   │
                 └─────┬─────┘   └────▲──────┘
                       └── diff ──────┘   revisa contra docs/DIRECTRICES.md
```

| Archivo | Para qué |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Orquestador: bucle de trabajo, límite de rondas, criterio de PASS |
| [`.claude/agents/develop.md`](.claude/agents/develop.md) | Cómo programa Develop |
| [`.claude/agents/testing.md`](.claude/agents/testing.md) | Cómo revisa Testing y formato obligatorio del informe |
| [`docs/DIRECTRICES.md`](docs/DIRECTRICES.md) | Las reglas que Develop cumple y Testing verifica (id + severidad) |
| [`docs/SPEC.md`](docs/SPEC.md) | Producto, modelo de datos y tareas con criterios de aceptación |
| [`docs/agent-log.md`](docs/agent-log.md) | Historial real de rondas Develop ⇄ Testing |
| [`docs/decisions/`](docs/decisions) | ADRs: por qué el equipo es así y por qué el stock es un registro |

**Lo que no depende del criterio de un modelo:**
- `npm run verify`: lint, typecheck estricto, unit tests, tests del hook, escaneo de secretos y build.
- `npm run test:db`: tests pgTAP de RLS contra un Postgres local (Docker). Prueban que un usuario no ve datos de otro.
- Hook `PreToolUse` ([`.claude/hooks/guard.mjs`](.claude/hooks/guard.mjs)): impide a cualquier agente escribir `.env`,
  editar migraciones ya creadas o las directrices, o hacer push de esquema a producción. En caso de error bloquea.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) repite todo lo anterior en cada push.

Testing se ocupa de lo que una máquina no puede decidir: si una política RLS es la correcta,
si un test prueba algo de verdad o si hay una condición de carrera.

## Configuración local

Copia `.env.example` a `.env.local` y rellénalo con los valores que imprime `npx supabase status`
(URL del API y anon key). Sin ese archivo el middleware falla en todas las rutas.

**Despliegue:** el registro es abierto y sin confirmación por email. En el proyecto remoto de Supabase
hay que desactivar Authentication → Providers → Email → "Confirm email" (en local ya está desactivado
en `supabase/config.toml`). Si queda activado, "Crear cuenta" avisa de que falta confirmar el email.

## Desarrollo local

```bash
cp .env.example .env.local     # rellena URL y anon key de tu proyecto Supabase
npm install
npx supabase start             # Postgres + Auth locales (requiere Docker)
npm run dev
npm run verify && npm run test:db
```
