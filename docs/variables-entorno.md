# Variables de entorno y secretos

Inventario de la configuración por entorno del MVP. **Ningún valor real se escribe en el
repositorio, ni en documentación, ni en comentarios, ni en capturas** (ADR-0007 y Definition of Done,
apartado _Seguridad_).

## 1. Inventario

| Variable               | Producción                     | Preview                          | Desarrollo local            | Se define en                                 |
| ---------------------- | ------------------------------ | -------------------------------- | --------------------------- | -------------------------------------------- |
| `DATABASE_URL`         | Neon, rama `production`        | Neon, base `presupuesto_preview` | PostgreSQL local o rama dev | Vercel (Production / Preview) y `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | `https://<dominio-produccion>` | URL del deployment de preview    | `http://localhost:3000`     | Vercel (Production / Preview) y `.env.local` |
| `CATALOG_DEMO_MODE`    | `false`                        | `false`                          | `false`                     | Vercel (opcional) y `.env.local`             |
| `QUOTE_VALIDITY_DAYS`  | `30`                           | `30`                             | `30`                        | Vercel (opcional) y `.env.local`             |
| `ADMIN_API_TOKEN`      | valor propio del despliegue    | no definida                      | valor de desarrollo         | Vercel (Production) y `.env.local`           |
| `NODE_ENV`             | lo fija Vercel (`production`)  | lo fija Vercel (`production`)    | lo fija Next.js             | No se configura a mano                       |
| `VERCEL_ENV`           | lo fija Vercel (`production`)  | lo fija Vercel (`preview`)       | no definida                 | No se configura a mano                       |

- El esquema de validación está en `src/config/env.ts` (Zod). `DATABASE_URL` y
  `NEXT_PUBLIC_SITE_URL` son opcionales en el esquema para que el esqueleto arranque sin base de
  datos; en producción **deben** estar definidas y `/api/health` lo refleja
  (`database: "configured"`).
- `/api/health` informa `environment` con `VERCEL_ENV ?? NODE_ENV`: en Vercel distingue `production`
  de `preview` (dentro de Vercel, `NODE_ENV` es `production` en ambos), y fuera de Vercel cae en
  `NODE_ENV`.
- `CATALOG_DEMO_MODE` se interpreta como booleano **textual** (`"true"`/`"false"`, y sus
  variantes `1`/`0`, `yes`/`no`, `on`/`off`); un valor ambiguo falla al arrancar en lugar de
  activar el modo demo en silencio. `z.coerce.boolean()` no vale porque `Boolean("false")` es
  `true` (CIF-74).
- `NEXT_PUBLIC_SITE_URL` es pública por diseño (viaja al navegador). `DATABASE_URL` es un secreto: se
  marca como _Sensitive_ en Vercel y no se lee nunca desde el cliente.
- `ADMIN_API_TOKEN` es un secreto del API del panel: se envía como `Authorization: Bearer …` y se
  marca como _Sensitive_ en Vercel. Mientras no esté configurado, los endpoints de administración
  responden `503` y no quedan accesibles (guarda provisional de CIF-9/CIF-14, ver
  [api.md](api.md)). `scripts/despliegue-preflight.sh` marca `PENDIENTE` si falta en _Production_, y
  `scripts/despliegue-preflight.test.sh` prueba ese aviso: la falta se detecta en la comprobación
  periódica, no abriendo el panel (CIF-123).
- `.env.example` solo contiene valores de ejemplo sin credenciales y sirve de plantilla local.

### 1.1 Estado real del inventario (2026-09-12)

Inventario de _Production_ y _Preview_ del proyecto `presupuesto-cifuentes` leído de la API de Vercel
(metadatos, nunca valores):

| Entorno       | Claves definidas                                         |
| ------------- | -------------------------------------------------------- |
| _Production_  | `DATABASE_URL` (Sensitive), `NEXT_PUBLIC_SITE_URL`       |
| _Preview_     | `DATABASE_URL` (Sensitive)                               |
| _Development_ | ninguna (las credenciales locales viven en `.env.local`) |

`ADMIN_API_TOKEN` **no está definida en ningún entorno**, así que el API del panel responde `503`
(`ADMIN_API_DISABLED`) en producción. La decisión es definirla **solo en _Production_** por ahora: el
panel de administración todavía no tiene consumidor en _Preview_ (CIF-9) y una base de preview
desechable no debe compartir el token de producción. El valor se emite y se propone al consejo en
CIF-123 (nunca se escribe aquí); cuando se fije, y tras el despliegue que lo active, esta tabla deja
de listar la ausencia y [api.md](api.md) pasa a describir `401` en lugar de `503`.

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
   _Development_) — `scripts/vercel-bootstrap.sh` sincroniza una lista local.
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
si queda algo pendiente: es la primera parada cuando el despliegue no arranca. Además de
`DATABASE_URL`, exige `ADMIN_API_TOKEN` en _Production_ (sin ella el API del panel responde `503`,
CIF-123).
