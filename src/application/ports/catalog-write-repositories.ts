/**
 * Puertos de escritura del catálogo (CIF-126a, ADR-0027).
 *
 * Son puertos pequeños por agregado, como los de lectura: el caso de uso pide lo que necesita y el
 * adaptador (Prisma o en memoria) cumple el mismo contrato. La identidad de un *upsert* la fija el
 * propio catálogo, no el adaptador:
 *
 * - series, acabados y complementos: por `code` (`@@unique` en `prisma/schema.prisma`);
 * - colores: por `(finishId, code)`.
 *
 * No hay `delete`: desactivar es archivar (`CatalogStatus.archived`), nunca borrar (criterio de CIF-9).
 */

import type { Accessory } from '@/domain/catalog/accessory'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'
import type { DoorSeries } from '@/domain/catalog/series'

export interface SeriesWriteRepository {
  /** Serie con ese `code` en cualquier estado editorial: es la clave del *upsert*. */
  findByCode(code: string): Promise<DoorSeries | null>
  /** Serie con ese `slug`, para detectar el conflicto con otra distinta. */
  findBySlug(slug: string): Promise<DoorSeries | null>
  /** Crea o actualiza la serie, sus límites, sus vínculos y sus textos multi-idioma. */
  save(series: DoorSeries): Promise<void>
}

export interface FinishWriteRepository {
  findByCode(code: string): Promise<Finish | null>
  save(finish: Finish): Promise<void>
}

export interface ColorWriteRepository {
  /** Color de ese acabado con ese `code`: la clave del *upsert* es `(finishId, code)`. */
  findByFinishIdAndCode(finishId: string, code: string): Promise<Color | null>
  save(color: Color): Promise<void>
}

export interface AccessoryWriteRepository {
  findByCode(code: string): Promise<Accessory | null>
  save(accessory: Accessory): Promise<void>
}

/**
 * Consultas de uso del catálogo vivo, para que la desactivación no deje referencias colgando.
 *
 * Una serie con tarifa publicada y vigente tiene precio vivo: no se archiva hasta cerrar la tarifa.
 * Un acabado o un accesorio que una serie no archivada sigue permitiendo está en uso: primero se
 * quita de la serie. Un color no tiene guarda: es una opción opcional dentro de su acabado.
 */
export interface CatalogUsageReader {
  seriesHasTariffInForce(seriesId: string, instant: Date): Promise<boolean>
  isFinishAllowedByLiveSeries(finishId: string): Promise<boolean>
  isAccessoryAllowedByLiveSeries(accessoryId: string): Promise<boolean>
  finishHasLiveColors(finishId: string): Promise<boolean>
}
