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
