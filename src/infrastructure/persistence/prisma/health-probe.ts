/**
 * Adaptador Prisma de la sonda de salud (ADR-0015 §5).
 *
 * Ejecuta una consulta de solo lectura contra PostgreSQL que comprueba dos cosas de una vez: que la
 * base responde y que tiene el esquema de la aplicación migrado. El tiempo máximo lo impone el caso
 * de uso (`HEALTH_PROBE_TIMEOUT_MS`), no este adaptador: así el borde HTTP responde en un tiempo
 * acotado aunque el driver se quede esperando a una base que no contesta.
 *
 * Nunca se registra ni se propaga el error crudo del driver: `pg`/Prisma pueden incluir la cadena
 * de conexión (con credenciales) en el mensaje. El puerto devuelve un estado, no un error.
 */

import type { PrismaClient } from '@prisma/client'

import type { DatabaseHealth, HealthProbe } from '@/application/ports/health-probe'

interface SchemaPresenceRow {
  hasMigrations: boolean
  hasSchema: boolean
}

export class PrismaHealthProbe implements HealthProbe {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<DatabaseHealth> {
    try {
      // Dos tablas sin las que la aplicación no puede funcionar: `_prisma_migrations` (historial de
      // migraciones; su ausencia es la firma del incidente del 2026-09-11, ADR-0015 hechos 1-2) y
      // `door_series` (tabla central de la primera migración del catálogo). `to_regclass` no falla
      // si no existen (devuelve NULL) y respeta el `search_path`, así que la comprobación sigue el
      // mismo camino de resolución que las consultas de los repositorios. Una sola ida y vuelta y
      // ningún dato de negocio.
      const [row] = await this.prisma.$queryRaw<SchemaPresenceRow[]>`
        SELECT
          to_regclass('_prisma_migrations') IS NOT NULL AS "hasMigrations",
          to_regclass('door_series') IS NOT NULL AS "hasSchema"
      `

      if (row === undefined || !row.hasMigrations || !row.hasSchema) {
        console.error('[health] la base de datos responde pero no tiene el esquema migrado')

        return 'unmigrated'
      }

      return 'ok'
    } catch {
      console.error('[health] la base de datos no responde a la sonda')

      return 'unreachable'
    }
  }
}
