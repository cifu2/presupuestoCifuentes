# Variables de entorno y secretos

Inventario de la configuración por entorno del MVP. **Ningún valor real se escribe en el
repositorio, ni en documentación, ni en comentarios, ni en capturas** (ADR-0007 y Definition of Done,
apartado _Seguridad_).

## 1. Inventario

| Variable                                      | Producción                          | Preview                          | Desarrollo local                   | Se define en                                                                 |
| --------------------------------------------- | ----------------------------------- | -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Neon, base `presupuesto_production` | Neon, base `presupuesto_preview` | PostgreSQL local o rama dev        | Vercel (`DATABASE_URL__PRODUCTION` / `DATABASE_URL__PREVIEW`) y `.env.local` |
| `NEXT_PUBLIC_SITE_URL`                        | `https://<dominio-produccion>`      | URL del deployment de preview    | `http://localhost:3000`            | Vercel (Production / Preview) y `.env.local`                                 |
| `CATALOG_DEMO_MODE`                           | `false`                             | `false`                          | `false`                            | Vercel (opcional) y `.env.local`                                             |
| `ADMIN_PANEL_ENABLED`                         | `false` (panel cerrado)             | no definida                      | no definida                        | Vercel (Production, opcional) y `.env.local`                                 |
| `QUOTE_VALIDITY_DAYS`                         | `30`                                | `30`                             | `30`                               | Vercel (opcional) y `.env.local`                                             |
| `ADMIN_API_TOKEN`                             | no definida (opcional)              | no definida                      | valor de desarrollo                | Vercel (Production, opcional) y `.env.local`                                 |
| `ADMIN_SESSION_SECRET`                        | valor propio del despliegue (≥ 32)  | no definida                      | valor de desarrollo                | Vercel (Production) y `.env.local`                                           |
| `ADMIN_PANEL_PASSWORD`                        | valor propio del despliegue (≥ 16)  | no definida                      | valor de desarrollo                | Vercel (Production) y `.env.local`                                           |
| `RESEND_FROM`                                 | pendiente del propietario (CIF-14)  | no definida                      | no definida (adaptador de consola) | Vercel (Production) y `.env.local`                                           |
| `RESEND_API_KEY`                              | pendiente del propietario (CIF-14)  | no definida                      | no definida                        | Vercel (Production, _Sensitive_) y `.env.local`                              |
| `QUOTE_INTERNAL_RECIPIENTS`                   | buzón del comercial (CIF-14)        | valor de pruebas                 | opcional                           | Vercel (Production / Preview) y `.env.local`                                 |
| `QUOTE_ISSUER_*`                              | datos fiscales (CIF-14)             | datos fiscales (CIF-14)          | opcional (marcador)                | Vercel y `.env.local`                                                        |
| `QUOTE_CONDITIONS_ES` / `QUOTE_CONDITIONS_EN` | condiciones legales (CIF-14)        | igual                            | opcional (marcador)                | Vercel y `.env.local`                                                        |
| `NODE_ENV`                                    | lo fija Vercel (`production`)       | lo fija Vercel (`production`)    | lo fija Next.js                    | No se configura a mano                                                       |
| `VERCEL_ENV`                                  | lo fija Vercel (`production`)       | lo fija Vercel (`preview`)       | no definida                        | No se configura a mano                                                       |

`DATABASE_URL` es configuración **por entorno**, no una variable común: el fichero de valores declara
`DATABASE_URL__PRODUCTION`, `DATABASE_URL__PREVIEW` y `DATABASE_URL__DEVELOPMENT`, y
`scripts/vercel-bootstrap.sh` inyecta `DATABASE_URL` **solo** en el entorno que corresponde, siempre
con `--sensitive`. Un `DATABASE_URL` sin sufijo aborta el script antes de escribir nada en Vercel
([ADR-0015](adr/0015-base-de-datos-de-produccion.md) §4; compartir base entre entornos está prohibido
por [ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md) §2). Producción y preview apuntan a
bases **distintas** del proyecto de Neon: `presupuesto_production` y `presupuesto_preview`. En local,
`.env.local` y `.env.example` siguen usando `DATABASE_URL` a secas; el sufijo es del fichero que
consume el bootstrap de Vercel.

- El esquema de validación está en `src/config/env.ts` (Zod). `DATABASE_URL` y
  `NEXT_PUBLIC_SITE_URL` son opcionales en el esquema para que el esqueleto arranque sin base de
  datos; en producción **deben** estar definidas y `/api/health` lo comprueba de verdad
  (ADR-0015 §5): `database: "ok"` si la base responde a `SELECT 1`, `unreachable` (HTTP 503) si
  está definida pero no responde en 2 s, y `unconfigured` (HTTP 200) si falta la variable o
  `CATALOG_DEMO_MODE=true`. El valor de la variable nunca aparece en la respuesta ni en los logs.
- `/api/health` informa `environment` con `VERCEL_ENV ?? NODE_ENV`: en Vercel distingue `production`
  de `preview` (dentro de Vercel, `NODE_ENV` es `production` en ambos), y fuera de Vercel cae en
  `NODE_ENV`.
- `CATALOG_DEMO_MODE` se interpreta como booleano **textual** (`"true"`/`"false"`, y sus
  variantes `1`/`0`, `yes`/`no`, `on`/`off`); un valor ambiguo falla al arrancar en lugar de
  activar el modo demo en silencio. `z.coerce.boolean()` no vale porque `Boolean("false")` es
  `true` (CIF-74).
- `ADMIN_PANEL_ENABLED` es el interruptor de la guarda del shell del panel
  ([ADR-0023](adr/0023-arranque-panel-shell-presentacion.md) §5) y se lee con el **mismo booleano
  textual** que `CATALOG_DEMO_MODE` (`environmentFlag`). Solo interviene en _Production_, donde el
  panel está **cerrado por defecto**: el shell no se sirve y solo se abre con
  `ADMIN_PANEL_ENABLED=true`. Quien no tiene sesión no llega a ver la diferencia, porque el Proxy de
  [ADR-0024](adr/0024-autenticacion-panel-sesion-firmada.md) §5 lo redirige antes a
  `/[locale]/acceso`; con sesión válida, la guarda cerrada es un `404`. En _Preview_ y en local la
  guarda no interviene y el panel se sirve sin la variable. Un valor ambiguo no abre nada: la guarda
  lo rechaza en cada petición a esa ruta (el sitio público sigue vivo).
- **`ADMIN_PANEL_ENABLED` y `CATALOG_DEMO_MODE` son puertas independientes:** las dos pueden dejar
  servido el shell, pero por vías distintas. El catálogo en memoria lo sirve el contenedor cuando
  `CATALOG_DEMO_MODE=true` **o** cuando no hay `DATABASE_URL` (`src/composition/container.ts`),
  mientras que la guarda de ADR-0023 §5 solo se abre con `CATALOG_DEMO_MODE=true`: un despliegue sin
  `DATABASE_URL` y con `CATALOG_DEMO_MODE=false` sirve el catálogo de fixture pero mantiene el panel
  **cerrado** (`404` con sesión válida). En _Production_, `CATALOG_DEMO_MODE=true` es inválido (la
  web no usa los datos reales de Neon **y** la guarda deja de cerrar el shell, que sigue detrás de la
  sesión de ADR-0024); la combinación válida es `CATALOG_DEMO_MODE` sin definir o a `false`, con
  `ADMIN_PANEL_ENABLED=true` solo si el propietario decide servir el panel.
  `scripts/despliegue-preflight.sh` marca `PENDIENTE` si `CATALOG_DEMO_MODE` está activa en
  _Production_ y solo **informa** del estado de `ADMIN_PANEL_ENABLED`, que sí es un interruptor
  legítimo.
- `NEXT_PUBLIC_SITE_URL` es pública por diseño (viaja al navegador). `DATABASE_URL` es un secreto: se
  marca como _Sensitive_ en Vercel y no se lee nunca desde el cliente.
- **Entrega del presupuesto (CIF-173, ADR-0004).** Los valores que dependen del propietario son
  configuración, no código, así que rellenarlos no exige tocar nada:
  - `RESEND_FROM` es el remitente verificado (por ejemplo `Puertas Cifuentes <presupuestos@…>`).
    **Sin `RESEND_FROM` y `RESEND_API_KEY` la aplicación usa el adaptador de consola**: no envía
    correo real y deja traza del envío. Es el comportamiento por defecto mientras no llegue la
    respuesta de CIF-14.
  - `QUOTE_INTERNAL_RECIPIENTS` es la lista de destinatarios internos (buzón del comercial y copias)
    separada por comas. El cliente se añade con los datos que envía el configurador.
  - `QUOTE_ISSUER_NAME`, `QUOTE_ISSUER_TAX_ID`, `QUOTE_ISSUER_ADDRESS`, `QUOTE_ISSUER_EMAIL`,
    `QUOTE_ISSUER_PHONE` y `QUOTE_ISSUER_WEBSITE` son los datos fiscales de la cabecera del PDF.
    Mientras falten, el PDF imprime `[pendiente de configurar]` en su lugar y añade un aviso: nadie
    puede confundir el documento provisional con el definitivo.
  - `QUOTE_CONDITIONS_ES` y `QUOTE_CONDITIONS_EN` son las condiciones legales, **una por línea**. Si
    falta un idioma se imprimen las del idioma por defecto y el aviso de pendiente lo refleja.
  - `RESEND_API_KEY` es un secreto: se marca como _Sensitive_ en Vercel y solo lo usa el adaptador de
    Resend en servidor.
- `ADMIN_API_TOKEN` es la credencial **opcional** de automatización del API del panel: se envía como
  `Authorization: Bearer …` y se marca como _Sensitive_ en Vercel. **No es exigible**: el propietario
  entra con la sesión de abajo y el API de administración acepta cualquiera de las dos credenciales
  ([ADR-0024](adr/0024-autenticacion-panel-sesion-firmada.md) §7). Solo si **ninguna** de las dos está
  configurada los endpoints de administración responden `503` `ADMIN_API_DISABLED` y no quedan
  accesibles (guarda de CIF-9/CIF-14, ver [api.md](api.md)). `scripts/despliegue-preflight.sh` **no**
  lo exige: comprueba `DATABASE_URL` y la sesión del panel, por nombre exacto de clave y nunca por
  subcadena, así que un `ADMIN_API_TOKEN_LEGACY` no cuela (CIF-123 y CIF-129).
- `ADMIN_SESSION_SECRET` y `ADMIN_PANEL_PASSWORD` son la **sesión de la interfaz del panel**
  ([ADR-0024](adr/0024-autenticacion-panel-sesion-firmada.md)): con ellas, `/[locale]/acceso` canjea
  la credencial del propietario por una cookie `admin_session` firmada (HttpOnly, `SameSite=Lax`,
  `Secure` sobre HTTPS, 8 h) y `/[locale]/admin/**` deja de redirigir al acceso. Se marcan como
  _Sensitive_ en Vercel. **Falla cerrado**: si falta cualquiera de las dos, o el secreto mide menos de
  32 caracteres o la credencial menos de 16, no se emite sesión (`503 ADMIN_ACCESS_DISABLED`), el
  panel queda denegado y el sitio público sigue funcionando. El MVP tiene un **único propietario**:
  no hay usuarios ni roles.
- **Rotación:** cambiar `ADMIN_PANEL_PASSWORD` o `ADMIN_SESSION_SECRET` invalida en el acto todas las
  sesiones abiertas (la clave de firma se deriva de ambas). El cierre de sesión del navegador borra la
  cookie; una copia de esa cookie seguiría siendo válida hasta su caducidad, así que ante una sospecha
  se rota ([ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md)).
- `.env.example` solo contiene valores de ejemplo sin credenciales y sirve de plantilla local.

### 1.1 Estado real del inventario (2026-09-12)

Inventario de _Production_ y _Preview_ del proyecto `presupuesto-cifuentes` leído de la API de Vercel
(metadatos, nunca valores):

| Entorno       | Claves definidas                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| _Production_  | `DATABASE_URL` (Sensitive), `NEXT_PUBLIC_SITE_URL`, `ADMIN_SESSION_SECRET` (Sensitive), `ADMIN_PANEL_PASSWORD` (Sensitive) |
| _Preview_     | `DATABASE_URL` (Sensitive)                                                                                                 |
| _Development_ | ninguna (las credenciales locales viven en `.env.local`)                                                                   |

No queda ninguna variable exigible pendiente de inyectar en _Production_. `ADMIN_SESSION_SECRET` y
`ADMIN_PANEL_PASSWORD` se inyectaron como _Sensitive_ el 2026-09-12 (CIF-245) y ya están activas; no
se han inyectado en _Preview_ porque no hay consumidor de la sesión ahí y la base de preview es
desechable. `ADMIN_API_TOKEN` **no se despliega**: es la credencial opcional de automatización y el
propietario entra con la sesión (CIF-123).

`ADMIN_PANEL_ENABLED` no está definida en ningún entorno y es lo correcto: en _Production_ el shell
del panel queda **cerrado por defecto** (con sesión válida, `/[locale]/admin/**` responde `404`) y
solo se sirve si el propietario decide activar el interruptor. `CATALOG_DEMO_MODE` tampoco está
definida: su valor por defecto es `false`, que es el único válido en _Production_ (el preflight marca
`PENDIENTE` si se activa).

**Una variable definida en Vercel no está en vigor hasta el siguiente despliegue de _Production_**
(regla 1 de §2). La sesión ya está activa: el despliegue de producción es `main@9cc3efc`
(`dpl_5u1AgZ3ZthpW1NQ8ARsb997nzrvn`, READY desde el 2026-09-12), así que las rutas del panel están
servidas. Verificación del 2026-09-12: `GET /es/acceso` responde `200`, `GET /es/admin` redirige `307`
a `/es/acceso` y `POST /api/admin/session` con credencial incorrecta responde `401` (CIF-248).

El valor de `ADMIN_PANEL_PASSWORD` se propuso al consejo en el gestor de secretos (ADR-0014) para que
el propietario pueda **leerlo**; la propuesta sigue pendiente de aprobación. Nunca se escribe aquí.

`ADMIN_API_TOKEN` **no está definida en ningún entorno y no hace falta que lo esté**: el API del
panel no responde `503` porque la sesión del propietario sí está configurada. Verificación del
2026-09-12 en producción: `POST /api/admin/tariff-versions/<id>/publish` sin credencial responde
`401` (no `503`), que es la señal de que la guarda decide en lugar de rendirse por falta de
configuración; el cierre del hallazgo de CIF-123 es este. Si algún día la automatización necesita el
token, se define **solo en _Production_** y su valor se propone al consejo por el gestor de secretos
(ADR-0014); nunca se escribe aquí. Los dos valores propuestos en CIF-123 (`panel/admin-api-token` y
su binding) se retiraron al quedar sin consumidor.

## 2. Reglas

1. **Los valores viven en Vercel**, separados por entorno (_Production_, _Preview_, _Development_).
   Un cambio en Vercel no entra en vigor hasta el siguiente despliegue
   ([despliegue.md](despliegue.md), apartado 5.3).
2. `.env` y `.env.*` están en `.gitignore`; solo se versiona `.env.example`.
3. Prohibido pegar valores en PRs, tareas de Paperclip, ADRs, capturas o logs.
4. Los secretos de CI **no existen**: el job `calidad` usa un `postgres:17` efímero del propio
   runner (autenticación `trust`, solo `localhost`, base `cifuentes_test`) cuya `TEST_DATABASE_URL` es
   un valor de test sin credenciales reales; el job `e2e` no usa base de datos. Si un job necesitara
   un secreto de verdad, se añade como _secret_ de GitHub Actions, nunca como valor en claro.
5. **Rotación:** si un valor se filtra (aparece en un log, en una captura, en un comentario o en un
   ticket) se considera comprometido y se rota en su origen (GitHub / Vercel / Neon), en el orden del
   apartado 5.5 y de [ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md). Las credenciales de
   larga duración se rotan además cada ≤ 90 días. El incidente se anota sin reproducir el valor.
6. **Mínimo privilegio:** las credenciales de Neon que se inyectan en Vercel son las de la base de
   datos de la aplicación, no las de administración del proyecto. Las de administración (y los
   tokens de GitHub/Vercel) no están en Vercel: se usan solo desde el puesto de trabajo.
7. **Herramientas que inspeccionan secretos:** solo pueden imprimir la regla, la ruta, la línea y el
   recuento; **nunca** el valor, el texto coincidente ni el patrón expandido. Nada de `echo`,
   `printf` o `set -x` sobre variables con credenciales, ni `curl -v`/`-i` con cabeceras de
   autorización ([ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md)). El barrido canónico es
   `scripts/secret-scan.sh`, con su test `scripts/secret-scan.test.sh`; el CI los ejecuta en la
   puerta `calidad`.

## 3. Cómo añadir una variable nueva

1. Añádela al esquema Zod de `src/config/env.ts` (con valor por defecto o `.optional()` si puede
   faltar) y al inventario de la tabla de arriba.
2. Defínela en Vercel en **todos** los entornos donde aplique (_Production_, _Preview_,
   _Development_) — `scripts/vercel-bootstrap.sh` sincroniza una lista local. Si el valor debe ser
   **distinto** en cada entorno, no la declares con el nombre común: usa el sufijo por entorno
   (`NOMBRE__PRODUCTION`, `NOMBRE__PREVIEW`, `NOMBRE__DEVELOPMENT`) y el script la inyecta con el
   nombre común solo en su entorno. `DATABASE_URL` es el caso obligatorio
   ([ADR-0015](adr/0015-base-de-datos-de-produccion.md) §4): sin sufijo el script aborta.
3. Actualiza `.env.example` si un desarrollador la necesita en local.
4. Redespliega para que surta efecto y comprueba `/api/health`.

## 4. Credenciales de la puesta en marcha inicial

Estas credenciales **no van a Vercel**: son de operación y las aporta el propietario (CIF-14).

| Credencial                            | Para qué                                 | Dónde vive                             |
| ------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Token de GitHub (`repo` + `workflow`) | Crear el repositorio y proteger `main`   | Secreto `github/devops-token`          |
| Token de Vercel                       | Enlazar el proyecto e inyectar variables | Secreto `vercel/devops-token`          |
| Cadena de conexión de Neon            | Migraciones y restauración               | Secreto `neon/production-database-url` |

Se usan como variables de entorno del proceso (`GITHUB_DEVOPS_TOKEN`, `VERCEL_DEVOPS_TOKEN`,
`NEON_PRODUCTION_DATABASE_URL`) y **nunca** se pasan como argumento en claro ni se imprimen. Los
scripts aceptan también los nombres cortos `GH_TOKEN`, `VERCEL_TOKEN` y `PRODUCTION_DATABASE_URL`
(útil en el puesto de trabajo, con `gh auth login` / `vercel login`).

El alcance `workflow` del token de GitHub **no es opcional**: sin él, GitHub rechaza el push entero
que contenga cambios en `.github/workflows/`, con un mensaje que no menciona el alcance. Un PAT
clásico con solo `repo` sirve para leer y proteger `main`, pero no para subir el CI.

## 5. Entrega de credenciales al agente (Paperclip Secrets)

Las credenciales de operación **no se pegan** en un comentario de incidencia, en el chat de un run, en
un PR, en un documento ni en una captura. El canal soportado es el gestor de secretos de Paperclip: el
propietario escribe el valor una sola vez en la interfaz, queda cifrado y el agente solo ve metadatos.

### 5.1 Nombres acordados

| Secreto en Paperclip           | `configPath` del binding           | Variable de proceso            |
| ------------------------------ | ---------------------------------- | ------------------------------ |
| `github/devops-token`          | `env.GITHUB_DEVOPS_TOKEN`          | `GITHUB_DEVOPS_TOKEN`          |
| `vercel/devops-token`          | `env.VERCEL_DEVOPS_TOKEN`          | `VERCEL_DEVOPS_TOKEN`          |
| `neon/production-database-url` | `env.NEON_PRODUCTION_DATABASE_URL` | `NEON_PRODUCTION_DATABASE_URL` |

Esta es la configuración **real** en uso (comprobada con `scripts/despliegue-preflight.sh`). La
variante `access.<alias>` sigue siendo válida y preferible para lo que se usa poco; si se cambia, hay
que actualizar esta tabla y los scripts, que resuelven el nombre corto y el inyectado.

### 5.2 Alta del secreto

1. Interfaz de Paperclip → **Company settings → Secrets** (`/company/settings/secrets`).
2. _Create secret_ con el nombre de la tabla y el valor. El valor no se vuelve a mostrar.
3. En el secreto, añadir un binding al agente **DevOps** con el `configPath` de la tabla.

Modos de entrega:

- `env.<KEY>`: el valor se inyecta en el entorno de cada run del agente. Cómodo para tokens que se
  usan en todos los runs.
- `access.<alias>`: no se inyecta; el agente pide el valor puntualmente con
  `POST /api/agents/me/secrets/<alias>/value` (lectura auditada). Preferido para lo que se usa poco,
  como la cadena de Neon.

### 5.3 Alcance mínimo

- **GitHub:** PAT _fine-grained_ limitado a la organización o al repositorio del proyecto, con
  `contents:write`, `pull_requests:write`, `workflows:write`, `administration:write` (protección de
  rama) y `metadata:read`; caducidad ≤ 90 días. En un PAT clásico, `workflow` **y** `repo`.
- **Vercel:** token de equipo, no personal, con acceso solo al equipo del proyecto.
- **Neon:** cadena de conexión del rol de aplicación para `DATABASE_URL` y, aparte, credencial de
  administración del proyecto para crear ramas y restaurar.

### 5.4 Comprobación desde el agente

```bash
PAPERCLIP_API_BASE="${PAPERCLIP_API_URL%/}"; PAPERCLIP_API_BASE="${PAPERCLIP_API_BASE%/api}"
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_BASE/api/agents/me/secrets"
```

Devuelve solo metadatos (nombre, alias, versión y modo de entrega); nunca el valor.

### 5.5 Rotación

Un valor que aparece en un log, una captura, un comentario o un transcript de run se considera
filtrado: se rota en su origen (GitHub / Vercel / Neon), se actualiza el secreto en Paperclip y se
anota el incidente **sin** reproducir el valor. Orden obligatorio ([ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md)):

1. **Emitir** la credencial nueva en el proveedor. Los agentes no pueden crear ni actualizar secretos
   de empresa; si un agente tiene la credencial vieja en su entorno, puede emitir la nueva por API y
   entregarla con `POST /api/agents/me/secret-proposals` (el valor nunca se imprime ni se pega en un
   comentario), donde queda pendiente de aprobación del consejo.
2. **Registrar** el valor nuevo: interfaz de Paperclip → **Company settings → Secrets** → _Create
   secret_ (o aprobar la propuesta del agente) y actualizar el binding del agente DevOps según la
   tabla 5.1. El valor nuevo no se vuelve a mostrar.
3. **Verificar** con el valor nuevo: `scripts/despliegue-preflight.sh` (no imprime valores) y un
   despliegue de comprobación.
4. **Revocar** la credencial vieja en el proveedor.
5. **Verificar** que la vieja ya no sirve (con el token viejo, una llamada de lectura debe devolver 401) y anotar el incidente en la tarea, sin el valor. Sin este paso la rotación no está cerrada.
6. **Comprobar** que el valor viejo no quedó en el repositorio ni en su historial:

   ```bash
   printf '%s\n' "$VALOR_VIEJO" | scripts/secret-scan.sh --no-patterns --values-stdin --history
   ```

Los `PAPERCLIP_API_KEY` son JWT **por run**: caducan con el run y no se rotan a mano (ADR-0014).

### 5.6 Comprobación periódica

```bash
scripts/despliegue-preflight.sh
```

Informe de solo lectura (usuario del token, alcances, repositorio, protección de `main`, proyecto de
Vercel, variables por entorno y accesibilidad de la base de datos). No imprime valores y devuelve 1
si queda algo pendiente: es la primera parada cuando el despliegue no arranca. Exige
`DATABASE_URL` y `ADMIN_SESSION_SECRET` y `ADMIN_PANEL_PASSWORD` en _Production_, **por nombre exacto
de clave y nunca por subcadena** (sin las dos últimas la sesión del panel falla cerrada,
`/[locale]/admin/**` queda denegado y `POST /api/admin/session` responde `503 ADMIN_ACCESS_DISABLED`,
CIF-241). `ADMIN_API_TOKEN` no se exige: es la credencial opcional de automatización (CIF-123).
Además, con el inventario de _Production_ delante, marca `PENDIENTE` si `CATALOG_DEMO_MODE` está
activa (el catálogo en memoria sustituye a los datos reales y la guarda de ADR-0023 §5 deja de cerrar
el shell del panel) e informa del estado de `ADMIN_PANEL_ENABLED` (cerrado por defecto, abierto solo
si el propietario lo activa).
