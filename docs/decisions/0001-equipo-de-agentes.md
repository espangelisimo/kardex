# ADR-0001 · Diseño del equipo de agentes

**Estado:** aceptada

## Contexto

La prueba pide tres agentes: Orquestador, Develop y Testing, con Testing devolviendo fallos a Develop
hasta que todo pase. Un LLM que revisa a otro LLM tiene dos riesgos conocidos: que el revisor
apruebe por complacencia y que el implementador "arregle" el test en lugar del código.

## Decisión

1. **El Orquestador hace de puente.** Los subagentes de Claude Code no pueden invocar a otros
   subagentes y no comparten memoria entre ejecuciones. El estado del bucle (ronda, informe anterior,
   commit base) lo lleva el Orquestador y queda escrito en `docs/agent-log.md`.
2. **Separación de funciones por herramientas.** Testing no tiene `Edit` ni `Write`: no puede corregir,
   así que tiene que explicar. Es una barrera, no un sandbox, porque con `Bash` podría escribir; por
   eso su prompt lo prohíbe explícitamente y el hook de `.claude/settings.json` protege los archivos críticos.
3. **Puertas deterministas antes que la opinión del modelo.** `npm run verify` (lint, tipos, tests,
   escaneo de secretos y build) y `npm run test:db` (pgTAP) deciden lo que se puede comprobar con máquina.
   Testing dedica su juicio a lo que no se puede comprobar así: si una política RLS es la correcta, si un test prueba algo,
   condiciones de carrera.
4. **Las mismas puertas en CI** (`.github/workflows/ci.yml`). Si el agente se equivoca o alguien hace
   push a mano, CI lo detecta igualmente. El agente no es el único control.
5. **Directrices con id y severidad.** Permite informes accionables (`[S-04] archivo:línea`) y que
   el Orquestador decida sin interpretar prosa.
6. **Testing revisa el diff, no el resumen** de Develop.
7. **Límite de 4 rondas.** Si no converge, el problema suele ser la tarea o la directriz, y lo decide un humano.
8. **Modelos distintos:** Develop con `sonnet` (mucho volumen, tareas acotadas) y Testing con `opus`
   (menos llamadas, más juicio). Además, un revisor distinto del autor reduce los puntos ciegos compartidos.

## Consecuencias

- Más rondas y más tokens que dejar que un único agente lo haga todo. Es el precio de tener un revisor.
- El hook y las restricciones de herramientas no son infalibles. CI es la última barrera.
