# Playbook E2E (Playwright)

Guía operativa de la suite E2E: qué flujos cubre, cómo se ejecuta, cómo se preparan los datos y
cómo se reporta un fallo. La política general está en [testing-strategy.md](testing-strategy.md) y
la puerta obligatoria en [definition-of-done.md](definition-of-done.md).

## Ejecución

| Escenario                          | Comando                                             |
| ---------------------------------- | --------------------------------------------------- |
| Toda la suite (escritorio y móvil) | `pnpm e2e`                                          |
| Un flujo concreto                  | `pnpm exec playwright test --grep "tamaño máximo"`  |
| Un fichero                         | `pnpm exec playwright test e2e/catalog-api.spec.ts` |
| Solo un proyecto                   | `pnpm exec playwright test --project=movil`         |
| Instalar Chromium                  | `pnpm e2e:install`                                  |

### `pnpm exec playwright test`, nunca `pnpm e2e -- <opción>`

**`pnpm e2e -- --grep "…"` no filtra: ejecuta la suite completa.** `pnpm run <script> -- …` no
reenvía las opciones tal cual: antepone un `--` **literal** delante de todas, así que Playwright lo lee
como fin de opciones y lo que va detrás —`--grep`, `--project` y hasta `--list`— deja de ser una
opción y pasa a ser un filtro posicional. Verificado en este repositorio (CIF-525) con una sonda de
`argv` sobre un `package.json` desechable:

```console
$ pnpm run e2e -- --grep "una sola vez"      # script de sonda: imprime su argv
argv=["--","--grep","una sola vez"]          # `pnpm` antepone un `--` literal
$ pnpm exec node probe.mjs --grep "una sola vez"
argv=["--grep","una sola vez"]               # `pnpm exec` sí respeta el argv
```

La propia suite lo delata en la línea que `pnpm` imprime antes de arrancar
(`> playwright test -- --grep 'una sola vez' …`): ese `--` cierra las opciones de Playwright y el
`--grep "una sola vez"` acaba siendo un filtro posicional, así que **se ejecuta la suite entera**, que
es lo que ocurrió en el incidente de CIF-383: diez ficheros en vez del caso pedido.

Para cualquier opción de Playwright —`--grep`, `--project`, `--trace`, un fichero suelto— usa
`pnpm exec playwright test`, que invoca el binario directamente y le pasa el `argv` tal cual:

```console
$ pnpm exec playwright test --grep "una sola vez" --list
Listing tests:
  [chromium] › configurator.spec.ts:120:5 › en inglés el precio se pinta una sola vez y con la magnitud que devuelve la API
  [movil] › configurator.spec.ts:120:5 › en inglés el precio se pinta una sola vez y con la magnitud que devuelve la API
Total: 2 tests in 1 file
```

`pnpm e2e` a secas (sin opciones) sigue siendo la receta de la suite completa, y es lo que ejecuta el
CI (`.github/workflows/ci.yml`). No se añade un script `package.json` nuevo a propósito: la trampa
está en `pnpm run <script> -- <opción>`, y el camino sin trampa ya existe.

La suite levanta **dos** servidores con la misma build de producción: el principal en `E2E_PORT`
(3000) y el de administración en `E2E_ADMIN_PORT` (3001, ver
[Guarda del API del panel](#guarda-del-api-del-panel-dos-servidores)). El primero compila
(`pnpm build`) y el segundo arranca (`pnpm start`) sobre esa misma build, porque Playwright los
levanta en orden y espera a que el anterior esté listo.

En local el E2E **no reutiliza** `pnpm dev`: sirve el bundle de producción para que el resultado sea
el mismo que en CI. Si tienes el servidor de desarrollo ocupando el 3000, arranca el E2E en otro
puerto —`E2E_PORT=3210 pnpm e2e`, que usa el 3210 y el 3211— o páralo antes. Contra un entorno
desplegado: `E2E_BASE_URL=https://... pnpm exec playwright test`, definiendo también
`E2E_ADMIN_BASE_URL` (ver [Guarda del API del panel](#guarda-del-api-del-panel-dos-servidores)), y
**solo contra un entorno desechable**: la guarda de destino de abajo aborta la ejecución si el host es
producción.

## Guarda de destino: la suite no se ejecuta contra producción (CIF-525)

La suite **escribe** (`POST /api/quotes`, `POST /api/manual-quote-requests`,
`POST /api/quotes/:ref/delivery`, y los specs de administración se autoaprovisionan). Contra
producción eso son datos reales de negocio, así que producción no se usa como banco de pruebas de
E2E: [ADR-0025](adr/0025-validacion-via-envio-por-entorno.md) §5 y
[ADR-0026](adr/0026-catalogo-de-produccion-y-validacion-desplegada.md) §7. La guarda
(`e2e/support/production-guard.ts`) lo hace cumplir **cerrando en falso**: `playwright.config.ts` la
evalúa al cargarse, de modo que la suite aborta con código distinto de cero **antes de levantar
servidores y antes del primer test**.

- Vigila `E2E_BASE_URL` y `E2E_ADMIN_BASE_URL` (el segundo también escribe, con credencial de
  administración).
- Hosts declarados como producción en `PRODUCTION_HOSTS`: el alias
  `presupuesto-cifuentes.vercel.app` (proyecto de Vercel del repositorio) y `puertascifuentes.com`
  (dominio del propietario, CIF-14). También aborta con el alias de la rama `main` de Vercel
  (`presupuesto-cifuentes-git-main-…`), que sirve el despliegue de _Production_ aunque parezca un
  preview. La comparación ignora esquema, puerto, `www.` y mayúsculas.
- El host se lee con el mismo `new URL` que usa Playwright, probando el valor tal cual y con
  `http://` delante (formas sin esquema como `127.0.0.1:3000`). Así también abortan las formas que
  el parser normaliza a `https://host/` —`https:/host`, `https:host`, `https:///host`—: **una barra
  de menos no abre un agujero** (hallazgo §2 de la revisión de CIF-528).
- **No hay variable de escape.** Si un host deja de ser producción, se corrige la lista declarada, con
  su test (`e2e/support/production-guard.test.ts`).
- El E2E hermético de CI y local (**sin** `E2E_BASE_URL`) y el preview sembrado siguen igual: la
  guarda es de destino, no cambia ningún spec.
- Sigue en pie lo de [ADR-0026](adr/0026-catalogo-de-produccion-y-validacion-desplegada.md) §7: un
  entorno desplegado **sin catálogo** no es un fallo de código, es una precondición que debe
  informarse con mensaje (CIF-383).

Proyectos: `chromium` (Desktop Chrome) y `movil` (Pixel 7). Todo flujo nuevo se cubre en ambos.

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
- E2E de API y de UI: catálogo de demostración en memoria (`CATALOG_DEMO_MODE`), sin base de datos.
- El catálogo de demostración siembra los **borradores** de tarifa que necesita el E2E de
  publicación (CIF-544): dos con vigencia futura y sin predecesora (publicarlos no cambia el precio
  vigente de su serie, CI-400), uno por proyecto de Playwright con **predecesora de vigencia
  abierta** y precio distinto (CI-100 para `chromium` y CI-300 para `movil`: publicarlos cierra la
  predecesora en su `validFrom` y el configurador pasa a dar el precio nuevo) y uno que empieza a la
  vez que la tarifa publicada de su serie (CI-200), que es el caso `409` que nunca escribe. Los ids
  y las series son distintos por proyecto para que `fullyParallel` no comparta estado mutable.
- E2E con base de datos: hoy **ningún** E2E la usa. Si alguno la necesitara, hay que añadirle al job
  `e2e` el mismo servicio `postgres:17` (`cifuentes_test`) y el paso
  `DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy` que ya tiene el job `calidad` (ver más abajo).
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
- `e2e/admin-tariff-publish.spec.ts` (CIF-86/CIF-87/CIF-544) cubre `503` —también con un id
  inexistente, para demostrar que la guarda corre antes que cualquier otra comprobación—, `401` (sin
  cabecera y con token incorrecto), `404 NOT_FOUND` con un id que no es UUID y con un UUID válido
  inexistente (nunca `500`, hallazgo N2 de CIF-85), `200` con publicación idempotente —tanto al
  publicar un borrador dos veces como al republicar una tarifa ya publicada, que conserva su
  `publishedAt`—, el **cierre de la predecesora de vigencia abierta** (ADR-0003 rev. 2 §8: la
  respuesta trae `closedPredecessor` cerrado en el `validFrom` de la candidata y el configurador del
  servidor de administración sirve el precio nuevo) y `409 AMBIGUOUS_TARIFF` dejando el borrador
  intacto. Los ids de las tarifas del catálogo demo son UUID canónicos (`0192f1b0-…`) porque el
  borde valida el `:id`; el spec usa los de las series CI-100 (chromium), CI-300 (movil), CI-200
  (caso 409) y CI-400 (sin predecesora). Los borradores que siembra el catálogo demo son el mínimo
  para cubrirlo sin panel: crear el borrador **desde la interfaz** llega con CIF-9 (flujo 3).

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
- **Un entorno sin catálogo falla como precondición con mensaje, no por timeout** (ADR-0026 §7,
  dentro de ADR-0015 §7): `e2e/configurator.spec.ts` comprueba `GET /api/catalog/series` antes de
  interactuar y, si no hay series publicadas, falla nombrando la decisión y el preview sembrado
  (`scripts/seed-preview-catalogo.sh`, CIF-330). El catálogo de demostración de la suite mantiene el
  spec en verde en CI y en local (`CATALOG_DEMO_MODE=true`).

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
pnpm exec playwright test --trace on   # traza de todos los tests
pnpm exec playwright show-report  # abrir el último informe
pnpm exec playwright show-trace test-results/<carpeta>/trace.zip
```

## Informe de fallo (plantilla)

Todo fallo se reporta en la tarea de Paperclip con estos apartados:

- **Flujo y spec**: nombre del test y fichero.
- **Entorno**: commit, proyecto (`chromium`/`movil`) y si ocurre en local o en CI.
- **Pasos**: numerados y reproducibles (`pnpm exec playwright test --grep "..."`).
- **Resultado esperado**: comportamiento observable esperado.
- **Resultado obtenido**: mensaje de error real, sin recortar.
- **Evidencia**: captura y, si aplica, traza o vídeo adjuntos a la tarea (sin datos personales).
- **Alcance**: si bloquea la fusión y si afecta a otros flujos.
- **Tarea y responsable**: issue donde se corrige.

## Tests inestables

Un test inestable se arregla: no se ignora, no se reintenta en bucle hasta que pasa y no se marca
`skip`, `only` o `fixme` sin acuerdo del CTO. Si un test falla solo en CI, se reproduce primero en
local con `--repeat-each=3` y la misma configuración
(`CI=1 pnpm exec playwright test --repeat-each=3`), y se revisa la traza antes de tocarlo.
