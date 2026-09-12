import type { Clock } from '@/application/ports/clock'
import type { DatabaseHealth, HealthProbe } from '@/application/ports/health-probe'

export interface GetSystemStatusDeps {
  clock: Clock
  /**
   * `null` cuando la aplicación no usa base de datos (sin `DATABASE_URL` o con
   * `CATALOG_DEMO_MODE=true`): la sonda lo informa como `unconfigured` y la respuesta sigue
   * siendo 200 (ADR-0015 §5).
   */
  healthProbe: HealthProbe | null
}

export type DatabaseStatus = DatabaseHealth | 'unconfigured'

export interface SystemStatus {
  /** `degraded` cuando la base está configurada pero no responde. */
  status: 'ok' | 'degraded'
  database: DatabaseStatus
  checkedAt: string
}

/**
 * Tiempo máximo de la sonda de base de datos. Por encima de este umbral la base se considera
 * inalcanzable: la sonda del monitor no puede quedarse colgada esperando a un driver que no
 * responde (ADR-0015 §5).
 */
export const HEALTH_PROBE_TIMEOUT_MS = 2000

/**
 * Estado del sistema para la sonda de salud del monitor (ADR-0009 §5, ADR-0015 §5).
 *
 * Recorre todas las capas: la ruta de Next lo invoca, pide la hora por el puerto `Clock` y la
 * comprobación de la base por el puerto `HealthProbe`; los adaptadores reales se inyectan en la
 * raíz de composición. Nunca propaga ni registra el error del driver, que puede contener la
 * cadena de conexión.
 */
export async function getSystemStatus({
  clock,
  healthProbe,
}: GetSystemStatusDeps): Promise<SystemStatus> {
  const checkedAt = clock.now().toISOString()

  if (healthProbe === null) {
    return { status: 'ok', database: 'unconfigured', checkedAt }
  }

  const database = await probeDatabase(healthProbe)

  return { status: database === 'ok' ? 'ok' : 'degraded', database, checkedAt }
}

async function probeDatabase(healthProbe: HealthProbe): Promise<DatabaseHealth> {
  try {
    return await withTimeout(healthProbe.ping(), HEALTH_PROBE_TIMEOUT_MS)
  } catch {
    return 'unreachable'
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('health probe timeout')), timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('health probe failed'))
      },
    )
  })
}
