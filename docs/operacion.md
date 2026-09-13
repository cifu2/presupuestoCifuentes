# Base de datos, backups y monitorización

Operación del MVP: dónde vive la base de datos, cómo se protegen los datos y qué se vigila.
Decisiones asociadas: [ADR-0007](adr/0007-despliegue-vercel-github.md) y
[ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md).

## 1. Base de datos gestionada

- **Neon (PostgreSQL gestionado)** a través de la integración de Vercel, sin contenedores ni
  servidores propios. Motivo y alternativas: [ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md).
- **Ramas de base de datos** en lugar de un único entorno compartido:
  - `production`: rama principal, la que consume producción.
  - `preview`: rama base de la que cada PR crea su copia _copy-on-write_ (la integración de Vercel
    crea la rama por PR y la borra al cerrarse).
  - `dev`: opcional, para desarrollo local contra datos no reales.
- La aplicación se conecta con un rol de base de datos de **privilegio mínimo** (solo DML sobre su
  esquema). El rol de administración se usa únicamente para migraciones y restauración.
- Las migraciones se aplican con el procedimiento explícito de
  [despliegue.md](despliegue.md), apartado 3.

## 2. Backups

| Mecanismo                                       | Cobertura          | Frecuencia / retención           | Responsable |
| ----------------------------------------------- | ------------------ | -------------------------------- | ----------- |
| Point-in-time recovery (PITR) de Neon           | rama `production`  | continua, ≥ 7 días               | DevOps      |
| Rama de snapshot antes de migración destructiva | rama `production`  | a demanda, se borra tras validar | DevOps      |
| `pg_dump` local puntual (opcional)              | catálogo y tarifas | antes de releases de datos       | DevOps      |

- **Antes de cada migración destructiva o de un cambio masivo de catálogo:** `CREATE BRANCH` en Neon
  (snapshot instantáneo) con nombre `pre-<release>-<fecha>`. Se documenta en la tarea y se borra al
  confirmar que el release es estable.
- **Prueba de restauración cada trimestre:** restaurar la rama `production` en un punto reciente a
  una rama de prueba, comprobar que el panel y el configurador leen datos, y anotarlo en la tarea de
  operación. Un backup sin restauración probada no se considera un backup.
- La restauración de PITR la decide el CTO (es irreversible respecto a los datos escritos desde el
  punto elegido) y se ejecuta desde la consola de Neon.

## 3. Monitorización

- **Salud de la aplicación:** `GET /api/health` devuelve `status`, `environment` y `database`.
  `environment` sale de `VERCEL_ENV` (`production` o `preview`; `NODE_ENV` fuera de Vercel), así que
  el monitor distingue producción de preview. `database` tiene cuatro estados (ADR-0015 §5):
  - `unconfigured`: no hay `DATABASE_URL` (o `CATALOG_DEMO_MODE=true`). HTTP **200**.
  - `ok`: la base responde y tiene el esquema migrado (`_prisma_migrations` y `door_series`).
    HTTP **200**.
  - `unreachable`: hay `DATABASE_URL` pero la consulta falla o no responde en **2 s**; al agotarse el
    tope la consulta se **cancela**, no solo se deja de esperar. HTTP **503**, con
    `status: "degraded"`. El monitor de uptime se dispara aquí, que es justo lo que no ocurría
    durante la avería del 2026-09-11 (ADR-0015).
  - `unmigrated`: hay `DATABASE_URL` y la base **responde**, pero no tiene el esquema de la
    aplicación o le falta el historial de migraciones. HTTP **503**, con `status: "degraded"`. Es la
    puerta que faltaba en el incidente del 2026-09-11: la base de producción era alcanzable pero
    estaba vacía. Se corrige con `prisma migrate deploy` contra esa base (ADR-0015 §6).
  - La sonda comprueba presencia de esquema e historial, no el detalle de cada migración: una
    migración pendiente o a medias se verifica con `prisma migrate status` en la puerta de release.
  - El cuerpo nunca incluye la cadena de conexión ni credenciales, y el `console.error` del
    adaptador solo registra un mensaje fijo (el error del driver puede contener la URL).
  - Se usa como comprobación manual tras cada release y como sonda del monitor externo.
- **Monitorización básica sin coste añadido:**
  - _Deployment notifications_ de Vercel al correo del propietario/CTO en cada despliegue de
    producción (éxito y fallo).
  - Alertas de Neon por uso de recursos y por fallo de disponibilidad.
  - Monitor externo de uptime sobre `/api/health` cada 5 minutos (por ejemplo el propio chequeo de
    Vercel o un servicio gratuito de uptime), con aviso por email.
- **Coste:** plan gratuito de Vercel y de Neon es suficiente para el MVP; si se supera, se revisa con
  el **CEO** antes de subir de plan (ADR-0019 §6). No se contrata nada de pago sin aprobación.
- **Disco del host del control plane:** la guarda `docs/runbooks/disco-guard.sh` mide el uso del
  volumen raíz (20 GB, el único que hay) y avisa al 80 %; el detalle del umbral y del saneamiento
  está en el apartado 4.3. Se ejecuta con `paperclip-disco-guard.timer` a diario y deja el rastro en
  `journalctl -t paperclip-disco-guard`.
- **Lo que no se monitoriza (todavía):** métricas de negocio y trazas distribuidas. Se añadirán
  cuando existan flujos reales (configurador y presupuestos) y tráfico que lo justifique.

## 4. Incidentes: runbook mínimo

1. **Detectar.** Aviso de Vercel/Neon, monitor de uptime o queja del propietario.
2. **Contener.** ¿Afecta a producción? Aplicar el rollback de
   [despliegue.md](despliegue.md), apartado 5 (aplicación primero, datos después).
3. **Comunicar.** Comentar en la tarea de Paperclip con hora de inicio, alcance visible, qué se ha
   hecho y qué falta. Sin datos de clientes ni credenciales en el comentario.
4. **Corregir la causa raíz** con test que la cubra y PR revisado por otro agente.
5. **Aprender.** Si el incidente revela una decisión de arquitectura, stack o datos, se escribe un
   ADR. Si revela un hueco de la puerta de calidad, se abre tarea hija en QA o DevOps.

### 4.1 Fuga de credenciales (log, captura, comentario o transcript)

1. **Contener sin ampliar el daño.** No reproducir el valor en ningún sitio: ni en comentarios, ni
   en documentos, ni "para comprobar que es el mismo". Si el valor aparece en un log de run, se
   asume comprometido.
2. **Rotar** la credencial en su origen siguiendo el apartado 5.5 de
   [variables-entorno.md](variables-entorno.md) y [ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md),
   con la verificación de que el valor viejo ya no sirve. Las credenciales de larga duración solo se
   emiten desde la interfaz del proveedor, así que la rotación necesita al operador: el agente deja
   el trabajo preparado (emisión por API si es posible, propuesta de secreto y comprobaciones) y la
   tarea queda con responsable y acción nombrados.
3. **Comprobar el alcance** con el barrido canónico, que nunca imprime valores:

   ```bash
   scripts/secret-scan.sh                       # patrones de alta confianza
   printf '%s\n' "$VALOR" | scripts/secret-scan.sh --no-patterns --values-stdin --history
   ```

4. **Anotar** el incidente en la tarea de Paperclip: qué se filtró (por nombre), dónde, cuándo, qué
   se ha rotado y qué queda. Sin valores.
5. **Aprender.** Si el proceso falló, se corrige con test que lo cubra (como
   `scripts/secret-scan.test.sh`, que verifica que la salida no contiene ni el valor ni el patrón) y
   con la revisión de otro agente.

### 4.2 Cuota de despliegues de Vercel: medir antes de tocar `vercel.json`

El plan gratuito permite **100 despliegues por día** (`api-deployments-free-per-day`). El contador del
límite y el listado **no son la misma ventana**: `v6/deployments` lista el proyecto y no es un
registro de auditoría (los borrados desaparecen del listado), mientras el contador es de la
cuenta. La lectura del límite (23:52Z–00:05Z, el intervalo de los cuatro `402` de CIF-530)
respondía `{total: 100, remaining: 0, reset: 2026-09-13T23:56:31Z}`; no hay ningún instante con
segundos en las fuentes, así que el dato es ese intervalo y no un momento exacto. La ventana rodante
de 24 h que contiene esa lectura lista **87**. Las ventanas candidatas medidas con
`GET /v6/deployments` (`projectId` del proyecto, mismo `until`, captura 2026-09-13T00:37Z) son:

| Ventana                                                                        | Listados |
| ------------------------------------------------------------------------------ | -------: |
| Rodante 24 h terminando en la lectura del límite (09-12T00:05Z → 09-13T00:05Z) |       87 |
| Rodante 24 h terminando en la captura (09-12T00:37Z → 09-13T00:37Z)            |       83 |
| Rodante 24 h terminando a las 23:56:26Z (cupo liberado, paso A de CIF-530)     |       86 |
| Día natural UTC 2026-09-11                                                     |      100 |
| Día natural UTC 2026-09-12                                                     |       87 |
| Día natural UTC 2026-09-13 (00:00Z → 00:37Z, parcial)                          |        1 |
| `[reset−24 h, reset)` = 09-10T23:56:31Z → 09-11T23:56:31Z                      |      100 |
| `[reset, captura)` = 09-12T23:56:31Z → 09-13T00:37Z                            |        2 |

El único bloque del histórico retenido que lista 100 exactos es el día natural UTC 2026-09-11 (la
ráfaga de 100 en 6,5 h), y **no contiene** la lectura. Por eso la comparación
«87 vs 100» **no mide una subestimación**: son ventanas distintas y con `GET` no se reconstruye la
del contador. Lo medible es que el contador se agota con 86–87 listados en su ventana rodante, así
que el listado sigue siendo una **cota inferior** de valor desconocido: el margen real que queda por
rascar no se puede cifrar, y cualquier ahorro de clases de rama (≈3,7–9,7/día) hay que compararlo
contra esa cota, no contra 87.

Medición reproducible, **solo `GET`** (crear un despliegue para medir gastaría la cuota que se mide):

```bash
VERCEL_TEAM_ID=… VERCEL_PROJECT_ID=… scripts/vercel-consumo.sh 24 72
```

La credencial se lee de `VERCEL_DEVOPS_TOKEN` (gestor de secretos) y nunca se imprime. La salida es
una tabla TSV `clase de rama × entorno` con el recuento y la tasa por día; su contrato está en
`scripts/vercel-consumo.test.sh`.

Apagar una clase de rama en `vercel.json` no es gratis: cada clase apagada es un cambio de código que
se queda sin preview, de ahí la guardia de contenido de ADR-0019 §4. La lista de clases la decide el
CTO con la medición delante, no a ciegas.

### 4.3 Volumen raíz del host al límite (disco lleno)

El host donde corren los agentes, los workspaces y la base del control plane tiene **un solo
volumen raíz** de 20 GB (`/dev/mapper/pve-vm--108--disk--0`, ext4, montado en `/`). Cuando se llena
no falla solo un build: `git` no puede escribir el índice del worktree
(`fatal: sha1 file '…/index.lock' write error. Out of diskspace`) y cualquier run que escriba en el
repositorio, migraciones incluidas, se queda a medias. Pasó el 2026-09-13 (0 bytes libres; borrar
`/root/.cache/node-gyp` dejó un alivio temporal de ~277 MB) y es el hallazgo de CIF-585.

**Umbrales y aviso.** La guarda `docs/runbooks/disco-guard.sh` mide el uso de `/`, lo registra en el
journal y deja el fichero `/var/lib/paperclip-disco-guard/ALERTA` mientras siga por encima del aviso:

| Uso de `/` | Significado                    | Qué se hace                                                                  |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------- |
| < 80 %     | normal                         | nada                                                                         |
| ≥ 80 %     | **aviso**                      | la guarda sanea lo regenerable y deja la marca; DevOps lo revisa             |
| ≥ 85 %     | incumple el criterio de cierre | saneamiento manual: retirar worktrees de issues cerrados                     |
| ≥ 92 %     | **crítico**                    | la guarda sale con estado 2 (systemd la marca `failed`) y se escala a DevOps |

El `paperclip-disco-guard.timer` la ejecuta a diario (04:15 ± 10 min) y 15 minutos después del
arranque. Solo borra material regenerable: metadatos de pnpm, journal, `.deb` cacheados y artefactos
de build (`.next`, `coverage`, `playwright-report`, `test-results`, `tsconfig.tsbuildinfo`) con más
de dos días. **No** borra el store de pnpm (lo comparten todos los workspaces), ni fuentes, ni
worktrees: retirar un worktree es una decisión con estado de tarea delante y está abajo.

**Saneamiento manual, de mayor a menor beneficio** (medido el 2026-09-13 en este host: de 253 MB
libres al 99 % a 4,5 GB libres al 76 %):

1. **Worktrees de issues cerrados.** Es el grueso del consumo: cada uno arrastra su `node_modules` y
   su `.next`. Son worktrees del mismo repositorio (los objetos viven en el `.git` compartido), así
   que borrar el directorio **no pierde ningún commit**; solo descarta cambios sin commitear, y por
   eso el criterio mira el estado del issue.
   - Se retiran solo los del issue en estado terminal (`done`/`cancelled`) según la API de Paperclip,
     sin tocar en los últimos 90 minutos y sin ningún proceso con el directorio abierto. Los de
     issues activos (`in_progress`, `todo`, `in_review`, `blocked`) no se tocan nunca.
   - Si su `node_modules` está montado, `rm -r` falla con `Device or resource busy`: hay que
     `umount -l` del punto de montaje **dentro del worktree que se retira** antes de borrar.
   - **Cuidado con los montajes compartidos.** Un `node_modules` montado desde el proyecto (o desde
     otro worktree) es el _mismo_ directorio: borrar su contenido desde el worktree retirado vacía
     el origen y deja a los demás workspaces sin dependencias. Antes de borrar, comprobar el origen
     (`findmnt -o TARGET,SOURCE | grep node_modules`) y desmontar primero. Si aun así se vacía,
     `pnpm install --frozen-lockfile --offline` en el proyecto lo reconstruye en segundos desde el
     store (comprobado el 2026-09-13: 910 MB en 5 s).
   - Después, `git worktree prune` y `git gc --prune=now` en el repositorio (el `.git` del proyecto
     pasó de 28 MB a 3,7 MB).
2. **Cachés compartidas.** `pnpm store prune` y borrar `/root/.cache/pnpm` (metadatos, se
   regeneran). El store en sí no se borra: reconstruirlo cuesta una descarga completa.
3. **Artefactos de build** del resto de workspaces (mismos nombres que la guarda). Regenerables.
4. **`/tmp` es tmpfs: consume RAM, no disco.** Un `/tmp/.pnpm-store` de 2,7 GB de un run antiguo
   presionaba la memoria del host. Los temporales de cada run viven en `PAPERCLIP_SCRATCH_DIR` y los
   retira el arnés.
5. **Estructural (pendiente).** El volumen raíz es una LV de 20 GB del hipervisor y no hay un
   segundo volumen al que mover los workspaces, aunque el host tiene ~465 GB por SSD. Ampliar la LV
   —o mover los workspaces a otro volumen— es una acción del **operador del host**: los agentes
   corren dentro del contenedor y no deben redimensionar el volumen de la raíz desde dentro.

Cierre del incidente: `/` por debajo del 85 %, un `git` de escritura (crear/borrar worktree o
commit) sin error de espacio y este apartado actualizado si el procedimiento cambia.

## 5. Logs y privacidad

- Los logs no contienen datos personales identificables ni `DATABASE_URL`.
- Los presupuestos guardan el mínimo imprescindible para el negocio (ADR-0004) y su acceso queda
  restringido al panel de administración.
- Los datos de la base de datos de preview son desechables y nunca son una copia de producción
  (cualquier depuración se hace anonimizando, no copiando datos reales).
