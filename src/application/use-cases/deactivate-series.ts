/**
 * Caso de uso: desactivar (archivar) una serie (CIF-126a).
 *
 * Desactivar nunca borra: la serie pasa a `archived` y el configurador deja de ofrecerla, pero los
 * presupuestos ya emitidos conservan su serie. La guarda es el precio vivo: si la serie tiene una
 * tarifa publicada y vigente, archivarla dejaría una tarifa en vigor que ya no pertenece a ninguna
 * serie ofrecida; el propietario debe archivar antes esa tarifa (`SeriesInUseError`).
 *
 * Es idempotente: desactivar una serie ya archivada devuelve su estado sin escribir.
 */

import { ResourceNotFoundError, SeriesInUseError } from '@/domain/shared/errors'

import type {
  CatalogUsageReader,
  SeriesWriteRepository,
} from '@/application/ports/catalog-write-repositories'
import type { Clock } from '@/application/ports/clock'
import type { SeriesRepository } from '@/application/ports/series-repository'

import { toSeriesWriteOutput, type SeriesWriteOutput } from './catalog-write-output'

export interface DeactivateSeriesDeps {
  readonly seriesRepository: SeriesRepository
  readonly seriesWriteRepository: SeriesWriteRepository
  readonly catalogUsageReader: CatalogUsageReader
  readonly clock: Clock
}

export interface DeactivateSeriesInput {
  readonly seriesId: string
}

export async function deactivateSeries(
  deps: DeactivateSeriesDeps,
  input: DeactivateSeriesInput,
): Promise<SeriesWriteOutput> {
  const current = await deps.seriesRepository.findById(input.seriesId)

  if (current === null) {
    throw new ResourceNotFoundError(`No existe la serie "${input.seriesId}"`)
  }

  if (current.status === 'archived') {
    return toSeriesWriteOutput(current)
  }

  const now = deps.clock.now()

  if (await deps.catalogUsageReader.seriesHasTariffInForce(current.id, now)) {
    throw new SeriesInUseError(
      `La serie "${current.code}" tiene una tarifa publicada y vigente; archívala antes de desactivar la serie`,
    )
  }

  const archived = current.archive(now)

  await deps.seriesWriteRepository.save(archived)

  return toSeriesWriteOutput(archived)
}
