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
  assertValidDate,
  normalizePercentage,
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
    const taxRatePercent = normalizePercentage(props.taxRatePercent, 'taxRatePercent')

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

    return new TariffVersion({ ...props, taxRatePercent })
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

  /**
   * Cierra la vigencia de una versión **publicada** (ADR-0003 rev. 2, §8).
   *
   * Conserva el estado `published` y su `publishedAt`: la predecesora cerrada es el registro
   * histórico del precio que estuvo vigente, no se archiva ni se borra. El cierre exige una fecha
   * posterior a su `validFrom` (lo valida `ValidityPeriod.close`) y actualiza `updatedAt` al
   * instante de la operación.
   */
  closeValidity(validUntil: Date, at: Date): TariffVersion {
    if (!this.isPublished()) {
      throw new InvalidTariffVersionError(
        `Solo se cierra la vigencia de una versión publicada; la versión "${this.id}" está en estado "${this.status}"`,
      )
    }

    assertValidDate(at, 'updatedAt')

    return new TariffVersion({
      ...this,
      validity: this.validity.close(validUntil),
      updatedAt: at,
    })
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
 *
 * La llama el flujo de publicación del panel (`publishTariffVersion`) **antes** de escribir en base
 * de datos; si se solapa lanza `AmbiguousTariffError` y la API responde 409 sin tocar la fila. La
 * comprobación de lectura (`selectTariffInForce`) se mantiene como última red.
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

/**
 * Proyección del conjunto publicado al publicar la candidata (ADR-0003 rev. 2, §8-§9).
 *
 * El resultado es lo que quedará publicado: la candidata y, cerrada en su `validFrom`, la versión
 * publicada de la misma serie que seguía con vigencia **abierta** y empezaba antes. El intervalo es
 * semiabierto, así que la predecesora deja de estar vigente justo cuando entra la sucesora: ni
 * hueco ni solape.
 *
 * La invariante se evalúa sobre ese conjunto proyectado y **antes** de escribir nada; si el
 * propietario no puede publicar, lanza `AmbiguousTariffError` (409) sin tocar ninguna fila:
 *
 * - solape con una versión publicada de vigencia **cerrada**;
 * - candidata con `validFrom` anterior o igual al de la predecesora abierta (cerrar hacia atrás
 *   sería inválido);
 * - más de una versión publicada con vigencia abierta en la misma serie.
 */
export interface PublishedSetProjection {
  /** La candidata, ya publicada, que queda vigente a partir de su `validFrom`. */
  readonly successor: TariffVersion
  /** La predecesora abierta cerrada en el `validFrom` de la sucesora, o `null` si no había ninguna. */
  readonly predecessor: TariffVersion | null
}

export function projectPublishedSet(
  versions: readonly TariffVersion[],
  candidate: TariffVersion,
): PublishedSetProjection {
  if (!candidate.isPublished()) {
    throw new InvalidTariffVersionError(
      `La versión "${candidate.id}" tiene que estar publicada para proyectar el conjunto publicado`,
    )
  }

  const others = versions.filter(
    (version) =>
      version.isPublished() &&
      version.seriesId === candidate.seriesId &&
      version.id !== candidate.id,
  )
  const openPublished = others.filter((version) => version.validity.isOpenEnded())

  if (openPublished.length > 1) {
    throw new AmbiguousTariffError(
      `Hay ${openPublished.length} versiones publicadas de la serie "${candidate.seriesId}" con vigencia abierta; solo puede haber una`,
    )
  }

  const openPredecessor = openPublished[0] ?? null
  let predecessor: TariffVersion | null = null

  if (openPredecessor !== null) {
    if (candidate.validity.validFrom.getTime() <= openPredecessor.validity.validFrom.getTime()) {
      throw new AmbiguousTariffError(
        `La versión ${candidate.versionNumber} de la serie "${candidate.seriesId}" entra en vigor antes o a la vez que la versión publicada ${openPredecessor.versionNumber}, con vigencia abierta; el cierre tiene que ser posterior`,
      )
    }

    predecessor = openPredecessor.closeValidity(candidate.validity.validFrom, candidate.updatedAt)
  }

  const projected = others.map((version) =>
    predecessor !== null && version.id === predecessor.id ? predecessor : version,
  )

  assertNoOverlappingPublishedTariffs([...projected, candidate])

  return { successor: candidate, predecessor }
}
