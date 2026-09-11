import type { Clock } from '@/application/ports/clock'

export interface GetSystemStatusDeps {
  clock: Clock
}

export interface SystemStatus {
  status: 'ok'
  checkedAt: string
}

/**
 * Caso de uso de ejemplo que recorre todas las capas: la ruta de Next lo invoca,
 * pide la hora por el puerto `Clock` y el adaptador real se inyecta en la raíz de
 * composición. Sirve de plantilla para los casos de uso del MVP.
 */
export function getSystemStatus({ clock }: GetSystemStatusDeps): SystemStatus {
  return {
    status: 'ok',
    checkedAt: clock.now().toISOString(),
  }
}
