/**
 * Caso de uso: publicar una versión de tarifa desde el panel (ADR-0003).
 *
 * Publicar es la única vía para que una tarifa dé precio automático. Antes de escribir, el caso de
 * uso carga las versiones de la serie y aplica la invariante de catálogo: dos versiones publicadas
 * de la misma serie no pueden solaparse. Si se solapan lanza `AmbiguousTariffError` (409 en el
 * borde) y **no** toca la base de datos (hallazgo N5 de CIF-78).
 */

import {
  assertNoOverlappingPublishedTariffs,
  type PricingStrategy,
  type TariffVersion,
} from '@/domain/catalog/tariff-version'
import { InvalidTariffVersionError, ResourceNotFoundError } from '@/domain/shared/errors'

import type { Clock } from '@/application/ports/clock'
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'

export interface PublishTariffVersionDeps {
  readonly tariffVersionRepository: TariffVersionRepository
  readonly clock: Clock
}

export interface PublishTariffVersionInput {
  readonly tariffVersionId: string
}

export interface PublishedTariffVersionOutput {
  readonly id: string
  readonly seriesId: string
  readonly versionNumber: number
  readonly status: 'published'
  readonly strategy: PricingStrategy
  readonly validFrom: string
  readonly validUntil: string | null
  readonly currency: string
  readonly taxRatePercent: string
  readonly publishedAt: string
}

export function toPublishedTariffVersionOutput(
  version: TariffVersion,
): PublishedTariffVersionOutput {
  if (!version.isPublished() || version.publishedAt === null) {
    throw new InvalidTariffVersionError(
      `La versión "${version.id}" no está publicada y no se puede serializar como tal`,
    )
  }

  return {
    id: version.id,
    seriesId: version.seriesId,
    versionNumber: version.versionNumber,
    status: 'published',
    strategy: version.strategy,
    validFrom: version.validity.validFrom.toISOString(),
    validUntil: version.validity.validUntil?.toISOString() ?? null,
    currency: version.currency,
    taxRatePercent: version.taxRatePercent,
    publishedAt: version.publishedAt.toISOString(),
  }
}

export async function publishTariffVersion(
  deps: PublishTariffVersionDeps,
  input: PublishTariffVersionInput,
): Promise<PublishedTariffVersionOutput> {
  const repository = deps.tariffVersionRepository
  const version = await repository.findById(input.tariffVersionId)

  if (version === null) {
    throw new ResourceNotFoundError(`No existe la versión de tarifa "${input.tariffVersionId}"`)
  }

  // Republicar es idempotente: no hay transición que aplicar ni fila que escribir.
  if (version.status === 'published') {
    return toPublishedTariffVersionOutput(version)
  }

  const candidate = version.publish(deps.clock.now())
  const seriesVersions = await repository.listBySeriesId(candidate.seriesId)
  const withCandidate = seriesVersions.some(
    (candidateVersion) => candidateVersion.id === candidate.id,
  )
    ? seriesVersions.map((candidateVersion) =>
        candidateVersion.id === candidate.id ? candidate : candidateVersion,
      )
    : [...seriesVersions, candidate]

  // Invariante ANTES de escribir: si el candidato se solapa con otra publicada, `AmbiguousTariffError`
  // sale de aquí y la fila se queda como estaba.
  assertNoOverlappingPublishedTariffs(withCandidate)

  await repository.save(candidate)

  return toPublishedTariffVersionOutput(candidate)
}
