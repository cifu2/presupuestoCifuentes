/**
 * Caso de uso: alta o actualización idempotente de una serie por `code` (CIF-126a, ADR-0027).
 *
 * Es la puerta de escritura compartida entre el panel (fase 3, CIF-243) y el importador (CIF-126b):
 * llamar dos veces con el mismo `code` deja la misma fila, no una nueva. La identidad la fija el
 * `code`; el `slug` es único y su conflicto con otra serie lanza `ConflictError`.
 *
 * El estado editorial no se adivina: una serie nueva nace en borrador y, si el llamante pide otro
 * estado, la transición la valida el dominio (`withStatus`).
 */

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { SizeRange } from '@/domain/catalog/measurement'
import { DoorSeries } from '@/domain/catalog/series'
import { ConflictError } from '@/domain/shared/errors'

import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { SeriesWriteRepository } from '@/application/ports/catalog-write-repositories'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { LocalizedTextInput } from '@/domain/catalog/catalog-text'

import { toSeriesWriteOutput, type SeriesWriteOutput } from './catalog-write-output'
import type { MeasurementLimitsInput } from './catalog-write-input'

export interface UpsertSeriesDeps {
  readonly seriesWriteRepository: SeriesWriteRepository
  readonly idGenerator: IdGenerator
  readonly clock: Clock
}

export interface UpsertSeriesInput {
  readonly code: string
  readonly slug: string
  readonly name: LocalizedTextInput
  readonly description?: LocalizedTextInput | null
  readonly limits: MeasurementLimitsInput
  readonly allowedFinishIds?: readonly string[]
  readonly allowedAccessoryIds?: readonly string[]
  readonly sortOrder?: number
  readonly status?: CatalogStatus
}

export async function upsertSeries(
  deps: UpsertSeriesDeps,
  input: UpsertSeriesInput,
): Promise<SeriesWriteOutput> {
  const repository = deps.seriesWriteRepository
  const existing = await repository.findByCode(input.code)
  const slugOwner = await repository.findBySlug(input.slug)

  if (slugOwner !== null && slugOwner.id !== existing?.id) {
    throw new ConflictError(
      `El slug "${input.slug}" ya lo usa la serie "${slugOwner.code}"; elige otro`,
    )
  }

  const now = deps.clock.now()
  const description =
    input.description === undefined
      ? (existing?.description ?? null)
      : input.description === null
        ? null
        : LocalizedText.of(input.description)

  const defined = DoorSeries.create({
    id: existing?.id ?? deps.idGenerator.nextId(),
    code: input.code,
    slug: input.slug,
    name: LocalizedText.of(input.name),
    description,
    status: existing?.status ?? 'draft',
    sizeRange: SizeRange.of(input.limits),
    allowedFinishIds: input.allowedFinishIds ?? existing?.allowedFinishIds ?? [],
    allowedAccessoryIds: input.allowedAccessoryIds ?? existing?.allowedAccessoryIds ?? [],
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  const series =
    input.status === undefined || input.status === defined.status
      ? defined
      : defined.withStatus(input.status, now)

  await repository.save(series)

  return toSeriesWriteOutput(series)
}
