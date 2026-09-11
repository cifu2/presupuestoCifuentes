# ADR-0012 — Política ante saltos de versión mayor (TypeScript 7 y `@types/node` 26)

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO (a petición de CIF-34; Backend conforme, sin objeción registrada)
- **Ámbito:** toolchain de desarrollo (TypeScript, tipos de Node) y los PRs de Dependabot

## Contexto

El primer PR del grupo `desarrollo` de Dependabot (PR #11) sube `@types/node` de 24.13.4 a **26.5.1** y
`typescript` de 5.9.3 a **7.0.2**: dos saltos de versión **mayor** en el mismo PR. La puerta `calidad`
(ADR-0006) cae con esos cambios y el PR queda en rojo (CIF-34).

Restricciones y hechos verificables:

- El **runtime real es Node 24**: `.nvmrc` fija `24`, el job de CI usa `node-version-file: .nvmrc` y
  `engines.node` es `>=22`. Unos tipos de Node 26 no describen el runtime en el que corre la app.
- **TypeScript 7 es un salto mayor** con cambios de toolchain; abordarlo a mitad del MVP introduce
  trabajo no planificado en el camino crítico (hoy: CI → API de catálogo/motor → configurador y panel).
- **ADR-0011** ya fijó una política de madurez de versiones y ya **ignora los majors de `eslint`** en
  `.github/dependabot.yml`; existe precedente explícito para vetar majors concretos sin frenar el resto.
- La puerta de calidad no se relaja: cualquier cambio de dependencia sigue pasando por `calidad` + `e2e`
  (ADR-0006).

## Decisión

1. **Se pospone la subida a TypeScript 7** hasta que el MVP esté en producción. El proyecto se queda en
   la línea **TypeScript 5.9.x**. No se aborda un salto mayor de TypeScript durante la construcción del
   MVP.
2. **Los tipos de Node siguen al runtime.** `@types/node` se mantiene en la línea **24.x** mientras
   `.nvmrc` fije Node 24. No se aceptan majors de `@types/node` hasta que suba el runtime de Node, y
   entonces se suben **juntos**: runtime (`.nvmrc`/`engines`) + tipos, en el mismo cambio.
3. **Dependabot ignora los majors de `typescript` y `@types/node`** (`update-types:
['version-update:semver-major']`) en la entrada `npm` de `.github/dependabot.yml`, igual que ya hace
   con `eslint`. Los **minors y patches siguen llegando** con normalidad y pasando por la puerta.
4. **Cambiar la versión de Node es una decisión con ADR propio**, nunca el efecto colateral de un PR de
   Dependabot.
5. **Reevaluación diferida de TypeScript 7:** se abre un spike con el MVP ya desplegado. Criterio de
   salida: un PR propio que deje `pnpm typecheck`, `pnpm test` y `e2e` en verde. Fuera del alcance de
   CIF-34.

## Consecuencias

- El PR #11 deja de bloquear la puerta: se cierra o se reduce a los cambios aceptables, y la puerta
  `calidad` no arrastra un rojo permanente.
- El toolchain vuelve a estar **alineado con el runtime** (Node 24), que es lo que se ejecuta en local,
  CI y producción.
- **Coste asumido:** se renuncia temporalmente a las mejoras de TypeScript 7 y a los tipos de Node 26.
  El riesgo de seguridad o de corrección de tipos es bajo porque los parches y minors siguen entrando.
- El spike de TS 7 y la futura subida de Node quedan como trabajo explícito y planificable, no como
  ruido recurrente de Dependabot.

## Alternativas consideradas

- **Subir TypeScript 7 ahora.** Descartada: salto mayor con ajustes de `tsconfig`/lint en pleno camino
  crítico, y sin beneficio para el MVP.
- **No ignorar nada y dejar el PR #11 abierto en rojo.** Descartada: mantiene la puerta de calidad en
  rojo de forma permanente y normaliza el rojo como ruido.
- **Subir `@types/node` a 26 manteniendo Node 24.** Descartada: tipos que no corresponden al runtime;
  enmascara errores de API en vez de detectarlos.
- **Fijar versiones exactas (pin) en lugar de ignorar majors.** Descartada: bloquearía también los
  minors y parches, contra la política de madurez de ADR-0011.
