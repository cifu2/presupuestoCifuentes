# Estrategia de pruebas

Base: [ADR-0006](adr/0006-calidad-y-ci.md). La DoD ([definition-of-done.md](definition-of-done.md))
es la que manda cuando hay duda.

## Niveles

| Nivel                  | Herramienta | Qué cubre                                                                        | Dónde vive                        |
| ---------------------- | ----------- | -------------------------------------------------------------------------------- | --------------------------------- |
| Unitario de dominio    | Vitest      | Reglas de precio, tamaños máximos, compatibilidades, redondeos, objetos de valor | `src/domain/**/*.test.ts`         |
| Unitario de aplicación | Vitest      | Casos de uso con puertos doblados (repositorios y servicios falsos en memoria)   | `src/application/**/*.test.ts`    |
| Integración            | Vitest      | Adaptadores contra PostgreSQL real (base de datos de test) y renderizado de PDF  | `src/infrastructure/**/*.test.ts` |
| E2E                    | Playwright  | Flujos completos de usuario en navegador, escritorio y móvil                     | `e2e/*.spec.ts`                   |

## Prioridad de pruebas por flujo crítico

1. Configurar una puerta de principio a fin y obtener precio automático correcto.
2. Superar el tamaño máximo de una serie y pasar a presupuesto manual.
3. Actualizar un precio en el panel y verlo reflejado en el configurador.
4. Emitir presupuesto, descargar el PDF y enviarlo por email.
5. Cambiar de idioma y comprobar que configurador, PDF y email salen traducidos.

Cada flujo crítico tiene su `spec` en `e2e/` y pasa a ser puerta obligatoria cuando existe.

## Reglas de escritura

- Los tests describen **comportamiento observable**, con nombre en español y en presente.
- Los dobles son de **puertos**, nunca del dominio. Un test que mockea el dominio está probando la
  implementación, no la regla.
- Datos de prueba con factorías; nada de literales gigantes repetidos.
- Un test debe poder ejecutarse solo: `pnpm test -- money` o `pnpm e2e -- --grep "tamaño máximo"`.
- Prohibido `skip`, `only` o `fixme` sin acuerdo del CTO en el PR.

## Cobertura

- Umbral **80 %** de líneas, funciones, ramas y sentencias sobre `src/domain` y `src/application`.
  El umbral está en `vitest.config.mts` y rompe el CI si baja.
- La cobertura no sustituye al criterio: las reglas de precio requieren casos explícitos de la tabla
  de decisión (una prueba por estrategia y por modificador), aunque la cobertura ya sea alta.

## E2E con Playwright

- Configuración en `playwright.config.ts`. En local usa `pnpm dev`; en CI hace build de producción.
- Proyectos: `chromium` (escritorio) y `movil` (Pixel 7). Un flujo nuevo se prueba en ambos.
- Localizadores preferentes: rol y texto accesible (`getByRole`, `getByLabel`) antes que CSS.
  Solo se añade `data-testid` cuando no hay alternativa semántica.
- Cada test parte de datos conocidos: los _fixtures_ preparan y limpian su propio estado; no se
  depende del orden de ejecución.
- Ante un fallo, el CI sube `playwright-report/` con traza, captura y vídeo del reintento.

## CI

`.github/workflows/ci.yml` ejecuta:

- `calidad`: `format:check` → `lint` → `typecheck` → `test:coverage`.
- `e2e`: instalación de Chromium → build → `pnpm e2e`.

Ambos son _checks_ requeridos en `main` (los configura DevOps en CIF-11). Un test inestable se
arregla; no se ignora ni se reintenta en bucle hasta que pasa.

## Cuando lleguen los tests con base de datos

QA (CIF-10) y DevOps (CIF-11) añadirán al job `e2e` (o a un job `integracion`) un servicio
`postgres:17`, `DATABASE_URL` apuntando a él y el paso `pnpm db:deploy` con migraciones. El esqueleto
actual no usa base de datos a propósito, para que la puerta no dependa de datos reales.
