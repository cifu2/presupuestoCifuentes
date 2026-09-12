/**
 * Adaptador PostgreSQL de la sonda de salud (ADR-0015 §5).
 *
 * Ejecuta una consulta de solo lectura contra PostgreSQL que comprueba dos cosas de una vez: que la
 * base responde y que tiene el esquema de la aplicación migrado. El tiempo máximo lo impone el caso
 * de uso (`HEALTH_PROBE_TIMEOUT_MS`), que aborta la señal que recibe `ping`; aquí esa señal
 * **cancela la consulta**: se destruye la conexión que la ejecuta (`PoolClient.release(true)`,
 * que en `pg` cierra el socket aunque la consulta siga colgada).
 *
 * Por qué un pool propio y no `prisma.$queryRaw`: Prisma no acepta un `AbortSignal` en la consulta,
 * así que el tope solo acotaría la respuesta HTTP y la consulta seguiría en vuelo. La sonda usa un
 * pool de **una sola conexión** para poder destruirla al cancelar sin tocar las conexiones que
 * atienden peticiones.
 *
 * Nunca se registra ni se propaga el error crudo del driver: `pg`/Prisma pueden incluir la cadena
 * de conexión (con credenciales) en el mensaje. El puerto devuelve un estado, no un error.
 */

import pg, { type Pool, type PoolClient } from 'pg'

import type {
  DatabaseHealth,
  HealthProbe,
  HealthProbeOptions,
} from '@/application/ports/health-probe'

type SchemaPresenceRow = {
  hasMigrations: boolean
  hasSchema: boolean
}

/**
 * Dos tablas sin las que la aplicación no puede funcionar: `_prisma_migrations` (historial de
 * migraciones; su ausencia es la firma del incidente del 2026-09-11, ADR-0015 hechos 1-2) y
 * `door_series` (tabla central de la primera migración del catálogo). `to_regclass` no falla si no
 * existen (devuelve NULL) y respeta el `search_path`, así que la comprobación sigue el mismo camino
 * de resolución que las consultas de los repositorios. Una sola ida y vuelta y ningún dato de
 * negocio.
 */
const SCHEMA_PRESENCE_SQL = `
  SELECT
    to_regclass('_prisma_migrations') IS NOT NULL AS "hasMigrations",
    to_regclass('door_series') IS NOT NULL AS "hasSchema"
`

/** Pool de la sonda: una única conexión, para que cancelar no afecte al resto de la aplicación. */
export function createHealthProbe(connectionString: string): PgHealthProbe {
  return new PgHealthProbe(new pg.Pool({ connectionString, max: 1 }))
}

export class PgHealthProbe implements HealthProbe {
  constructor(private readonly pool: Pool) {}

  async ping({ signal }: HealthProbeOptions = {}): Promise<DatabaseHealth> {
    if (isAborted(signal)) {
      return 'unreachable'
    }

    const client = await this.checkout()

    if (client === null) {
      return 'unreachable'
    }

    // La señal pudo abortarse mientras se conseguía la conexión: sin esta comprobación la consulta
    // se ejecutaría igual, porque un `addEventListener` sobre una señal ya abortada no dispara.
    if (isAborted(signal)) {
      client.release()

      return 'unreachable'
    }

    let cancelled = false
    const cancel = () => {
      cancelled = true
      client.release(true)
    }

    signal?.addEventListener('abort', cancel, { once: true })

    try {
      const { rows } = await client.query<SchemaPresenceRow>(SCHEMA_PRESENCE_SQL)
      const [row] = rows

      if (row === undefined || !row.hasMigrations || !row.hasSchema) {
        console.error('[health] la base de datos responde pero no tiene el esquema migrado')

        return 'unmigrated'
      }

      return 'ok'
    } catch {
      console.error(
        cancelled
          ? '[health] la sonda de la base de datos se canceló al agotarse el tiempo de espera'
          : '[health] la base de datos no responde a la sonda',
      )

      return 'unreachable'
    } finally {
      signal?.removeEventListener('abort', cancel)

      // Si se canceló, la conexión ya está destruida: devolverla al pool lanzaría.
      if (!cancelled) {
        client.release()
      }
    }
  }

  private async checkout(): Promise<PoolClient | null> {
    try {
      return await this.pool.connect()
    } catch {
      console.error('[health] la base de datos no responde a la sonda')

      return null
    }
  }
}

/**
 * Lee `aborted` sin que TypeScript estreche el tipo: entre las dos comprobaciones hay un `await` en
 * el que la señal puede abortarse, y un estrechamiento haría inalcanzable la segunda.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}
