import type { Clock } from '@/application/ports/clock'
import { SystemClock } from '@/infrastructure/clock/system-clock'

/**
 * Raíz de composición: único lugar donde se conectan puertos con adaptadores.
 * Las capas de UI/route handlers piden dependencias aquí (`createContainer`),
 * nunca construyen adaptadores por su cuenta.
 */
export interface Container {
  clock: Clock
}

export function createContainer(): Container {
  return {
    clock: new SystemClock(),
  }
}
