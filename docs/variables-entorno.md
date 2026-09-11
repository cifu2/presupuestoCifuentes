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

| Credencial                               | Para qué                                 | Dónde vive                        |
| ---------------------------------------- | ---------------------------------------- | --------------------------------- |
| Token de GitHub con `repo` + `admin:org` | Crear el repositorio y proteger `main`   | Gestor de secretos del operador   |
| Token de Vercel                          | Enlazar el proyecto e inyectar variables | Gestor de secretos del operador   |
| Cadena de conexión de Neon               | Migraciones y restauración               | Gestor de secretos / `.env.local` |

Se usan como variables de entorno del proceso (`GH_TOKEN`, `VERCEL_TOKEN`, `PRODUCTION_DATABASE_URL`)
y **nunca** se pasan como argumento en claro ni se imprimen.
