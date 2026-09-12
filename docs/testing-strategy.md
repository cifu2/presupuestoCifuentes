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
| Contrato del borde     | Bash + curl | Los cuatro estados de `/api/health` sobre la build de producción servida         | `scripts/health-http-check.sh`    |

## Prioridad de pruebas por flujo crítico

1. Configurar una puerta de principio a fin y obtener precio automático correcto.
2. Superar el tamaño máximo de una serie y pasar a presupuesto manual.
3. Actualizar un precio en el panel y verlo reflejado en el configurador.
4. Emitir presupuesto, descargar el PDF y enviarlo por email.
5. Cambiar de idioma y comprobar que configurador, PDF y email salen traducidos.

Cada flujo crítico tiene su `spec` en `e2e/` y pasa a ser puerta obligatoria cuando existe. El
mapa de flujos a specs, los datos de prueba y la plantilla de informe de fallo están en
[e2e-playbook.md](e2e-playbook.md).

## Reglas de escritura

- Los tests describen **comportamiento observable**, con nombre en español y en presente.
- Los dobles son de **puertos**, nunca del dominio. Un test que mockea el dominio está probando la
  implementación, no la regla.
- Datos de prueba con factorías; nada de literales gigantes repetidos.
- Un test debe poder ejecutarse solo: `pnpm test -- money` o `pnpm e2e -- --grep "tamaño máximo"`.
- Prohibido `skip`, `only` o `fixme` sin acuerdo del CTO en el PR.
- **Verificación previa al push:** `pnpm secret:scan` solo mira ficheros **rastreados** por git. Con
  ficheros nuevos hay que ejecutarlo **después** de `git add` (o usar `--values-stdin`); antes del
  `git add` da un verde falso y el CI lo destapa con el PR ya abierto.

## Cobertura

- Umbral **80 %** de líneas, funciones, ramas y sentencias sobre `src/domain` y `src/application`.
  El umbral está en `vitest.config.mts` y rompe el CI si baja.
- La cobertura no sustituye al criterio: las reglas de precio requieren casos explícitos de la tabla
  de decisión (una prueba por estrategia y por modificador), aunque la cobertura ya sea alta.

## E2E con Playwright

- Configuración en `playwright.config.ts`. En local y en CI sirve la build de producción y levanta
  **dos** servidores (principal y de administración) con la misma build, porque las guardas del panel
  cambian de comportamiento según `ADMIN_API_TOKEN` y la sesión de interfaz
  ([e2e-playbook.md](e2e-playbook.md#guardas-del-panel-dos-servidores)).
- Proyectos: `chromium` (escritorio) y `movil` (Pixel 7). Un flujo nuevo se prueba en ambos.
- Localizadores preferentes: rol y texto accesible (`getByRole`, `getByLabel`) antes que CSS.
  Solo se añade `data-testid` cuando no hay alternativa semántica.
- Cada test parte de datos conocidos: los _fixtures_ preparan y limpian su propio estado; no se
  depende del orden de ejecución.
- Ante un fallo, el CI sube `playwright-report/` y `test-results/` con informe, traza, captura y
  vídeo del reintento.

## CI

`.github/workflows/ci.yml` ejecuta:

- `calidad`: `format:check` → `lint` → `typecheck` → `pnpm db:deploy` → `test:coverage` → 5 pasadas
  consecutivas de `repositories.test.ts`, con un servicio `postgres:17` efímero y
  `TEST_DATABASE_URL` apuntando a `cifuentes_test`, para que los tests de integración se ejecuten en
  lugar de saltarse. Al final, `./scripts/health-http-check.sh` (CIF-456) sirve la build de
  producción y comprueba el contrato HTTP de `/api/health` en sus cuatro estados (200 `ok`, 200
  `unconfigured`, 503 `unmigrated` y 503 `unreachable`); deja `salud-http.log` como artefacto.
- `e2e`: instalación de Chromium → build → `pnpm e2e`; ante un fallo sube `playwright-report/` y
  `test-results/` (informe, capturas, trazas y vídeo del reintento).

Ambos son _checks_ requeridos en `main` (los configura DevOps en CIF-11). Un test inestable se
arregla; no se ignora ni se reintenta en bucle hasta que pasa.

## Base de datos en los tests

El job `calidad` levanta un servicio `postgres:17` efímero (autenticación `trust`, base
`cifuentes_test`), publica `TEST_DATABASE_URL` y aplica las migraciones con
`DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy` antes de `pnpm test:coverage` (CIF-10/CIF-19).
Los E2E de API y de UI siguen usando el catálogo de demostración en memoria, para que la puerta no
dependa de datos reales.

Los tests de integración (`src/infrastructure/**/*.test.ts`) se declaran con
`describe.runIf(TEST_DATABASE_URL)`: **si la variable falta, se saltan en silencio**, así que el job
debe garantizarla. La guarda está en `src/config/ci-workflow.test.ts`, para que nadie quite el
servicio ni renombre los checks requeridos sin que el CI lo note. Los datos son los que siembra cada
test y se limpian al terminar; no se usa ninguna base de datos real ni credenciales de cliente.

### Contrato HTTP de `/api/health`

La sonda del monitor externo (ADR-0009 §5) no ve el caso de uso, ve el borde: código HTTP y cuerpo.
Los unitarios de la ruta doblan el caso de uso, así que no cubren el montaje real (variables de
entorno, driver, bundle). `scripts/health-http-check.sh` cierra ese hueco: compila la build de
producción y la sirve una vez por estado del contrato (ADR-0015 §5) contra la base de test ya
migrada. `unmigrated` se provoca con `search_path` a un esquema inexistente (no ejecuta ningún DDL)
y `unreachable` con un puerto cerrado. Su contrato se prueba en
`scripts/health-http-check.test.sh`, que dobla `pnpm` y `curl` para que una regresión de los 503
salga en rojo sin compilar ni tocar la base. En local: `pnpm salud:http`, con `TEST_DATABASE_URL`.

### Carreras: entrelazado forzado, no scheduling

Una prueba de concurrencia no puede depender de cómo reparta el runner los _await_ de dos peticiones:
el resultado cambia entre 2-0 y 1-1 sin que el código haya cambiado. La carrera de entrega de
presupuestos (CIF-175 F1) se fuerza con una costura en el doble de email (`makeDoubles(onSend)`) que
deja la primera petición dentro del envío con sus dos reservas vivas mientras arranca la segunda, y
las afirmaciones se hacen sobre la **reserva idempotente** (una fila y un intento por destinatario,
un correo por destinatario) y no sobre cuántas respuestas ven `delivered`. La repetición de las 5
pasadas en `calidad` es la evidencia de que el escenario es determinista (CIF-406).

Procedimiento y plantilla de informes de fallo: [e2e-playbook.md](e2e-playbook.md).
