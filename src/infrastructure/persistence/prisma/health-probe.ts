/**
 * Adaptador Prisma de la sonda de salud (ADR-0015 §5).
 *
 * Ejecuta una consulta trivial contra PostgreSQL. El tiempo máximo lo impone el caso de uso
 * (`HEALTH_PROBE_TIMEOUT_MS`), no este adaptador: así el borde HTTP responde en un tiempo acotado
 * aunque el driver se quede esperando a una base que no contesta.
 *
 * Nunca se registra ni se propaga el error crudo del driver: `pg`/Prisma pueden incluir la cadena
 * de conexión (con credenciales) en el mensaje. El puerto devuelve un estado, no un error.
 */

import type { PrismaClient } from '@prisma/client'

import type { DatabaseHealth, HealthProbe } from '@/application/ports/health-probe'

export class PrismaHealthProbe implements HealthProbe {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<DatabaseHealth> {
    try {
      // Consulta trivial, sin tablas ni esquema: solo comprueba que la conexión responde.
      await this.prisma.$queryRaw`SELECT 1`

      return 'ok'
    } catch {
      console.error('[health] la base de datos no responde a la sonda')

      return 'unreachable'
    }
  }
}
