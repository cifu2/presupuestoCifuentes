import { resolvePanelState } from './panel-navigation'
import type { AdminPanelState } from './view-models'

/**
 * Carga de una sección del panel a partir del lector. El estado forzado (`?state=`) manda sobre el
 * contenido, y un fallo del lector nunca revienta la página: se pinta el estado de error.
 */

export type AdminSearchParams = Record<string, string | string[] | undefined>

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function requestedState(searchParams: AdminSearchParams): string | undefined {
  return firstParam(searchParams.state)
}

export async function loadSection<T>({
  requested,
  load,
  isEmpty,
}: {
  requested: string | undefined
  load: () => Promise<T>
  isEmpty: (data: T) => boolean
}): Promise<{ readonly state: AdminPanelState; readonly data: T | null }> {
  try {
    const data = await load()

    return { state: resolvePanelState(requested, !isEmpty(data)), data }
  } catch {
    return { state: 'error', data: null }
  }
}
