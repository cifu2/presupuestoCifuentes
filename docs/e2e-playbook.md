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

La suite levanta **dos** servidores con la misma build de producción: el principal en `E2E_PORT`
(3000) y el de administración en `E2E_ADMIN_PORT` (3001, ver
[Guarda del API del panel](#guarda-del-api-del-panel-dos-servidores)). El primero compila
(`pnpm build`) y el segundo arranca (`pnpm start`) sobre esa misma build, porque Playwright los
levanta en orden y espera a que el anterior esté listo.

Los dos sirven en modo `prisma` contra un PostgreSQL efímero que hay que migrar antes
(`pnpm db:deploy`); la suite siembra el catálogo sintético y falla en alto si `DATABASE_URL` falta
([Base de datos efímera](#base-de-datos-efímera-la-suite-corre-en-modo-prisma)).

En local el E2E **no reutiliza** `pnpm dev`: sirve el bundle de producción para que el resultado sea
el mismo que en CI. Si tienes el servidor de desarrollo ocupando el 3000, arranca el E2E en otro
puerto —`E2E_PORT=3210 pnpm e2e`, que usa el 3210 y el 3211— o páralo antes. Contra un entorno
desplegado: `E2E_BASE_URL=https://... pnpm e2e`, definiendo también `E2E_ADMIN_BASE_URL` (ver
[Guarda del API del panel](#guarda-del-api-del-panel-dos-servidores); nunca contra producción con
datos de cliente).

Proyectos: `chromium` (Desktop Chrome) y `movil` (Pixel 7). Todo flujo nuevo se cubre en ambos.

## Base de datos efímera (la suite corre en modo `prisma`)

La suite **no** usa el catálogo de demostración en memoria: los dos servidores comparten un PostgreSQL
efímero migrado y sembrado, para que la escritura del panel y la lectura del configurador sean el
mismo estado (flujo 3, ADR-0027 §5). En modo demostración el catálogo vive en memoria **por proceso**
y la escritura de un servidor no llega al otro (`src/composition/container.ts`, ADR-0013 §8).

La siembra la hace la propia suite al arrancar (`e2e/support/global-setup.ts`), con el catálogo de
demostración de `src/infrastructure/demo/demo-catalog.ts` y datos **inventados**: ningún dato del
propietario ni de clientes (ADR-0014 §1). El job `e2e` del CI levanta su propio servicio
`postgres:17` (`cifuentes_test`) y aplica las migraciones antes de `pnpm e2e` (ver
[Base de datos en CI](#base-de-datos-en-ci)).

En local, con Docker:

```bash
docker run --rm -d --name cifuentes-e2e-pg -p 5433:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=cifuentes_test \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17

export DATABASE_URL=postgresql://postgres@127.0.0.1:5433/cifuentes_test
pnpm db:deploy   # migra el esquema: la suite siembra, pero no migra
pnpm e2e         # siembra el catálogo sintético y ejecuta la suite
```

Con un PostgreSQL local ya en marcha basta con una base desechable (`createdb cifuentes_test`) y
exportar `DATABASE_URL`. La cadena **no** vive en el repositorio y nunca apunta a producción ni a
datos del propietario; `e2e/support/database.ts` aborta si el nombre de la base no lleva `test` o
`e2e`, o si menciona `prod`, porque el E2E emite presupuestos y publica tarifas de verdad contra lo
que tenga delante. Sin `DATABASE_URL` la suite falla al arrancar, con instrucciones, en vez de correr
en un modo donde el flujo 3 no se puede observar.

Los ids del catálogo sembrado son deterministas y están en `e2e/support/catalogo-e2e.ts`
(`E2E_CATALOG`): los specs que publican o editan precios los leen de ahí, y cada proyecto de
Playwright usa una entidad distinta para no compartir estado mutable. Los specs del configurador
resuelven los ids de acabado, color y accesorio con `catalogoIds` (`e2e/support/catalogo.ts`), así que
no fijan literales de ningún modo.

## Mapa de flujos críticos → specs

| #   | Flujo crítico                                                      | Spec y estado                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Configurar una puerta y obtener el precio automático correcto      | API: `e2e/catalog-api.spec.ts` (rama de CIF-4) · UI pendiente de CIF-7                                                                                                                            |
| 2   | Superar el tamaño máximo de una serie y pasar a presupuesto manual | API: `e2e/catalog-api.spec.ts` (rama de CIF-4) · UI pendiente de CIF-7                                                                                                                            |
| 3   | Actualizar un precio en el panel y verlo en el configurador        | Pendiente: depende del panel (CIF-9)                                                                                                                                                              |
| 4   | Emitir presupuesto, descargar el PDF y enviarlo por email          | `e2e/quote-delivery.spec.ts`: emisión y PDF en el servidor público · email en el de administración (CI) · preview: solo camino público ([ADR-0025](adr/0025-validacion-via-envio-por-entorno.md)) |
| 5   | Cambiar de idioma y comprobar configurador, PDF y email traducidos | Interfaz: `e2e/i18n.spec.ts` · presupuesto multi-idioma pendiente (CIF-4)                                                                                                                         |
| —   | Vista previa 2D del configurador                                   | Pendiente: depende de la vista 2D (CIF-6)                                                                                                                                                         |
| —   | Panel de administración (catálogo y precios)                       | Pendiente: depende del panel (CIF-9)                                                                                                                                                              |
| —   | API de publicación de tarifas del panel (503/401/404/200/409)      | API: `e2e/admin-tariff-publish.spec.ts` · en verde                                                                                                                                                |
| —   | Acceso al panel: sin sesión no se entra; con sesión sí (CIF-241)   | UI: `e2e/admin-auth.spec.ts` · en verde                                                                                                                                                           |
| —   | Home, salud del sistema y selector de idioma                       | `e2e/smoke.spec.ts`, `e2e/i18n.spec.ts` · en verde                                                                                                                                                |

Un flujo es **puerta obligatoria en cuanto tiene spec**: su spec debe pasar en el CI antes de
fusionar. Los flujos pendientes se añaden en el mismo PR que trae la funcionalidad (DoD, punto 2).

## Datos de prueba

- Cada test prepara y limpia su propio estado; nunca depende del orden de ejecución.
- E2E de API y de UI: catálogo de demostración sembrado en el PostgreSQL efímero
  ([Base de datos efímera](#base-de-datos-efímera-la-suite-corre-en-modo-prisma)); nada de datos
  reales.
- El catálogo sintético siembra dos **borradores** de tarifa para el E2E de publicación: uno con
  vigencia futura (publicarlo no cambia el precio vigente de su serie) y otro que solapa con la
  tarifa publicada de la suya. Los dos publicables llevan una tabla de precios mínima —desde
  ADR-0027 §4 una versión sin tabla no se publica— y sus vigencias no cambian ningún precio del
  configurador, así que el orden de ejecución no altera el resultado.
- **Nada de datos reales de clientes, credenciales ni secretos** en specs, capturas o informes. Los
  contactos de prueba usan siempre el dominio reservado (`@example.com`).
- Medidas, precios y acabados de prueba salen de las factorías del dominio, no de literales sueltos.

## Guardas del panel: dos servidores

Las dos guardas del panel **fallan cerradas** sin configuración, y sus estados no se pueden observar
en el mismo proceso:

- el API de administración exige credenciales y responde `503 ADMIN_API_DISABLED` si no hay
  `ADMIN_API_TOKEN` ni sesión configurada;
- el acceso a la interfaz (`/[locale]/admin/**`, CIF-241) redirige a `/[locale]/acceso` sin sesión
  válida, y `POST /api/admin/session` responde `503 ADMIN_ACCESS_DISABLED` si el servidor no tiene
  `ADMIN_SESSION_SECRET` ni `ADMIN_PANEL_PASSWORD`.

Por eso la suite levanta dos servidores con la misma build:

| Servidor       | Puerto                  | Credenciales del panel                | Specs que lo usan                                                         |
| -------------- | ----------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| principal      | `E2E_PORT` (3000)       | todas vacías → guardas deshabilitadas | el resto de la suite, `503` del API y acceso deshabilitado                |
| administración | `E2E_ADMIN_PORT` (3001) | token y sesión de pruebas             | `401`, `200` al publicar, `409 AMBIGUOUS_TARIFF` y acceso del propietario |

- Los dos servidores comparten la misma base efímera (ADR-0027 §5): es lo que hace observable el
  flujo 3, porque en modo demostración cada proceso tendría su catálogo en memoria.
- Puertos y credenciales se centralizan en `e2e/support/servers.ts`; el spec cambia de servidor con
  `test.use({ baseURL: E2E_ADMIN_BASE_URL })`. Se ajustan con `E2E_ADMIN_PORT`,
  `E2E_ADMIN_BASE_URL`, `E2E_ADMIN_TOKEN`, `E2E_ADMIN_SESSION_SECRET` y `E2E_ADMIN_PANEL_PASSWORD`.
- El token, el secreto de sesión y la credencial por defecto **no son secretos**: son valores de
  pruebas que viven en el repositorio y solo sirven contra el servidor que levanta la propia suite.
  Nunca se usan los valores reales de un despliegue.
- `e2e/admin-auth.spec.ts` (CIF-241) cubre la guarda de `/[locale]/admin/**` en los dos proyectos: sin
  sesión redirige al acceso (y avisa si el panel no está configurado), una cookie manipulada no abre
  el panel, el propietario entra con su credencial —cookie `HttpOnly`, `SameSite=Lax`—, el API acepta
  esa sesión sin `Bearer`, el cierre de sesión la borra y sin credenciales el API responde `401`.
- Playwright arranca los `webServer` **en orden** y espera a que cada uno responda, así que solo el
  primero compila; el segundo sirve la misma build. El CI no cambia: sigue bastando `pnpm e2e`.
- Contra un entorno ya desplegado solo se ejercita el **camino público**: se define `E2E_BASE_URL` y
  **no** se definen credenciales de panel, porque no se despliegan en preview
  ([ADR-0025](adr/0025-validacion-via-envio-por-entorno.md) §2-§3). Los specs con credencial —los que
  hacen `test.use({ baseURL: E2E_ADMIN_BASE_URL })`— corren en el servidor de administración de CI,
  nunca contra un despliegue: el token de pruebas solo vale para el servidor que levanta la suite.
- `e2e/admin-tariff-publish.spec.ts` (CIF-86/CIF-87) cubre `503` —también con un id inexistente,
  para demostrar que la guarda corre antes que cualquier otra comprobación—, `401` (sin cabecera y
  con token incorrecto), `404 NOT_FOUND` con un id que no es UUID y con un UUID válido inexistente
  (nunca `500`, hallazgo N2 de CIF-85), `200` con publicación idempotente —tanto al publicar un
  borrador dos veces como al republicar una tarifa ya publicada, que conserva su `publishedAt`— y
  `409 AMBIGUOUS_TARIFF` dejando el borrador intacto. Los ids de las tarifas del catálogo demo son
  UUID canónicos (`0192f1b0-…`) porque el borde valida el `:id`; el spec usa los de las series
  CI-100 y CI-400. Los borradores que siembra el catálogo demo son el mínimo para cubrirlo sin
  panel: crear el borrador **desde la interfaz** llega con CIF-9 (flujo 3).

## Alcance por entorno: qué se valida en el preview y qué en CI (ADR-0025)

**El preview del PR valida el camino público; los flujos detrás de una credencial de administración
se validan en CI**, con el token de pruebas y el catálogo de demostración de la propia suite
([ADR-0025](adr/0025-validacion-via-envio-por-entorno.md)). `ADMIN_API_TOKEN` no se despliega en
_Preview_, así que su `503 ADMIN_API_DISABLED` es el comportamiento **esperado y comprobado**, no un
fallo que haya que reportar.

| Flujo                                             | CI (`pnpm e2e`)                | Preview del PR           | Producción                     |
| ------------------------------------------------- | ------------------------------ | ------------------------ | ------------------------------ |
| Emitir presupuesto y descargar el PDF             | `e2e/quote-delivery.spec.ts`   | Sí (`201` y PDF `200`)   | Sí                             |
| Entrega protegida (email) y reintento             | Sí, servidor de administración | No: `503` por diseño     | Smoke del propietario (CIF-14) |
| Guarda del API del panel: `503`/`401`/`404`/`409` | Sí, servidor de administración | Solo el `503` en cerrado | Sí                             |

- **El token de pruebas nunca se usa contra un despliegue.** Solo vale para el servidor que levanta la
  propia suite; contra un preview no hay credencial de administración y no debe haberla.
- **Sin `RESEND_FROM` y `RESEND_API_KEY` no hay envío real**: la entrega la ejerce el adaptador de
  consola (ADR-0004 §4), así que un preview «en vivo» no probaría ningún correo. El envío real se
  comprueba en producción tras el release, con la configuración del propietario (CIF-14).

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

El job `e2e` levanta su propio servicio `postgres:17` (misma imagen, misma base `cifuentes_test`,
autenticación `trust` y solo en localhost) y publica `DATABASE_URL` a nivel de job, porque la suite
sirve los dos servidores en modo `prisma`. Antes de `pnpm e2e` aplica las migraciones con
`pnpm db:deploy`; la siembra del catálogo sintético la hace la propia suite, así que no hay ningún
paso de CI que se pueda olvidar ni desincronizar (ADR-0027 §5).

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
