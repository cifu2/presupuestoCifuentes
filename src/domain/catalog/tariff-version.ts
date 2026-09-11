/**
 * Versión de tarifa de una serie (ADR-0003).
 *
 * El propietario mantiene varias versiones por serie con su vigencia y estado. En cada momento
 * solo una puede estar vigente; su publicación es el mecanismo para cambiar precios sin tocar
 * código y sin alterar presupuestos ya emitidos (el presupuesto guarda su `tariffVersionId`).
 */

import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertPercentage,
  assertValidDate,
} from '@/domain/shared/assertions'
import { AmbiguousTariffError, InvalidTariffVersionError } from '@/domain/shared/errors'

import { assertCatalogTransition, type CatalogStatus } from './catalog-status'
import { ValidityPeriod } from './validity-period'

export const PRICING_STRATEGIES = ['per_square_metre', 'size_bands', 'fixed'] as const

export type PricingStrategy = (typeof PRICING_STRATEGIES)[number]

export type TariffStatus = CatalogStatus

export interface TariffVersionProps {
  readonly id: string
  readonly seriesId: string
  readonly versionNumber: number
  readonly status: TariffStatus
  readonly strategy: PricingStrategy
  readonly validity: ValidityPeriod
  readonly taxRatePercent: string
  readonly currency: string
  readonly notes: string | null
  readonly publishedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class TariffVersion {
  readonly id: string
  readonly seriesId: string
  readonly versionNumber: number
  readonly status: TariffStatus
  readonly strategy: PricingStrategy
  readonly validity: ValidityPeriod
  readonly taxRatePercent: string
  readonly currency: string
  readonly notes: string | null
  readonly publishedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: TariffVersionProps) {
    this.id = props.id
    this.seriesId = props.seriesId
    this.versionNumber = props.versionNumber
    this.status = props.status
    this.strategy = props.strategy
    this.validity = props.validity
    this.taxRatePercent = props.taxRatePercent
    this.currency = props.currency
    this.notes = props.notes
    this.publishedAt = props.publishedAt
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  static create(props: TariffVersionProps): TariffVersion {
    assertNonEmptyString(props.id, 'id')
    assertNonEmptyString(props.seriesId, 'seriesId')
    assertIntegerInRange(props.versionNumber, 'versionNumber', 1, 100_000)
    assertPercentage(props.taxRatePercent, 'taxRatePercent')

    if (!PRICING_STRATEGIES.includes(props.strategy)) {
      throw new InvalidTariffVersionError(
        `strategy debe ser una de ${PRICING_STRATEGIES.join(', ')}; recibido "${props.strategy}"`,
      )
    }

    assertNonEmptyString(props.currency, 'currency')
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    if (props.publishedAt !== null) {
      assertValidDate(props.publishedAt, 'publishedAt')
    }

    return new TariffVersion({ ...props })
  }

  isPublished(): boolean {
    return this.status === 'published'
  }

  /** Una versión solo da precio si está publicada y su vigencia contiene el instante. */
  isInForceAt(instant: Date): boolean {
    return this.isPublished() && this.validity.contains(instant)
  }

  withStatus(next: TariffStatus, at: Date): TariffVersion {
    assertCatalogTransition(this.status, next)
    assertValidDate(at, 'updatedAt')

    return new TariffVersion({
      ...this,
      status: next,
      publishedAt: next === 'published' ? at : this.publishedAt,
      updatedAt: at,
    })
  }

  publish(at: Date): TariffVersion {
    return this.withStatus('published', at)
  }

  archive(at: Date): TariffVersion {
    return this.withStatus('archived', at)
  }

  restore(at: Date): TariffVersion {
    return this.withStatus('draft', at)
  }
}

/**
 * Devuelve la única versión de tarifa vigente para un instante dado, o `undefined` si no hay
 * ninguna: en ese caso el presupuesto pasa a manual (`no_tariff_in_force`).
 */
export function selectTariffInForce(
  versions: readonly TariffVersion[],
  instant: Date,
): TariffVersion | undefined {
  const inForce = versions.filter((version) => version.isInForceAt(instant))

  if (inForce.length > 1) {
    throw new AmbiguousTariffError(
      `Hay ${inForce.length} versiones de tarifa vigentes para la serie "${inForce[0]?.seriesId ?? 'desconocida'}"; solo puede haber una`,
    )
  }

  return inForce[0]
}

/**
 * Invariante de catálogo: dos versiones publicadas de la misma serie no pueden solaparse.
 * Se comprueba al publicar desde el panel, antes de escribir en base de datos.
 */
export function assertNoOverlappingPublishedTariffs(versions: readonly TariffVersion[]): void {
  const publishedBySeries = new Map<string, TariffVersion[]>()

  for (const version of versions) {
    if (!version.isPublished()) {
      continue
    }

    const published = publishedBySeries.get(version.seriesId) ?? []
    published.push(version)
    publishedBySeries.set(version.seriesId, published)
  }

  for (const published of publishedBySeries.values()) {
    published.forEach((left, index) => {
      for (const right of published.slice(index + 1)) {
        if (left.validity.overlaps(right.validity)) {
          throw new AmbiguousTariffError(
            `Las versiones ${left.versionNumber} y ${right.versionNumber} de la serie "${left.seriesId}" se solapan en el tiempo`,
          )
        }
      }
    })
  }
}
