/**
 * Puerto de tarifas versionadas del panel (ADR-0003).
 *
 * El caso de uso de publicación carga las versiones de la serie, aplica las invariantes de dominio
 * (no solapamiento y tabla de precios no vacía) y solo entonces persiste. El puerto no conoce Prisma.
 *
 * La tabla de precios forma parte del agregado de la versión (su clave primaria es el id de la
 * versión), así que vive en este mismo puerto: publicar necesita leerla y editar precios escribirla.
 */

import type { TariffVersion } from '@/domain/catalog/tariff-version'
import type { PriceTable } from '@/domain/pricing/price-table'

export interface TariffVersionRepository {
  findById(id: string): Promise<TariffVersion | null>
  /** Todas las versiones de la serie, en cualquier estado (borrador, publicada o archivada). */
  listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]>
  /**
   * Inserta una versión nueva; a diferencia de `save`, no actualiza ninguna fila existente. Si la
   * serie ya tiene una versión con ese `versionNumber` lanza `ConflictError` (lo impone el
   * `@@unique([seriesId, versionNumber])`): quien abre borradores reintenta con el número siguiente.
   */
  create(version: TariffVersion): Promise<void>
  /** Crea la versión si no existe y la actualiza si ya está; nunca borra. */
  save(version: TariffVersion): Promise<void>
  /** Tabla de precios de la versión, o `null` si el borrador todavía no tiene ninguna. */
  findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null>
  /** Reemplaza la tabla de precios completa de la versión (bandas y modificadores incluidos). */
  savePriceTable(priceTable: PriceTable): Promise<void>
}
