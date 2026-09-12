import type { Locale } from '@/domain/catalog/locale'

import { createAdminCatalogUseCase } from '@/application/use-cases/get-admin-catalog'
import { createContainer } from '@/composition/container'

import type { AdminCatalogReader } from './admin-catalog-reader'
import type {
  CatalogLanguageSummary,
  SeriesDetail,
  SeriesSummary,
  TariffVersionSummary,
} from './view-models'

/**
 * Único punto de intercambio del lector del panel (ADR-0023 §3 y §6, fase 2 = CIF-242).
 *
 * La fase 1 resolvía aquí el adaptador de fixtures. Ahora resuelve la **lectura real**: el puerto
 * de aplicación (`AdminCatalogReadPort`) servido por el contenedor —Prisma si hay `DATABASE_URL` y
 * el catálogo en memoria del modo demostración si no— y el caso de uso de administración.
 *
 * El mapeo de los DTO de aplicación a los view models es explícito a propósito: el contrato de
 * vista lo posee la presentación (§3) y la aplicación no la importa (ADR-0001). Si una forma
 * diverge, esto no compila. Ningún componente de `src/ui/admin/**` cambia.
 */
export function createAdminCatalogReader(locale: Locale): AdminCatalogReader {
  const container = createContainer()
  const useCase = createAdminCatalogUseCase({
    reader: container.adminCatalogReader,
    clock: container.clock,
    locale,
  })

  return {
    listSeries: async (): Promise<readonly SeriesSummary[]> => useCase.listSeries(),
    getSeries: async (slug): Promise<SeriesDetail | null> => useCase.getSeries(slug),
    listTariffVersions: async (): Promise<readonly TariffVersionSummary[]> =>
      useCase.listTariffVersions(),
    listLanguages: async (): Promise<readonly CatalogLanguageSummary[]> => useCase.listLanguages(),
  }
}
