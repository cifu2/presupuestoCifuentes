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
  /** `degraded` cuando la base está configurada pero no responde o no tiene el esquema migrado. */
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
 *
 * Solo `ok` (y `unconfigured`, sin base) cuentan como sanos: `unreachable` y `unmigrated` dejan el
 * estado en `degraded`, porque en ambos casos las rutas que tocan la base devolverían 500.
 *
 * El tope de tiempo **cancela** la consulta, no solo la espera: `healthProbe` recibe un
 * `AbortSignal` que se aborta al agotarse `HEALTH_PROBE_TIMEOUT_MS`, de modo que el adaptador no
 * deja la conexión del pool viva hasta que falle el socket.
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS)

  try {
    const pinged = healthProbe.ping({ signal: controller.signal })

    // La consulta cancelada puede rechazar después de que gane el tope: se marca como gestionada
    // para que ese rechazo no se registre como no capturado.
    pinged.catch(() => {})

    return await Promise.race([pinged, aborted(controller.signal)])
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Rechaza en cuanto la señal se aborta. El tope no espera a que el adaptador se dé por vencido:
 * en cuanto se agota, la respuesta HTTP sale como `unreachable` y la cancelación viaja a la
 * consulta por la misma señal.
 */
function aborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(new Error('health probe timeout'))

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}
