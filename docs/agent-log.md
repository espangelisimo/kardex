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
