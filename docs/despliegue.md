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
  flujos del PR sin cuenta de Vercel; es asumible porque el preview no toca datos reales. La
  autenticación del panel **no** se delega en esa protección ([ADR-0024](adr/0024-autenticacion-panel-sesion-firmada.md)):
  es por proyecto y por entorno, así que aplicaría también al configurador público; el panel usa su
  propia sesión firmada.

## 2. Cómo se despliega

1. La **integración nativa Vercel ↔ GitHub** es la única vía de despliegue. GitHub Actions **no**
   despliega y no guarda credenciales de Vercel.
2. `main` está **protegida** (verificado el 2026-09-11): no se admite push directo (`enforce_admins`
   incluido), solo fusión por PR con los checks requeridos `calidad` y `e2e` en verde, la conversación
   resuelta y sin force push ni borrado de rama. La revisión de otro agente que exige la
   [Definition of Done](definition-of-done.md) se registra en la incidencia de Paperclip: GitHub no
   permite exigirla mientras el autor del PR y el dueño del token sean la misma cuenta de GitHub.
   Cuando exista un segundo colaborador, se vuelve a activar `required_pull_request_reviews`
   (`REPO_REQUIRED_APPROVALS=1`, apartado 6.2). El método de fusión y la trazabilidad del gate están
   en el apartado siguiente y en [ADR-0021](adr/0021-metodo-de-fusion-y-trazabilidad-squash.md).
3. La configuración del proyecto de Vercel (framework Next.js, `pnpm build`, Node de `.nvmrc`) se
   detecta sola y no se duplica en el repositorio. El `vercel.json` versionado solo declara qué ramas
   **no** generan despliegue (`git.deploymentEnabled`, [ADR-0019](adr/0019-cuota-despliegues-vercel.md)):
   `dependabot/**`, `archive/**` y `docs/**`. Nunca lleva configuración de build y su contenido está
   fijado por `src/config/vercel-config.test.ts`.

### 2.1 Método de fusión y trazabilidad del gate (ADR-0021)

4. **La fusión a `main` es siempre squash**
   ([ADR-0021](adr/0021-metodo-de-fusion-y-trazabilidad-squash.md)): el repositorio tiene
   `allow_squash_merge=true`, `allow_merge_commit=false` y `allow_rebase_merge=false`
   (`scripts/github-bootstrap.sh`, apartado 6.2). Ninguna tarea pide `merge_method=merge` ni rebase;
   si una tarea lo pide, el error es de la tarea, no del ejecutor.
5. **El commit de squash registra el head revisado.** Como el SHA revisado ya **no** será ancestro de
   `main`, su mensaje lleva `Head revisado: <sha40>` y el run de CI. La fusión se acepta solo si,
   sobre el head revisado (`<sha>`):

   ```bash
   git fetch --quiet origin main
   # (a) el árbol fusionado es exactamente el revisado
   test "$(git rev-parse <sha>^{tree})" = "$(git rev-parse origin/main^{tree})"
   # (b) el mensaje del squash referencia el head revisado
   git log -1 --format=%B origin/main | grep -F 'Head revisado: <sha40>'
   ```

   además de `calidad` y `e2e` en verde sobre `<sha>` (pestaña _Checks_ del PR) y de la decisión
   `approved` de la revisión registrada en la tarea de Paperclip. `main` **no se reescribe**: no se
   añaden merge commits de seguimiento para «restaurar» la ancestría de un SHA ya revisado.

6. **Ajustes del repositorio: la restauración no depende de la memoria.** Cambiar temporalmente el
   método de fusión o la protección de `main` requiere autorización explícita del CTO, constancia en
   la tarea y **verificación de la restauración** contra `scripts/github-bootstrap.sh`. La guarda es
   este comando, desde la raíz del repositorio (solo lectura, sin secretos; falla con código 1 si el
   estado vivo diverge del versionado):

   ```bash
   # Fusión: squash-only (scripts/github-bootstrap.sh, apartado 6.2).
   esperado_fusion="$(sed -n 's/.*-F allow_squash_merge=\(true\|false\).*/\1/p;s/.*-F allow_merge_commit=\(true\|false\).*/\1/p;s/.*-F allow_rebase_merge=\(true\|false\).*/\1/p' scripts/github-bootstrap.sh | paste -sd,)"
   vivo_fusion="$(gh api repos/cifu2/presupuestoCifuentes --jq '[.allow_squash_merge,.allow_merge_commit,.allow_rebase_merge]|@csv' | tr -d '"')"
   [ "$vivo_fusion" = "$esperado_fusion" ] || { echo "fusión divergente: vivo=$vivo_fusion versionado=$esperado_fusion"; exit 1; }

   # Protección de main: checks requeridos, strict y enforce_admins.
   esperado_prot="$(sed -n 's/^ *"strict": \(true\|false\).*/\1/p;s/^ *"enforce_admins": \(true\|false\).*/\1/p' scripts/github-bootstrap.sh | paste -sd'|')|$(sed -n 's/^ *"\(calidad[^"]*\|e2e[^"]*\)",\{0,1\}$/\1/p' scripts/github-bootstrap.sh | paste -sd'|')"
   vivo_prot="$(gh api repos/cifu2/presupuestoCifuentes/branches/main/protection --jq '[(.required_status_checks.strict|tostring),(.enforce_admins.enabled|tostring),(.required_status_checks.contexts|sort|join("|"))]|join("|")')"
   [ "$vivo_prot" = "$esperado_prot" ] || { echo "protección divergente: vivo=$vivo_prot versionado=$esperado_prot"; exit 1; }

   echo "ajustes del repositorio acordes a scripts/github-bootstrap.sh"
   ```

   Verificado el 2026-09-12 tras el incidente de CIF-203: los dos bloques salen en verde con
   `allow_merge_commit=false` ya restaurado (`calidad` + `e2e`, `strict` y `enforce_admins` vivos).

7. **Coste de un cambio solo de documentación:** las ramas `docs/**` **no generan preview** de Vercel
   (`git.deploymentEnabled`, [ADR-0019](adr/0019-cuota-despliegues-vercel.md)), así que un PR que solo
   toca `docs/**` y ficheros `*.md` no consume cuota de despliegue. Por eso CIF-209 elige el comando
   de arriba (paso de runbook) en vez de un script con su test: es la guarda más barata que deja la
   restauración comprobada sin abrir una rama con código ni gastar un preview.

### Flujo de un cambio

1. Rama de feature desde `main` (`feat/...`, `fix/...`, `docs/...`). Una rama `docs/**` **no genera
   preview** (apartado 4), así que solo vale para cambios que tocan `docs/**` y ficheros `*.md`: si el
   diff toca código, usa `feat/**`, `fix/**`, `ci/**` o `chore/**` para conservar el preview. Lo
   comprueba `scripts/docs-preview-guard.sh` en el job `calidad`.
2. PR contra `main` con la plantilla `.github/pull_request_template.md`.
3. Vercel publica el **preview** del PR y comenta la URL; el CI arranca `calidad` (formato, sintaxis
   y `shellcheck` de `scripts/`, guardia de contenido de ramas `docs/**`, lint, tipos y unitarios) y
   `e2e`.
4. Revisión de otro agente distinto del autor. QA valida en la URL de preview el **camino público**
   del flujo; los flujos detrás de una credencial de administración se validan en CI, porque esa
   credencial no se despliega en preview ([ADR-0025](adr/0025-validacion-via-envio-por-entorno.md)).
5. Con CI en verde y aprobación, se fusiona a `main` por **squash** (apartado 2.1), con
   `Head revisado: <sha40>` en el mensaje del commit.
6. Vercel despliega **producción** desde `main` automáticamente.
7. Si el merge incluye migración de esquema, se ejecuta el paso de migración del apartado 3 y se
   comprueba `/api/health` en producción.

### Quién publica y cómo se pide un push

El token de escritura de GitHub vive en un único secreto, `github/devops-token`, vinculado **solo** al agente DevOps
([variables-entorno.md](variables-entorno.md) §5.1-5.2; [ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md) §1 y §6). Los demás
agentes no lo tienen y no deben tenerlo: el repositorio es **público** y multiplicar los portadores de un PAT de escritura
multiplica el alcance de una fuga sin cambiar lo que se puede publicar. Por tanto **publicar (push, PR, retarget de base) es
siempre de DevOps**: los demás agentes preparan, verifican y piden el push; no lo ejecutan.

Cómo se pide (el control plane **rechaza** la forma intuitiva):

1. Crea la petición como **issue nueva y sin `parentId`** asignada a DevOps, o comenta en una issue de publicación que DevOps
   ya tenga abierta. **No** la crees como hija de una issue de la cadena de DevOps: el control plane la rechaza con
   `Delegation cycle: <ISSUE> in this chain was created by the agent this child would be assigned to` y la cadena se queda
   parada (pasó en CIF-324 → CIF-320).
2. La petición lleva: rama, sha exacto, confirmación de _fast-forward_ sin `--force`, y la verificación hecha (`merge-tree`
   contra la base, `tsc`, tests). Un push por rama ([ADR-0019](adr/0019-cuota-despliegues-vercel.md) §5).
3. DevOps verifica contra `origin` después del push y responde con el sha publicado y el estado de los PR.

Si el push crea un preview que Vercel rate-limita, el reintento sigue el runbook §4.1 y se anota en la issue de publicación:
un merge a `main` no se da por desplegado hasta que su deployment está `READY` y `/api/health` responde 200.

## 3. Migraciones de base de datos

- **Regla expand/contract:** una migración que se aplica junto a un despliegue debe ser **compatible
  hacia atrás** (añadir tabla o columna anulable, nunca borrar o renombrar en el mismo release). El
  borrado de lo antiguo se hace en un release posterior, cuando ya no queda código que lo use. Así el
  rollback de la aplicación sigue siendo posible.
- **Nunca se ejecutan migraciones automáticamente desde un PR** (ADR-0007): el preview de un PR
  apunta a su propia rama de base de datos y las migraciones se aplican ahí solo si el PR las
  necesita.
- **Extensiones de PostgreSQL:** crear una extensión depende del rol que migra. La migración
  `20260911150000_constraint_solape_tarifas_publicadas` empieza con `CREATE EXTENSION IF NOT EXISTS`
  sobre `btree_gist`, así que el rol de migraciones necesita permiso para crearla. **Prerrequisito
  de permisos:** `btree_gist` es una extensión _trusted_ desde PostgreSQL 13, de modo que basta con
  ser propietario de la base —el rol de administración de Neon, sin ser superusuario—. Si el rol no
  puede crearla, `migrate deploy` falla y PostgreSQL revierte la migración entera (Prisma aplica
  cada migración en una transacción): se para y se eleva el privilegio **antes** de fusionar, nunca
  después. Verificado el 2026-09-12 en la base de preview de Neon (PostgreSQL 18.6, rol no
  superusuario): migración aplicada sin errores.
- **Paso explícito de release**, con `scripts/release.sh` o a mano, justo después de fusionar a
  `main` y antes de dar el release por bueno:

  ```bash
  PRODUCTION_DATABASE_URL='...' pnpm prisma migrate deploy
  ```

  La URL de producción se toma del gestor de secretos o de `.env.local` (no versionado); nunca se
  escribe en un comando compartido, en un comentario ni en una captura.

  `prisma migrate status` termina con código 1 cuando hay migraciones pendientes: es el estado del
  que parte un release y no un error. `scripts/release.sh` lo informa y deja que sea
  `migrate deploy` quien decida si algo está mal, para que el paso no se aborte justo cuando tiene
  trabajo que hacer (`scripts/release.test.sh`, que corre en `calidad`).

- Toda migración se versiona en `prisma/migrations` y se revisa en el PR (Definition of Done,
  apartado _Datos_).

### 3.1 Catálogo de demostración en la base de preview (CIF-330)

- La base de preview arranca **vacía**, así que el configurador muestra «todavía no hay ninguna serie
  publicada» y QA no puede ejercer ningún flujo que emita presupuesto (ni el PDF ni la entrega).
- `CATALOG_DEMO_MODE=true` en el entorno _Preview_ de Vercel **no resuelve el caso**: el catálogo de
  demostración vive en memoria del proceso y cada ruta es una función distinta, de modo que el
  presupuesto emitido por `POST /api/quotes` no lo ve `GET /api/quotes/:ref/pdf`. La variable sigue
  siendo para desarrollo y E2E locales.
- El paso es un seed de datos **inventados** (los mismos de
  `src/infrastructure/demo/demo-catalog.ts`: cuatro series, tres tarifas publicadas y sus textos en
  español e inglés). No son tarifas comerciales ni datos de clientes:

  ```bash
  PREVIEW_DATABASE_URL='postgresql://…/presupuesto_preview' scripts/seed-preview-catalogo.sh
  ```

  La guarda de destino aborta con código 78 si el nombre de la base no contiene «preview» o si
  menciona producción, y el script es idempotente: se puede repetir sin borrar los presupuestos que
  QA haya emitido. `scripts/seed-preview-catalogo.test.sh` corre en el job `calidad`.

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

### 4.1 Cuota de despliegues del plan gratuito de Vercel

El plan gratuito permite **100 despliegues cada 24 h** por cuenta (`api-deployments-free-per-day`) y la
ventana es **rodante**, no de día natural. Cuando se agota, Vercel no encola el despliegue y el check
`Vercel` del commit queda en `failure` con `Deployment rate limited — retry in 24 hours`. Medido el
2026-09-12 (CIF-149): 111 despliegues en 24 h, `remaining: 0`; a las 00:56Z el límite bloqueaba y a
las 01:01Z ya había un hueco. La decisión de fondo está en
[ADR-0019](adr/0019-cuota-despliegues-vercel.md).

**Runbook: un merge a `main` se quedó sin despliegue de producción**

1. **Confirmar que es cuota y no un fallo de build.** El check `Vercel` del commit (o la API) nombra
   `api-deployments-free-per-day`; cualquier otro mensaje es un fallo de build normal y se trata como
   tal.
2. **Reintentar pasados unos minutos, sin tocar nada más.** La ventana es rodante: el hueco reaparece
   solo, no hace falta esperar 24 h.
3. **Relanzar el despliegue de producción del commit que está en `main`** (API de Vercel o panel →
   «Redeploy» de ese commit). No se despliega otra rama ni otro commit para «dar el release por bueno».
4. **Verificar el release antes de cerrarlo:** el deployment queda `READY` y
   `curl -fsS https://<dominio-produccion>/api/health` responde `200` con `status: "ok"`. Mientras eso
   no ocurra, producción no corresponde a `main`.
5. **Anotar en la tarea de Paperclip** la hora, el commit, el resultado y si hubo que reintentar. Si el
   reintento vuelve a fallar, DevOps lo escala al CEO con el consumo medido (ADR-0019, punto 6).

**Reglas de consumo** ([ADR-0019](adr/0019-cuota-despliegues-vercel.md)): un push crea un preview, así
que los cambios de una rama se agrupan y se empujan cuando están listos para revisión, no en cada
iteración; no se relanza un despliegue si el del mismo commit ya está en cola o listo; y las ramas
`dependabot/**`, `archive/**` y `docs/**` no generan preview (`git.deploymentEnabled` en
`vercel.json`). `docs/**` solo puede prescindir de él porque `scripts/docs-preview-guard.sh` (job
`calidad`) falla si su diff sale de `docs/**` y `**/*.md`; el resto de ramas con código conservan su
preview, que es donde QA valida el PR.

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

#### Revertir un cambio que acopla código y esquema

Un despliegue puede traer **código y esquema en el mismo commit**: la migración
`20260911150000_constraint_solape_tarifas_publicadas` crea la restricción de exclusión
`tariff_version_published_no_overlap` y el traductor de su error (`SQLSTATE 23P01` → `409`) entra
con ella. Si se revierte uno y no el otro, el código y el esquema dejan de coincidir: con la
restricción en pie y el traductor fuera, el camino de carrera de publicación responde `500` en vez
de `409`.

Al revertir, **primero la aplicación y después los datos**:

1. **Aplicación:** promueve el deployment anterior (apartado 5.1) y abre el PR que revierte el
   commit causante en `main`, para que repositorio y producción vuelvan a coincidir.
2. **Datos:** retira la restricción con el `down.sql` de la migración, con el paso explícito del
   apartado 3:

   ```bash
   psql "$PRODUCTION_DATABASE_URL" -f \
     prisma/migrations/20260911150000_constraint_solape_tarifas_publicadas/down.sql
   ```

   El `down.sql` **no** elimina `btree_gist` a propósito: puede estar en uso por otras restricciones
   o consultas de la base.

Las dos partes son **un solo rollback y no se dejan a medias**: entre el paso 1 y el paso 2 queda
abierta la ventana en la que una publicación solapada responde `500` en lugar de `409`. Retirada la
restricción, la unicidad de la tarifa vigente vuelve a depender solo de la comprobación del dominio
y con ella vuelve la ventana de carrera que cerró CIF-89. Para deshacer el rollback se reaplica
`migration.sql`; la extensión no se recrea (`CREATE EXTENSION IF NOT EXISTS`).

### 5.3 Rollback de variables de entorno

Cambiar una variable en Vercel **no afecta a los despliegues ya construidos**: hay que
**redesplegar** para que surta efecto (`vercel redeploy <url>` o «Redeploy» en el panel). Si una
variable rompió producción, corrígela en Vercel y redespliega; si el valor anterior es el correcto,
restáuralo antes de redesplegar.

### 5.4 Cuándo usar cada uno

| Síntoma                                                    | Acción                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| La aplicación falla tras un release                        | Promover el deployment anterior (5.1)                       |
| Faltan o están mal datos/columnas                          | Migración compensatoria; PITR solo si es grave (5.2)        |
| Se revierte un cambio con restricción y traductor de error | Revertir la aplicación y luego retirar la restricción (5.2) |
| Producción falla tras cambiar una variable                 | Corregir la variable y redesplegar (5.3)                    |

## 6. Puesta en marcha inicial (una sola vez)

Paso 0 de cualquier sesión de operación: `scripts/despliegue-preflight.sh`. Es de solo lectura,
comprueba credenciales, repositorio, protección de `main`, proyecto de Vercel, variables y
accesibilidad de la base de datos, no imprime ningún valor y devuelve 1 si queda algo pendiente.

### 6.1 Estado a 2026-09-11 (CIF-11)

Estado verificado el 2026-09-11 con `scripts/despliegue-preflight.sh` (informe de solo lectura).
El apartado 5.1 ya está **probado de verdad**, no solo documentado:

| Paso                            | Estado    | Detalle                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Credenciales                 | Hecho     | Los tres secretos se inyectan en el entorno del agente y responden: el token de GitHub anuncia los alcances `repo` y `workflow` ([variables-entorno.md](variables-entorno.md), 5)                                                                                                                                                              |
| 2. Repositorio remoto           | Hecho     | `cifu2/presupuestoCifuentes`, **público** por decisión del propietario; `main` subida con el CI y la protección                                                                                                                                                                                                                                |
| 3. Protección de `main`         | Hecho     | Sin push directo: `calidad (formato · lint · tipos · unitarios)` y `e2e (puerta obligatoria)` requeridos y estrictos, conversación resuelta, sin force push, `enforce_admins` (apartado 2)                                                                                                                                                     |
| 4. Proyecto de Vercel           | Hecho     | `presupuesto-cifuentes` (`prj_7hKfqaoBcQVsn5xk4cfkrXFHUUOb`), framework Next.js, con `DATABASE_URL` (sensible) y `NEXT_PUBLIC_SITE_URL` en _Production_                                                                                                                                                                                        |
| 5. Integración Git de Vercel    | Hecho     | Proyecto enlazado al repositorio: hay preview por PR y producción desde `main`                                                                                                                                                                                                                                                                 |
| 6. Base de datos                | Hecho     | Una base dedicada por entorno en el mismo proyecto de Neon, ninguna compartida (ADR-0015): `presupuesto_production` migrada el 2026-09-12 y asignada a _Production_ en Vercel, y `presupuesto_preview` asignada a _Preview_; siguen pendientes el rol de aplicación con menos privilegios, la rama por entorno de ADR-0009 §2 y la rama por PR |
| 7. Primer despliegue y rollback | Hecho     | Producción y preview desplegadas y comprobadas con `/api/health` (PR #1). Ensayo real de rollback ejecutado el 2026-09-11: promoción de un deployment de producción anterior, `/api/health` en 200 tras el rollback y `git revert` del cambio causante en `main` (apartado 5.1)                                                                |
| 8. Dominio                      | Pendiente | Depende de la decisión de dominio (CIF-14); hasta entonces `NEXT_PUBLIC_SITE_URL` apunta al dominio `*.vercel.app`                                                                                                                                                                                                                             |

Decisión del propietario (2026-09-11): el repositorio se queda **público** por ahora. La otra decisión
abierta es el rol de aplicación de Neon frente al rol propietario.

### 6.2 Orden exacto de los pasos

1. **Credenciales.** GitHub (organización/usuario y nombre del repositorio), Vercel (equipo) y Neon
   (proyecto). Se guardan como secretos; este repositorio nunca las contiene.
2. **Repositorio remoto y protección de `main`:**

   ```bash
   # Público (por defecto) y sin revisiones obligatorias, como el estado verificado de `main`.
   scripts/github-bootstrap.sh <org>/<repo>

   # Variantes:
   # REPO_VISIBILITY=private scripts/github-bootstrap.sh <org>/<repo>
   # REPO_REQUIRED_APPROVALS=1 scripts/github-bootstrap.sh <org>/<repo>   # con un 2º colaborador
   ```

   Crea el repositorio (público por defecto), sube `main` y aplica la protección con `calidad` y
   `e2e` como checks requeridos y estrictos, sin revisiones obligatorias por defecto (el autor del
   PR y el dueño del token son la misma cuenta).

3. **Proyecto de Vercel y variables:** `scripts/vercel-bootstrap.sh` enlaza el proyecto con el
   repositorio e inyecta las variables de [variables-entorno.md](variables-entorno.md) en los
   entornos _Production_, _Preview_ y _Development_. La base de cada entorno se declara con sufijo
   (`DATABASE_URL__PRODUCTION`, `DATABASE_URL__PREVIEW`, `DATABASE_URL__DEVELOPMENT`), nunca
   `DATABASE_URL` a secas: el script aborta antes de escribir nada en Vercel si detecta un
   `DATABASE_URL` compartido ([ADR-0015](adr/0015-base-de-datos-de-produccion.md) §4).
4. **Base de datos:** proyecto en Neon con ramas `production` y `preview` + integración con Vercel
   ([ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md)).
5. **Primer despliegue:** fusionar un PR trivial y comprobar preview, producción, `/api/health` y el
   rollback del apartado 5.1 (probarlo de verdad, no darlo por supuesto).
6. **Dominio:** apuntar el dominio de puertascifuentes.com en Vercel y verificar HTTPS.

## 7. Actualizaciones de dependencias (Dependabot)

Dependabot abre PRs de dependencias contra `main` (`.github/dependabot.yml`) y esos PRs pasan por la
misma puerta requerida que cualquier otro cambio: `calidad` y `e2e` (apartado 2). No se fusiona un PR
de dependencias con la puerta en rojo, igual que no se fusiona un cambio de la aplicación.

La política está registrada en [ADR-0011 — Política de madurez de versiones](adr/0011-politica-madurez-versiones.md).

La resolución del lockfile depende de dos ajustes que deben contar la misma política de madurez:

- **pnpm** (`pnpm-workspace.yaml`, **no** el campo `pnpm` de `package.json`, que pnpm 11 ya no lee):
  - `minimumReleaseAge: 0`: fija de forma explícita que no hay ventana de madurez de versiones. Sin
    este valor, pnpm 11 —el que trae preinstalado el contenedor del updater— aplica 24 h por defecto y
    rechaza dependencias publicadas el mismo día.
  - `onlyBuiltDependencies`: paquetes autorizados a ejecutar scripts de instalación (`prisma`,
    `@prisma/engines`, `@swc/core`…).
- **Dependabot** (`.github/dependabot.yml`, entrada `npm`): `cooldown.exclude: ['*']`. Aunque no se
  configure, Dependabot aplica un _cooldown_ de 3 días a las actualizaciones de versión y lo traduce a
  `--config.minimumReleaseAge=4320` (minutos) en sus comandos de pnpm; ese flag gana a
  `minimumReleaseAge` del repositorio, así que abortaba la resolución cuando el lockfile contenía
  versiones más jóvenes que la ventana. Con todas las dependencias excluidas del cooldown, Dependabot
  no inyecta el flag y manda la política del repositorio (0 días).

  Si algún día se quiere una ventana de madurez real, hay que fijarla **en los dos sitios** —`cooldown`
  de Dependabot y `minimumReleaseAge` de pnpm (en minutos)— y asumir que las versiones recién
  publicadas no entran en el lockfile hasta que maduren.

### Cómo comprobar que el updater sigue verde

1. GitHub → Actions: el job dinámico `npm_and_yarn in /. - Update` (workflow
   `dynamic/dependabot/dependabot-updates`) termina en verde sobre `main`. Un fallo aquí no bloquea
   ninguna entrega, pero deja el CI en rojo y se tria como incidencia de DevOps.
2. Cada PR que abre Dependabot ejecuta `calidad` y `e2e`, y no se fusiona sin ambos en verde.
3. Reproducción local con la misma versión que usa el updater (pnpm 11):

   ```bash
   # Política del repositorio: no debe fallar.
   npx --yes pnpm@11 install --lockfile-only --no-frozen-lockfile

   # Gate que Dependabot inyectaba con su cooldown de 3 días: si vuelve a dar
   # ERR_PNPM_NO_MATURE_MATCHING_VERSION, revisar `cooldown.exclude` en .github/dependabot.yml.
   npx --yes pnpm@11 update typescript --lockfile-only --no-save -r \
     --config.minimumReleaseAge=4320
   ```

## 8. Referencias

- [Variables de entorno y secretos](variables-entorno.md)
- [Base de datos, backups y monitorización](operacion.md)
- [ADR-0007 — Despliegue en Vercel con el código en GitHub](adr/0007-despliegue-vercel-github.md)
- [ADR-0006 — Calidad: tests, cobertura y puerta de E2E en CI](adr/0006-calidad-y-ci.md)
- [ADR-0019 — Mitigación de la cuota diaria de despliegues del plan gratuito de Vercel](adr/0019-cuota-despliegues-vercel.md)
