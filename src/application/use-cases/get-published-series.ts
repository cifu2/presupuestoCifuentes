/**
 * Caso de uso: catálogo de series publicado (configurador).
 *
 * Devuelve solo series publicadas, con los textos resueltos al idioma pedido y los identificadores
 * de sus acabados y accesorios compatibles para que el frontend no tenga que cruzar listas.
 */

import type { Locale } from '@/domain/catalog/locale'
import type { DoorSeries } from '@/domain/catalog/series'
import type { SeriesRepository } from '@/application/ports/series-repository'

export interface SizeRangeOutput {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
}

export interface CatalogSeriesSummary {
  readonly id: string
  readonly code: string
  readonly slug: string
  readonly name: string
  readonly description: string | null
  readonly sizeRange: SizeRangeOutput
  readonly allowedFinishIds: readonly string[]
  readonly allowedAccessoryIds: readonly string[]
}

export interface GetPublishedSeriesDeps {
  readonly seriesRepository: SeriesRepository
}

export interface GetPublishedSeriesInput {
  readonly locale: Locale
}

export function toCatalogSeriesSummary(series: DoorSeries, locale: Locale): CatalogSeriesSummary {
  return {
    id: series.id,
    code: series.code,
    slug: series.slug,
    name: series.name.resolve(locale),
    description: series.description === null ? null : series.description.resolve(locale),
    sizeRange: {
      minWidthMm: series.sizeRange.minWidthMm,
      maxWidthMm: series.sizeRange.maxWidthMm,
      minHeightMm: series.sizeRange.minHeightMm,
      maxHeightMm: series.sizeRange.maxHeightMm,
    },
    allowedFinishIds: [...series.allowedFinishIds],
    allowedAccessoryIds: [...series.allowedAccessoryIds],
  }
}

export async function getPublishedSeries(
  deps: GetPublishedSeriesDeps,
  input: GetPublishedSeriesInput,
): Promise<readonly CatalogSeriesSummary[]> {
  const series = await deps.seriesRepository.listPublished()

  return series.map((item) => toCatalogSeriesSummary(item, input.locale))
}
