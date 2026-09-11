/**
 * Puerto de tarifas versionadas del panel (ADR-0003).
 *
 * El caso de uso de publicación carga las versiones de la serie, aplica la invariante de
 * no solapamiento del dominio y solo entonces persiste. El puerto no conoce Prisma.
 */

import type { TariffVersion } from '@/domain/catalog/tariff-version'

export interface TariffVersionRepository {
  findById(id: string): Promise<TariffVersion | null>
  /** Todas las versiones de la serie, en cualquier estado (borrador, publicada o archivada). */
  listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]>
  /** Crea la versión si no existe y la actualiza si ya está; nunca borra. */
  save(version: TariffVersion): Promise<void>
}
