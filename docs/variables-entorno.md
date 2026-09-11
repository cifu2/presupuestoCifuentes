# Variables de entorno y secretos

Inventario de la configuración por entorno del MVP. **Ningún valor real se escribe en el
repositorio, ni en documentación, ni en comentarios, ni en capturas** (ADR-0007 y Definition of Done,
apartado _Seguridad_).

## 1. Inventario

| Variable               | Producción                     | Preview                       | Desarrollo local            | Se define en                                 |
| ---------------------- | ------------------------------ | ----------------------------- | --------------------------- | -------------------------------------------- |
| `DATABASE_URL`         | Neon, rama `production`        | Neon, rama de preview del PR  | PostgreSQL local o rama dev | Vercel (Production / Preview) y `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | `https://<dominio-produccion>` | URL del deployment de preview | `http://localhost:3000`     | Vercel (Production / Preview) y `.env.local` |
| `NODE_ENV`             | lo fija Vercel (`production`)  | lo fija Vercel (`production`) | lo fija Next.js             | No se configura a mano                       |

- El esquema de validación está en `src/config/env.ts` (Zod). `DATABASE_URL` y
  `NEXT_PUBLIC_SITE_URL` son opcionales en el esquema para que el esqueleto arranque sin base de
  datos; en producción **deben** estar definidas y `/api/health` lo refleja
  (`database: "configured"`).
- `NEXT_PUBLIC_SITE_URL` es pública por diseño (viaja al navegador). `DATABASE_URL` es un secreto: se
  marca como _Sensitive_ en Vercel y no se lee nunca desde el cliente.
- `.env.example` solo contiene valores de ejemplo sin credenciales y sirve de plantilla local.

## 2. Reglas

1. **Los valores viven en Vercel**, separados por entorno (_Production_, _Preview_, _Development_).
   Un cambio en Vercel no entra en vigor hasta el siguiente despliegue
   ([despliegue.md](despliegue.md), apartado 5.3).
2. `.env` y `.env.*` están en `.gitignore`; solo se versiona `.env.example`.
3. Prohibido pegar valores en PRs, tareas de Paperclip, ADRs, capturas o logs.
4. Los secretos de CI **no existen**: los jobs `calidad` y `e2e` no usan base de datos ni servicios
   externos (el E2E arranca la app en local sin `DATABASE_URL`). Si en el futuro un job necesita un
   secreto, se añade como _secret_ de GitHub Actions, nunca como variable en claro.
5. **Rotación:** si un valor se filtra (aparece en un log, en una captura o en un ticket), se rota en
   su origen (Neon / Vercel) y se actualiza en Vercel; el incidente se anota sin reproducir el valor.
6. **Mínimo privilegio:** las credenciales de Neon que se inyectan en Vercel son las de la base de
   datos de la aplicación, no las de administración del proyecto. Las de administración (y los
   tokens de GitHub/Vercel) no están en Vercel: se usan solo desde el puesto de trabajo.

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

### 5.6 Comprobación periódica

```bash
scripts/despliegue-preflight.sh
```

Informe de solo lectura (usuario del token, alcances, repositorio, protección de `main`, proyecto de
Vercel, variables por entorno y accesibilidad de la base de datos). No imprime valores y devuelve 1
si queda algo pendiente: es la primera parada cuando el despliegue no arranca.

### 5.4 Comprobación desde el agente

```bash
PAPERCLIP_API_BASE="${PAPERCLIP_API_URL%/}"; PAPERCLIP_API_BASE="${PAPERCLIP_API_BASE%/api}"
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$PAPERCLIP_API_BASE/api/agents/me/secrets"
```

Devuelve solo metadatos (nombre, alias, versión y modo de entrega); nunca el valor.

### 5.5 Rotación

Si un valor aparece en un log, una captura, un comentario o un transcript de run, se considera
filtrado: se rota en su origen (GitHub / Vercel / Neon), se actualiza el secreto en Paperclip y se
anota el incidente **sin** reproducir el valor.
