import type { Locale } from '@/domain/catalog/locale'

import type { AdminCatalogReader } from './admin-catalog-reader'
import { createFixtureAdminCatalogReader } from './fixtures/admin-catalog.fixtures'

/**
 * Único punto de intercambio del lector del panel (ADR-0023 §3 y §6).
 *
 * La fase 1 (shell de presentación) resuelve aquí el adaptador de fixtures. La fase 2 sustituye
 * esta implementación por el adaptador real (puerto de lectura + caso de uso + Prisma, CIF-242)
 * sin tocar ningún componente de `src/ui/admin/**`.
 */
export function createAdminCatalogReader(locale: Locale): AdminCatalogReader {
  return createFixtureAdminCatalogReader(locale)
}
