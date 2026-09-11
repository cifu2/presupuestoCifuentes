/**
 * Caso de uso: ficha de una serie para el configurador.
 *
 * Resuelve la serie publicada por `slug` y devuelve sus acabados (con los colores publicados de
 * cada uno) y sus accesorios compatibles. Los elementos retirados del catálogo no aparecen.
 */

import type { Locale } from '@/domain/catalog/locale'
import { ResourceNotFoundError } from '@/domain/shared/errors'

import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { SeriesRepository } from '@/application/ports/series-repository'
import { toCatalogSeriesSummary, type CatalogSeriesSummary } from './get-published-series'

export interface CatalogColor {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly hex: string | null
}

export interface CatalogFinish {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly description: string | null
  readonly colors: readonly CatalogColor[]
}

export interface CatalogAccessory {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly description: string | null
  readonly category: string
}

export interface CatalogSeriesDetail {
  readonly series: CatalogSeriesSummary
  readonly finishes: readonly CatalogFinish[]
  readonly accessories: readonly CatalogAccessory[]
}

export interface GetSeriesDetailDeps {
  readonly seriesRepository: SeriesRepository
  readonly finishRepository: FinishRepository
  readonly colorRepository: ColorRepository
  readonly accessoryRepository: AccessoryRepository
}

export interface GetSeriesDetailInput {
  readonly slug: string
  readonly locale: Locale
}

export async function getSeriesDetail(
  deps: GetSeriesDetailDeps,
  input: GetSeriesDetailInput,
): Promise<CatalogSeriesDetail> {
  const series = await deps.seriesRepository.findPublishedBySlug(input.slug)

  if (series === null) {
    throw new ResourceNotFoundError(`No existe ninguna serie publicada con slug "${input.slug}"`)
  }

  const [finishes, accessories] = await Promise.all([
    deps.finishRepository.listPublishedByIds(series.allowedFinishIds),
    deps.accessoryRepository.listPublishedByIds(series.allowedAccessoryIds),
  ])

  const finishedCatalog = await Promise.all(
    finishes.map(async (finish): Promise<CatalogFinish> => {
      const colors = await deps.colorRepository.listPublishedByFinishId(finish.id)

      return {
        id: finish.id,
        code: finish.code,
        name: finish.name.resolve(input.locale),
        description: finish.description === null ? null : finish.description.resolve(input.locale),
        colors: colors.map((color) => ({
          id: color.id,
          code: color.code,
          name: color.name.resolve(input.locale),
          hex: color.hex,
        })),
      }
    }),
  )

  return {
    series: toCatalogSeriesSummary(series, input.locale),
    finishes: finishedCatalog,
    accessories: accessories.map((accessory) => ({
      id: accessory.id,
      code: accessory.code,
      name: accessory.name.resolve(input.locale),
      description:
        accessory.description === null ? null : accessory.description.resolve(input.locale),
      category: accessory.category,
    })),
  }
}
