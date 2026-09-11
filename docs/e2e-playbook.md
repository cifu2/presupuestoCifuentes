# Playbook E2E (Playwright)

Guía operativa de la suite E2E: qué flujos cubre, cómo se ejecuta, cómo se preparan los datos y
cómo se reporta un fallo. La política general está en [testing-strategy.md](testing-strategy.md) y
la puerta obligatoria en [definition-of-done.md](definition-of-done.md).

## Ejecución

| Escenario                          | Comando                              |
| ---------------------------------- | ------------------------------------ |
| Toda la suite (escritorio y móvil) | `pnpm e2e`                           |
| Un flujo concreto                  | `pnpm e2e -- --grep "tamaño máximo"` |
| Un fichero                         | `pnpm e2e e2e/catalog-api.spec.ts`   |
| Solo un proyecto                   | `pnpm e2e -- --project=movil`        |
| Instalar Chromium                  | `pnpm e2e:install`                   |

En local el `webServer` arranca `pnpm dev`; en CI construye (`pnpm build`) y sirve con `pnpm start`.
Para otro puerto: `E2E_PORT=3210 pnpm e2e`. Contra un entorno desplegado:
`E2E_BASE_URL=https://... pnpm e2e` (nunca contra producción con datos de cliente).

Proyectos: `chromium` (Desktop Chrome) y `movil` (Pixel 7). Todo flujo nuevo se cubre en ambos.

## Mapa de flujos críticos → specs

| #   | Flujo crítico                                                      | Spec y estado                                                             |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1   | Configurar una puerta y obtener el precio automático correcto      | API: `e2e/catalog-api.spec.ts` (rama de CIF-4) · UI pendiente de CIF-7    |
| 2   | Superar el tamaño máximo de una serie y pasar a presupuesto manual | API: `e2e/catalog-api.spec.ts` (rama de CIF-4) · UI pendiente de CIF-7    |
| 3   | Actualizar un precio en el panel y verlo en el configurador        | Pendiente: depende del panel (CIF-9)                                      |
| 4   | Emitir presupuesto, descargar el PDF y enviarlo por email          | Emisión: `e2e/catalog-api.spec.ts` · PDF/email pendientes (CIF-4/CIF-14)  |
| 5   | Cambiar de idioma y comprobar configurador, PDF y email traducidos | Interfaz: `e2e/i18n.spec.ts` · presupuesto multi-idioma pendiente (CIF-4) |
| —   | Vista previa 2D del configurador                                   | Pendiente: depende de la vista 2D (CIF-6)                                 |
| —   | Panel de administración (catálogo y precios)                       | Pendiente: depende del panel (CIF-9)                                      |
| —   | Home, salud del sistema y selector de idioma                       | `e2e/smoke.spec.ts`, `e2e/i18n.spec.ts` · en verde                        |

Un flujo es **puerta obligatoria en cuanto tiene spec**: su spec debe pasar en el CI antes de
fusionar. Los flujos pendientes se añaden en el mismo PR que trae la funcionalidad (DoD, punto 2).

## Datos de prueba

- Cada test prepara y limpia su propio estado; nunca depende del orden de ejecución.
- E2E de API y de UI: catálogo de demostración en memoria (`CATALOG_DEMO_MODE`), sin base de datos.
- E2E con base de datos: hoy **ningún** E2E la usa. Si alguno la necesitara, hay que añadirle al job
  `e2e` el mismo servicio `postgres:17` (`cifuentes_test`) y el paso
  `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy` que ya tiene el job `calidad` (ver más abajo).
- **Nada de datos reales de clientes, credenciales ni secretos** en specs, capturas o informes. Los
  contactos de prueba usan siempre el dominio reservado (`@example.com`).
- Medidas, precios y acabados de prueba salen de las factorías del dominio, no de literales sueltos.

## Base de datos en CI

El job `calidad` levanta un servicio `postgres:17` efímero y publica `TEST_DATABASE_URL` a nivel de
job apuntando a `cifuentes_test`; `DATABASE_URL` se fija en línea y solo en el paso de migraciones.
Después de `typecheck` aplica las migraciones con `pnpm db:deploy` y ejecuta
`pnpm test:coverage`. Los tests de integración de los adaptadores Prisma
están guardados por `describe.runIf(process.env.TEST_DATABASE_URL)`: sin la variable se saltarían, así
que el CI debe mantenerla. En local, para reproducirlo:

```bash
DATABASE_URL=postgresql://postgres@localhost:5432/cifuentes_test pnpm db:deploy
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/cifuentes_test pnpm test
```

## Evidencia ante un fallo

Playwright guarda en `test-results/` la captura, el vídeo del reintento y la traza; el informe HTML
queda en `playwright-report/`. Cuando el job `e2e` falla, el CI sube **ambos directorios** como
artefacto. En local:

```bash
pnpm e2e -- --trace on            # traza de todos los tests
pnpm exec playwright show-report  # abrir el último informe
pnpm exec playwright show-trace test-results/<carpeta>/trace.zip
```

## Informe de fallo (plantilla)

Todo fallo se reporta en la tarea de Paperclip con estos apartados:

- **Flujo y spec**: nombre del test y fichero.
- **Entorno**: commit, proyecto (`chromium`/`movil`) y si ocurre en local o en CI.
- **Pasos**: numerados y reproducibles (`pnpm e2e -- --grep "..."`).
- **Resultado esperado**: comportamiento observable esperado.
- **Resultado obtenido**: mensaje de error real, sin recortar.
- **Evidencia**: captura y, si aplica, traza o vídeo adjuntos a la tarea (sin datos personales).
- **Alcance**: si bloquea la fusión y si afecta a otros flujos.
- **Tarea y responsable**: issue donde se corrige.

## Tests inestables

Un test inestable se arregla: no se ignora, no se reintenta en bucle hasta que pasa y no se marca
`skip`, `only` o `fixme` sin acuerdo del CTO. Si un test falla solo en CI, se reproduce primero en
local con `--repeat-each=3` y la misma configuración (`CI=1 pnpm e2e`), y se revisa la traza antes de
tocarlo.
