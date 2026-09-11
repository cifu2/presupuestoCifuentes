# Despliegue, release y rollback

Procedimiento operativo de entornos y despliegue del MVP. Vercel despliega desde GitHub y GitHub
Actions solo ejecuta la puerta de calidad: no hay dos pipelines compitiendo y no hay Docker ni
servidores propios en ningún entorno ([ADR-0007](adr/0007-despliegue-vercel-github.md),
[ADR-0006](adr/0006-calidad-y-ci.md)).

> Este documento es el procedimiento exigido por CIF-11 y por la fila «Infraestructura / DevOps» de
> la [Definition of Done](definition-of-done.md).

## 1. Entornos

| Entorno        | Disparador        | URL                                       | Base de datos                 | Variables de Vercel |
| -------------- | ----------------- | ----------------------------------------- | ----------------------------- | ------------------- |
| **Producción** | push a `main`     | dominio de producción (pendiente de DNS)  | rama `production` de Neon     | _Production_        |
| **Preview**    | cada PR abierto   | URL del deployment (comentada por Vercel) | rama de base de datos por PR  | _Preview_           |
| **Desarrollo** | local, `pnpm dev` | `http://localhost:3000`                   | PostgreSQL local o rama `dev` | `.env.local`        |

- Cada PR recibe **un deployment de vista previa** con su propia URL, enlazada automáticamente en el
  PR por la integración de Vercel con GitHub.
- Producción **solo** se despliega desde `main`. Ninguna rama de feature despliega a producción.
- Las variables de cada entorno viven en Vercel, nunca en el repositorio: inventario en
  [variables-entorno.md](variables-entorno.md).
- Las URLs de vista previa no contienen datos reales de clientes: la base de datos de preview es una
  rama desechable, no una copia de producción.
- **Protección de despliegue desactivada** (2026-09-11): Vercel traía activada la autenticación SSO
  para todos los despliegues, lo que dejaba el configurador público y las URLs de preview detrás de
  un login. Se desactiva a propósito para que el cliente pueda ver producción y QA pueda validar los
  flujos del PR sin cuenta de Vercel; es asumible porque el preview no toca datos reales.

## 2. Cómo se despliega

1. La **integración nativa Vercel ↔ GitHub** es la única vía de despliegue. GitHub Actions **no**
   despliega y no guarda credenciales de Vercel.
2. `main` está **protegida** (verificado el 2026-09-11): no se admite push directo (`enforce_admins`
   incluido), solo fusión por PR con los checks requeridos `calidad` y `e2e` en verde, la conversación
   resuelta y sin force push ni borrado de rama. La revisión de otro agente que exige la
   [Definition of Done](definition-of-done.md) se registra en la incidencia de Paperclip: GitHub no
   permite exigirla mientras el autor del PR y el dueño del token sean la misma cuenta de GitHub.
   Cuando exista un segundo colaborador, se vuelve a activar `required_pull_request_reviews`.
3. La configuración del proyecto de Vercel (framework Next.js, `pnpm build`, Node de `.nvmrc`) se
   detecta sola; no hace falta `vercel.json`. Si en el futuro hiciera falta configuración, se
   versiona en el repositorio.

### Flujo de un cambio

1. Rama de feature desde `main` (`feat/...`, `fix/...`, `docs/...`).
2. PR contra `main` con la plantilla `.github/pull_request_template.md`.
3. Vercel publica el **preview** del PR y comenta la URL; el CI arranca `calidad` y `e2e`.
4. Revisión de otro agente distinto del autor. QA valida el flujo en la URL de preview.
5. Con CI en verde y aprobación, se fusiona a `main`.
6. Vercel despliega **producción** desde `main` automáticamente.
7. Si el merge incluye migración de esquema, se ejecuta el paso de migración del apartado 3 y se
   comprueba `/api/health` en producción.

## 3. Migraciones de base de datos

- **Regla expand/contract:** una migración que se aplica junto a un despliegue debe ser **compatible
  hacia atrás** (añadir tabla o columna anulable, nunca borrar o renombrar en el mismo release). El
  borrado de lo antiguo se hace en un release posterior, cuando ya no queda código que lo use. Así el
  rollback de la aplicación sigue siendo posible.
- **Nunca se ejecutan migraciones automáticamente desde un PR** (ADR-0007): el preview de un PR
  apunta a su propia rama de base de datos y las migraciones se aplican ahí solo si el PR las
  necesita.
- **Paso explícito de release**, con `scripts/release.sh` o a mano, justo después de fusionar a
  `main` y antes de dar el release por bueno:

  ```bash
  PRODUCTION_DATABASE_URL='...' pnpm prisma migrate deploy
  ```

  La URL de producción se toma del gestor de secretos o de `.env.local` (no versionado); nunca se
  escribe en un comando compartido, en un comentario ni en una captura.

- Toda migración se versiona en `prisma/migrations` y se revisa en el PR (Definition of Done,
  apartado _Datos_).

## 4. Release

- **Unidad de release:** la fusión a `main`. Vercel despliega producción en cuanto `main` avanza.
- **Marcado (opcional pero recomendado en hitos):** etiqueta anotada sobre `main`
  (`git tag -a v0.2.0 -m "..."` y `git push origin v0.2.0`).
- **Comprobación post-release:**

  ```bash
  curl -fsS https://<dominio-produccion>/api/health
  ```

  Debe devolver `{"status":"ok", ...}` con `database: "configured"` en producción.

- **Ventana de vigilancia:** los 15 minutos siguientes al release se revisan los despliegues de
  Vercel, el endpoint de salud y los avisos de Neon (ver [operacion.md](operacion.md)). Si algo falla,
  se aplica el apartado 5.

## 5. Rollback

El rollback de la **aplicación** es inmediato y no reconstruye nada: se promueve a producción un
deployment anterior que ya está construido.

### 5.1 Rollback de la aplicación

```bash
# 1. Localiza el último deployment bueno de producción
vercel ls --prod

# 2. Promociónalo a producción (instantáneo, sin build)
vercel promote <url-o-id-del-deployment>

# Alternativa sin CLI: panel de Vercel → Deployments → «Promote to Production»
```

`vercel rollback` hace lo mismo tomando el deployment inmediatamente anterior. Tras el rollback:

1. Comprueba `/api/health` en producción.
2. Abre el PR que revierta en `main` el cambio causante (`git revert <sha>`), para que el estado del
   repositorio y el de producción vuelvan a coincidir. **No dejes producción en un deployment que no
   corresponde a `main`.**
3. Deja constancia en la tarea de Paperclip y, si afecta a usuarios, avisa al CTO.

### 5.2 Rollback de esquema

Las migraciones de Prisma son **hacia adelante**: no hay «deshacer» automático. Si el problema está
en los datos o el esquema:

- Escribe una **migración compensatoria** en un PR nuevo (con su test) y aplícala con el mismo paso
  explícito del apartado 3.
- Si la pérdida es grave, restaura desde una **rama/point-in-time de Neon** (ver
  [operacion.md](operacion.md), apartado _Backups_). Es la última opción: pierde los datos escritos
  desde el punto de restauración, así que requiere decisión del CTO.

### 5.3 Rollback de variables de entorno

Cambiar una variable en Vercel **no afecta a los despliegues ya construidos**: hay que
**redesplegar** para que surta efecto (`vercel redeploy <url>` o «Redeploy» en el panel). Si una
variable rompió producción, corrígela en Vercel y redespliega; si el valor anterior es el correcto,
restáuralo antes de redesplegar.

### 5.4 Cuándo usar cada uno

| Síntoma                                    | Acción                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| La aplicación falla tras un release        | Promover el deployment anterior (5.1)                |
| Faltan o están mal datos/columnas          | Migración compensatoria; PITR solo si es grave (5.2) |
| Producción falla tras cambiar una variable | Corregir la variable y redesplegar (5.3)             |

## 6. Puesta en marcha inicial (una sola vez)

Paso 0 de cualquier sesión de operación: `scripts/despliegue-preflight.sh`. Es de solo lectura,
comprueba credenciales, repositorio, protección de `main`, proyecto de Vercel, variables y
accesibilidad de la base de datos, no imprime ningún valor y devuelve 1 si queda algo pendiente.

### 6.1 Estado a 2026-09-11 (CIF-11)

Estado verificado el 2026-09-11 con `scripts/despliegue-preflight.sh` (informe de solo lectura):

| Paso                            | Estado    | Detalle                                                                                                                                                                                                          |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Credenciales                 | Hecho     | Los tres secretos se inyectan en el entorno del agente y responden: el token de GitHub anuncia los alcances `repo` y `workflow` ([variables-entorno.md](variables-entorno.md), 5)                                |
| 2. Repositorio remoto           | Hecho     | `cifu2/presupuestoCifuentes`, **público** por decisión del propietario; `main` subida con el CI y la protección                                                                                                  |
| 3. Protección de `main`         | Hecho     | Sin push directo: `calidad (formato · lint · tipos · unitarios)` y `e2e (puerta obligatoria)` requeridos y estrictos, conversación resuelta, sin force push, `enforce_admins` (apartado 2)                       |
| 4. Proyecto de Vercel           | Hecho     | `presupuesto-cifuentes` (`prj_7hKfqaoBcQVsn5xk4cfkrXFHUUOb`), framework Next.js, con `DATABASE_URL` (sensible) y `NEXT_PUBLIC_SITE_URL` en _Production_                                                          |
| 5. Integración Git de Vercel    | Hecho     | Proyecto enlazado al repositorio: hay preview por PR y producción desde `main`                                                                                                                                   |
| 6. Base de datos                | Hecho     | Base `presupuesto_preview` creada en el mismo proyecto de Neon y migrada (`prisma migrate deploy`), asignada a _Preview_ en Vercel; sigue pendiente el rol de aplicación con menos privilegios y una rama por PR |
| 7. Primer despliegue y rollback | Parcial   | Producción y preview desplegadas y comprobadas con `/api/health` (PR #1); falta el ensayo real de rollback (apartado 5.1), que necesita dos despliegues de producción                                            |
| 8. Dominio                      | Pendiente | Depende de la decisión de dominio (CIF-14); hasta entonces `NEXT_PUBLIC_SITE_URL` apunta al dominio `*.vercel.app`                                                                                               |

Decisión del propietario (2026-09-11): el repositorio se queda **público** por ahora. La otra decisión
abierta es el rol de aplicación de Neon frente al rol propietario.

### 6.2 Orden exacto de los pasos

1. **Credenciales.** GitHub (organización/usuario y nombre del repositorio), Vercel (equipo) y Neon
   (proyecto). Se guardan como secretos; este repositorio nunca las contiene.
2. **Repositorio remoto y protección de `main`:**

   ```bash
   scripts/github-bootstrap.sh <org>/<repo>
   ```

   Crea el repositorio, sube `main` y aplica la protección con `calidad` y `e2e` como checks
   requeridos.

3. **Proyecto de Vercel y variables:** `scripts/vercel-bootstrap.sh` enlaza el proyecto con el
   repositorio e inyecta las variables de [variables-entorno.md](variables-entorno.md) en los
   entornos _Production_, _Preview_ y _Development_.
4. **Base de datos:** proyecto en Neon con ramas `production` y `preview` + integración con Vercel
   ([ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md)).
5. **Primer despliegue:** fusionar un PR trivial y comprobar preview, producción, `/api/health` y el
   rollback del apartado 5.1 (probarlo de verdad, no darlo por supuesto).
6. **Dominio:** apuntar el dominio de puertascifuentes.com en Vercel y verificar HTTPS.

## 7. Referencias

- [Variables de entorno y secretos](variables-entorno.md)
- [Base de datos, backups y monitorización](operacion.md)
- [ADR-0007 — Despliegue en Vercel con el código en GitHub](adr/0007-despliegue-vercel-github.md)
- [ADR-0006 — Calidad: tests, cobertura y puerta de E2E en CI](adr/0006-calidad-y-ci.md)
