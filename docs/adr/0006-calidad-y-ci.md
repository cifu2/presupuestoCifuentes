# ADR-0006 — Calidad: tests, cobertura y puerta de E2E en CI

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO
- **Ámbito:** pruebas, CI y revisión

## Contexto

La regla de oro del proyecto es que nada está terminado sin (1) test automático que lo cubra,
(2) E2E de los flujos afectados en verde y (3) revisión de otro agente. Eso exige que la puerta sea
ejecutable y automática, no una convención oral.

## Decisión

1. **Vitest** para tests unitarios y de integración (dominio, casos de uso y adaptadores con dobles).
   Configuración en `vitest.config.mts`.
2. **Playwright** para E2E, con dos proyectos: escritorio (Chromium) y móvil (Pixel 7). Los tests
   viven en `e2e/` y arrancan la aplicación solos (`webServer`), en modo desarrollo en local y con
   build de producción en CI.
3. **Cobertura mínima del 80 %** (líneas, funciones, ramas y sentencias) sobre `src/domain` y
   `src/application`. El umbral está en la configuración: si baja, el CI falla. Las reglas de precio
   nuevas exigen casos explícitos de la tabla de decisión.
4. **Puerta obligatoria en CI** (`.github/workflows/ci.yml`) con dos jobs que son _checks_
   requeridos en `main`:
   - `calidad`: `format:check` + `lint` + `typecheck` + `test:coverage`.
   - `e2e`: build de producción + Playwright (escritorio y móvil).
5. **Los tests no se relajan**: prohibido `skip`, `only` o `fixme` sin acuerdo explícito del CTO
   registrado en el PR. Un test lento se optimiza, no se desactiva.
6. **Otro agente revisa siempre**: el autor no puede aprobar su propio PR (lo verifica la revisión
   del PR y, en última instancia, el CTO).
7. **Prettier** con configuración fija y `format:check` en CI: el formato no se discute en revisión.

## Ampliación (CIF-601): la puerta de sintaxis y `shellcheck` cubre todos los `*.sh` versionados

El punto 4 enumeraba la puerta de shell sobre `scripts/*.sh`. Eso dejaba fuera
`docs/runbooks/disco-guard.sh`: la copia canónica de la guarda de disco del host, que se instala en
`/usr/local/sbin/` y se ejecuta **como root** (borra cachés y artefactos regenerables). El hueco lo
destapó QA en CIF-591 (H5) y DevOps lo elevó en CIF-597; el CTO decide en **CIF-601**.

**Decisión:** los dos pasos de shell del job `calidad` enumeran el **conjunto versionado completo**
(`git ls-files '*.sh'`), no un glob de directorio. Se usa `git ls-files` en vez de
`docs/runbooks/*.sh` porque (a) un glob literal falla mientras el directorio no exista y (b) cubre
cualquier runbook futuro sin volver a tocar `ci.yml`. Una guarda en `src/config/ci-workflow.test.ts`
falla si alguien vuelve a estrechar la enumeración a `scripts/*.sh`.

Se descarta mover la copia canónica a `scripts/` (partiría el trío script + `.service` + `.timer` y
solo arreglaría esa instancia) y dejarlo como estaba (deja toda una clase de scripts que corren en el
host fuera de la puerta, contra el principio de este ADR: la puerta es automática, no una convención).
Coste explícito: una rama `ci/**` = 1 preview + 1 despliegue de producción al fusionar
([ADR-0019](0019-cuota-despliegues-vercel.md) §5), aceptado porque la edición de ese script ya estaba
planificada (ADR-0029 punto 3 → CIF-598) y hasta ahora solo tenía comprobación manual.

## Consecuencias

- El ciclo de feedback de un PR son ~5-10 minutos: suficiente para no bloquear el trabajo en
  paralelo de varios agentes.
- La suite E2E crecerá con cada flujo crítico (configurador, precio en vivo, presupuesto manual,
  PDF/email, panel, i18n). QA es responsable de mantenerla verde y rápida; el CTO decide qué se
  convierte en puerta obligatoria.
- Los informes de cobertura y de Playwright se suben como artefactos del CI para poder revisarlos
  desde el PR.

## Alternativas consideradas

- **Solo tests E2E:** descartado; el cálculo de precios necesita pruebas unitarias exhaustivas y
  rápidas.
- **Solo tests unitarios:** descartado; el plan exige E2E de los flujos afectados como puerta.
