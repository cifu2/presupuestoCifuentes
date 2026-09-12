import { z } from 'zod'

import { env, environmentFlag, resolveEnvironment, type Environment } from '@/config/env'

/**
 * Guarda de acceso del panel (ADR-0023 §5).
 *
 * El panel se sirve en el mismo despliegue que la web (ADR-0007) y la autenticación real llega en
 * la fase 3 (CIF-241), así que en Production está **cerrado por defecto**: solo se abre con el
 * interruptor `ADMIN_PANEL_ENABLED` o en el catálogo de demostración, que es la configuración con
 * la que corre el E2E hermético (fixtures, sin datos reales ni credenciales).
 */

const adminPanelSchema = z.object({
  ADMIN_PANEL_ENABLED: environmentFlag,
})

export type AdminAccessContext = {
  readonly environment: Environment
  readonly isPanelEnabled: boolean
  readonly isDemoCatalog: boolean
}

/** Lee el interruptor del entorno sin ampliar el esquema global (`src/config/env.ts`). */
export function readAdminPanelFlag(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return adminPanelSchema.parse(source).ADMIN_PANEL_ENABLED
}

export function isAdminPanelAccessible(context: AdminAccessContext): boolean {
  if (context.environment !== 'production') {
    return true
  }

  return context.isPanelEnabled || context.isDemoCatalog
}

/** ¿Se puede servir el panel en este proceso? Lo consulta el layout de `/[locale]/admin`. */
export function isAdminPanelAvailable(): boolean {
  return isAdminPanelAccessible({
    environment: resolveEnvironment(env),
    isPanelEnabled: readAdminPanelFlag(),
    isDemoCatalog: env.CATALOG_DEMO_MODE,
  })
}
