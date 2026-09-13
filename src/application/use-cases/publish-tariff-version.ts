/**
 * Caso de uso: publicar una versión de tarifa desde el panel (ADR-0003, rev. 2 §8-§11).
 *
 * Publicar es la única vía para que una tarifa dé precio automático. Antes de escribir, el caso de
 * uso proyecta el conjunto publicado —la candidata publicada y, si la serie tenía una versión
 * publicada con vigencia abierta, esa predecesora cerrada en el `validFrom` de la candidata— y
 * aplica las invariantes de catálogo, en este orden:
 *
 * 1. el conjunto proyectado no se solapa (ni con una publicada de vigencia cerrada, ni con una
 *    predecesora abierta que empezase después o a la vez que la candidata, ni con más de una
 *    publicada abierta en la serie): `AmbiguousTariffError`, 409;
 * 2. una versión sin tabla de precios no se publica (`EmptyPriceTableError`): la serie quedaría con
 *    una tarifa vigente que no da precio, así que se queda en borrador y pasa a presupuesto manual
 *    (ADR-0027 §4).
 *
 * Las dos saltan **antes** de escribir: las filas quedan intactas (hallazgo N5 de CIF-78). Después,
 * la publicación y el cierre viajan en **una sola escritura atómica** (`savePublishTransition`), así
 * que un fallo no deja la serie sin tarifa vigente ni a medias: o quedan las dos filas o ninguna.
 *
 * La predecesora conserva el estado `published`: es el registro histórico del precio que estuvo
 * vigente (decisión 6: los presupuestos emitidos guardan su `tariffVersionId` y su instantánea, así
 * que ni publicar ni cerrar reescribe precios ya emitidos).
 */

import {
  projectPublishedSet,
  type PricingStrategy,
  type TariffVersion,
} from '@/domain/catalog/tariff-version'
import {
  EmptyPriceTableError,
  InvalidTariffVersionError,
  ResourceNotFoundError,
} from '@/domain/shared/errors'

import type { Clock } from '@/application/ports/clock'
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'

export interface PublishTariffVersionDeps {
  readonly tariffVersionRepository: TariffVersionRepository
  readonly clock: Clock
}

export interface PublishTariffVersionInput {
  readonly tariffVersionId: string
}

/** La predecesora de vigencia abierta que la publicación cierra, si la había. */
export interface ClosedTariffVersionOutput {
  readonly id: string
  readonly versionNumber: number
  readonly status: 'published'
  readonly validFrom: string
  readonly validUntil: string
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
  /**
   * La versión que deja de estar vigente en el `validFrom` de esta, o `null` si la serie no tenía
   * ninguna publicada con vigencia abierta. El panel lo usa para decir qué precio deja de aplicar y
   * desde cuándo (§12).
   */
  readonly closedPredecessor: ClosedTariffVersionOutput | null
}

export function toPublishedTariffVersionOutput(
  version: TariffVersion,
  closedPredecessor: TariffVersion | null = null,
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
    closedPredecessor:
      closedPredecessor === null ? null : toClosedTariffVersionOutput(closedPredecessor),
  }
}

function toClosedTariffVersionOutput(version: TariffVersion): ClosedTariffVersionOutput {
  const { validUntil } = version.validity

  if (validUntil === null) {
    throw new InvalidTariffVersionError(
      `La predecesora "${version.id}" no está cerrada y no se puede serializar como tal`,
    )
  }

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: 'published',
    validFrom: version.validity.validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
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

  // Republicar es idempotente: no hay transición que aplicar ni fila que escribir. Una versión ya
  // publicada y cerrada tampoco se reabre ni se vuelve a cerrar.
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

  // Invariantes ANTES de escribir: si el conjunto proyectado se solapa o la candidata no es
  // posterior a la predecesora abierta, `AmbiguousTariffError` sale de aquí y no se escribe nada.
  const { successor, predecessor } = projectPublishedSet(withCandidate, candidate)

  const priceTable = await repository.findPriceTableByVersionId(candidate.id)

  if (priceTable === null) {
    throw new EmptyPriceTableError(
      `La versión ${candidate.versionNumber} de la serie "${candidate.seriesId}" no tiene tabla de precios; cárgala antes de publicarla`,
    )
  }

  // Una sola escritura atómica: la publicación de la sucesora y el cierre de la predecesora.
  await repository.savePublishTransition({ successor, predecessor })

  return toPublishedTariffVersionOutput(successor, predecessor)
}
