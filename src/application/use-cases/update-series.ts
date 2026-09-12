/**
 * Caso de uso: edición parcial de una serie por id (CIF-126a).
 *
 * Es el camino del panel para el detalle de serie: límites de medida, slug, orden, vínculos y textos
 * idioma a idioma (`name`/`description` se fusionan con lo ya guardado). El `code` no se edita: es la
 * identidad del *upsert* y el `@@unique` del catálogo. Los conflictos de `slug` con otra serie y la
 * validación de las transiciones de estado los resuelve el dominio.
 */

import { mergeLocalizedText } from '@/domain/catalog/catalog-text'
import type { LocalizedText } from '@/domain/catalog/catalog-text'
import { SizeRange } from '@/domain/catalog/measurement'
import { DoorSeries } from '@/domain/catalog/series'
import { ConflictError, ResourceNotFoundError } from '@/domain/shared/errors'

import type { SeriesRepository } from '@/application/ports/series-repository'
import type { SeriesWriteRepository } from '@/application/ports/catalog-write-repositories'
import type { Clock } from '@/application/ports/clock'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { LocalizedTextPatch, MeasurementLimitsInput } from './catalog-write-input'

import { toSeriesWriteOutput, type SeriesWriteOutput } from './catalog-write-output'

export interface UpdateSeriesDeps {
  readonly seriesRepository: SeriesRepository
  readonly seriesWriteRepository: SeriesWriteRepository
  readonly clock: Clock
}

export interface UpdateSeriesInput {
  readonly seriesId: string
  readonly slug?: string
  readonly name?: LocalizedTextPatch
  /** Ausente = no tocar; `null` = dejar la serie sin descripción; objeto = fusionar idioma a idioma. */
  readonly description?: LocalizedTextPatch | null
  readonly limits?: MeasurementLimitsInput
  readonly allowedFinishIds?: readonly string[]
  readonly allowedAccessoryIds?: readonly string[]
  readonly sortOrder?: number
  readonly status?: CatalogStatus
}

export async function updateSeries(
  deps: UpdateSeriesDeps,
  input: UpdateSeriesInput,
): Promise<SeriesWriteOutput> {
  const current = await deps.seriesRepository.findById(input.seriesId)

  if (current === null) {
    throw new ResourceNotFoundError(`No existe la serie "${input.seriesId}"`)
  }

  if (input.slug !== undefined && input.slug !== current.slug) {
    const slugOwner = await deps.seriesWriteRepository.findBySlug(input.slug)

    if (slugOwner !== null && slugOwner.id !== current.id) {
      throw new ConflictError(`El slug "${input.slug}" ya lo usa la serie "${slugOwner.code}"`)
    }
  }

  const now = deps.clock.now()
  const defined = DoorSeries.create({
    id: current.id,
    code: current.code,
    slug: input.slug ?? current.slug,
    name: input.name === undefined ? current.name : mergeLocalizedText(current.name, input.name),
    description: mergeDescription(current.description, input.description),
    sizeRange: input.limits === undefined ? current.sizeRange : SizeRange.of(input.limits),
    allowedFinishIds: input.allowedFinishIds ?? current.allowedFinishIds,
    allowedAccessoryIds: input.allowedAccessoryIds ?? current.allowedAccessoryIds,
    sortOrder: input.sortOrder ?? current.sortOrder,
    status: current.status,
    createdAt: current.createdAt,
    updatedAt: now,
  })

  const series =
    input.status === undefined || input.status === defined.status
      ? defined
      : defined.withStatus(input.status, now)

  await deps.seriesWriteRepository.save(series)

  return toSeriesWriteOutput(series)
}

function mergeDescription(
  current: LocalizedText | null,
  patch: LocalizedTextPatch | null | undefined,
): LocalizedText | null {
  if (patch === undefined) {
    return current
  }

  if (patch === null) {
    return null
  }

  return mergeLocalizedText(current, patch)
}
