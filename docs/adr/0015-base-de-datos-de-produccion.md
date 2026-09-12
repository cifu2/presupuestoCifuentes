# ADR-0015 — Destino de la base de datos de producción y `DATABASE_URL` por entorno

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (CIF-110), dentro de los límites de ADR-0007 y del objetivo de ADR-0009
- **Ámbito:** datos, entornos y despliegue

## Contexto

El endpoint `GET /api/catalog/series` responde `500` en producción desde que la ruta existe
(2026-09-11 20:20, `95595c9`) y una petición a producción no genera actividad en ninguna de las bases
visibles del proyecto de Neon. `/api/health` responde `200` con `database: "configured"` porque solo
comprueba que la variable está definida, no que la base responda. Los mismos endpoints funcionan en
_preview_ con `mode: "prisma"`.

Hechos comprobados (CIF-109 y CIF-110):

1. El único entorno de base de datos que se creó y migró fue _Preview_
   (`docs/despliegue.md`, tabla de estado, paso 6: base `presupuesto_preview`). La rama `production`
   de ADR-0009 nunca se provisionó ni se migró.
2. El secreto de operación `neon/production-database-url` resuelve a la base por defecto del
   proyecto de Neon, que no tiene aplicada ninguna migración (`_prisma_migrations` no existe).
3. `DATABASE_URL` de _Production_ está marcada como _sensitive_ en Vercel: no se puede leer. Es un
   resto de la puesta en marcha y no hay forma de auditarla; el script de bootstrap inyectaba el
   mismo valor de `DATABASE_URL` en _Production_, _Preview_ y _Development_, que es justo lo que
   ADR-0009 prohíbe.
4. No existe ningún camino de escritura de la aplicación que haya funcionado en producción: todas
   las rutas que tocan la base (`/api/catalog/*`, `/api/quotes*`, `/api/manual-quote-requests`,
   `/api/admin/tariff-versions/*/publish`) comparten contenedor y fallan igual. Los únicos datos que
   existen hoy son los de preview, que no son datos reales de clientes.

## Decisión

1. **Una base de datos por entorno, nunca compartida.** La base de producción es una base PostgreSQL
   de Neon dedicada en exclusiva a producción y se alcanza con un `DATABASE_URL` definido **solo** en
   el entorno _Production_ de Vercel. Ningún entorno reutiliza la cadena de otro.
2. **Se provisiona la base de producción ya.** Como el proyecto de Neon no tiene credencial de
   administración en el gestor de secretos (solo la cadena de conexión de la aplicación) y la rama
   `production` no existe, el MVP crea una **base dedicada** (`presupuesto_production`) dentro de la
   rama actual del proyecto de Neon y la migra con `prisma migrate deploy`. La rama dedicada por
   entorno de ADR-0009 §2 sigue siendo el estado objetivo y se retoma cuando exista credencial de
   administración de Neon (tarea hija enlazada).
3. **El valor actual de `DATABASE_URL` de _Production_ no se conserva ni se intenta leer.** Se
   sobrescribe con el valor conocido y verificado de la base de producción. No hay datos de la
   aplicación detrás de él (hecho 4) y el valor es irrecuperable por diseño de Vercel.
4. **`DATABASE_URL` es configuración por entorno, no una variable común.**
   `scripts/vercel-bootstrap.sh` debe rechazar un `DATABASE_URL` sin entorno y aceptar
   `DATABASE_URL__PRODUCTION`, `DATABASE_URL__PREVIEW` y `DATABASE_URL__DEVELOPMENT`; el resto de
   variables siguen inyectándose en los tres entornos.
5. **La salud de producción incluye la base de datos.** `/api/health` (la sonda del monitor de
   ADR-0009 §5) debe fallar cuando la aplicación no puede consultar la base, no solo cuando falta la
   variable. La implementación es de Backend y lleva test. Aclaración posterior (CIF-144, ratificada
   por el CTO en CIF-146):
   - La sonda comprueba la **presencia del esquema migrado**, no solo que la conexión responda:
     resuelve `_prisma_migrations` y `door_series` con el mismo `search_path` que usan los
     repositorios, en una única consulta de solo lectura y sin leer datos de negocio.
   - Una base alcanzable pero sin esquema o sin historial de migraciones devuelve
     `database: "unmigrated"` con HTTP `503` y `status: "degraded"`. Es la puerta que faltaba en el
     incidente del 2026-09-11 (hechos 1-2): el monitor habría seguido verde con `/api/catalog/*`
     devolviendo 500. `ok` y `unconfigured` (sin base o modo demo) siguen devolviendo `200`.
   - La sonda verifica **presencia**, no la deriva migración a migración: esa la comprueba la puerta
     de release con `prisma migrate status` y `prisma migrate deploy` (§6). Detectar desde la propia
     base una migración fallida o a medias queda como endurecimiento posterior no bloqueante
     (CIF-147).
6. **`prisma migrate deploy` sigue siendo un paso explícito de release** contra la base de
   producción, incluida `20260911150000_constraint_solape_tarifas_publicadas` con
   `CREATE EXTENSION IF NOT EXISTS btree_gist`.
7. **Los datos de negocio no se siembran desde el repositorio.** La base de producción se crea
   vacía; el catálogo real (series, medidas, acabados, colores, complementos y tarifas) lo carga el
   propietario desde el panel, que es la única fuente de precios y catálogo. La carga inicial se
   coordina con el CEO.

## Consecuencias

- Producción deja de depender de un valor que nadie puede auditar: la base es nombrada, dedicada y
  verificable con `prisma migrate status`, `pg_stat_database` y `/api/health`.
- El preview y producción comparten proyecto, rama y PITR de Neon mientras no haya credencial de
  administración: el aislamiento es por base de datos, no por rama. Es aceptable para el MVP (no hay
  datos reales todavía) y queda como deuda explícita con tarea hija.
- Hace falta una credencial de administración de Neon (consola o API) para crear ramas, restaurar por
  PITR y hacer cumplir ADR-0009 §2 al pie de la letra. Mientras no exista, la operación de datos se
  limita a lo que permite el rol de aplicación.
- Producción arranca con el catálogo vacío: hasta que el propietario cargue el catálogo real, el
  configurador público no muestra series. Es una tarea de negocio (CEO), no de infraestructura.
- El coste sigue siendo 0: bases adicionales y PITR entran en el plan gratuito de Neon.

## Alternativas consideradas

- **Apuntar producción a `presupuesto_preview`:** descartado. Mezclaría datos de prueba con datos
  reales de clientes y rompería la regla de ADR-0009 §2 en el peor sentido posible.
- **Esperar a la credencial de administración para crear la rama `production`:** descartado como
  bloqueo único. Deja el MVP sin producción hasta que llegue una credencial del propietario; se crea
  la base dedicada ahora y la rama se hace después.
- **Reutilizar la base por defecto del proyecto de Neon (la del secreto actual):** descartado. No
  distingue entornos, es la que usa la integración y no se puede auditar a quién pertenece.
- **Migrar a ciegas la base apuntada por el valor actual de _Production_:** descartado por
  irrecuperable e inauditable; no se aplica ninguna migración sobre un destino que no se puede
  nombrar.
