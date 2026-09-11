/**
 * Serie de puertas: la unidad de catálogo que agrupa modelo, tamaño máximo y compatibilidades.
 *
 * Cada serie define su rango de medidas (con el **tamaño máximo** que dispara el paso a
 * presupuesto manual), qué acabados y accesorios admite, y su estado editorial.
 */

import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertValidDate,
} from '@/domain/shared/assertions'
import { InvalidSeriesTransitionError } from '@/domain/shared/errors'

import type { LocalizedText } from './catalog-text'
import { assertCatalogCode, assertCatalogSlug } from './identifiers'
import { SizeRange, type Dimensions, type SizeAssessment } from './measurement'

export const SERIES_STATUSES = ['draft', 'published', 'archived'] as const

export type SeriesStatus = (typeof SERIES_STATUSES)[number]

const ALLOWED_SERIES_TRANSITIONS: Record<SeriesStatus, readonly SeriesStatus[]> = {
  draft: ['published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
}

export interface DoorSeriesProps {
  readonly id: string
  readonly code: string
  readonly slug: string
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly status: SeriesStatus
  readonly sizeRange: SizeRange
  readonly allowedFinishIds: readonly string[]
  readonly allowedAccessoryIds: readonly string[]
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class DoorSeries {
  readonly id: string
  readonly code: string
  readonly slug: string
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly status: SeriesStatus
  readonly sizeRange: SizeRange
  readonly allowedFinishIds: readonly string[]
  readonly allowedAccessoryIds: readonly string[]
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: DoorSeriesProps) {
    this.id = props.id
    this.code = props.code
    this.slug = props.slug
    this.name = props.name
    this.description = props.description
    this.status = props.status
    this.sizeRange = props.sizeRange
    this.allowedFinishIds = props.allowedFinishIds
    this.allowedAccessoryIds = props.allowedAccessoryIds
    this.sortOrder = props.sortOrder
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  static create(props: DoorSeriesProps): DoorSeries {
    assertNonEmptyString(props.id, 'id')
    assertCatalogCode(props.code, 'code')
    assertCatalogSlug(props.slug, 'slug')
    assertIntegerInRange(props.sortOrder, 'sortOrder', 0, 10_000)
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    for (const finishId of props.allowedFinishIds) {
      assertNonEmptyString(finishId, 'allowedFinishIds')
    }

    for (const accessoryId of props.allowedAccessoryIds) {
      assertNonEmptyString(accessoryId, 'allowedAccessoryIds')
    }

    return new DoorSeries({
      ...props,
      allowedFinishIds: [...props.allowedFinishIds],
      allowedAccessoryIds: [...props.allowedAccessoryIds],
    })
  }

  get maxWidthMm(): number {
    return this.sizeRange.maxWidthMm
  }

  get maxHeightMm(): number {
    return this.sizeRange.maxHeightMm
  }

  isPublished(): boolean {
    return this.status === 'published'
  }

  allowsFinish(finishId: string): boolean {
    return this.allowedFinishIds.includes(finishId)
  }

  allowsAccessory(accessoryId: string): boolean {
    return this.allowedAccessoryIds.includes(accessoryId)
  }

  /** Evalúa la medida contra el tamaño máximo de la serie. */
  assessSize(dimensions: Dimensions): SizeAssessment {
    return this.sizeRange.assess(dimensions)
  }

  /**
   * `true` cuando la medida obliga a presupuesto manual: supera el máximo de la serie (o no
   * llega al mínimo permitido). El configurador lo usa para no ofrecer precio automático.
   */
  requiresManualQuoteFor(dimensions: Dimensions): boolean {
    const assessment = this.sizeRange.assess(dimensions)

    return assessment.status === 'out_of_range' && assessment.requiresManualQuote
  }

  withStatus(next: SeriesStatus, at: Date): DoorSeries {
    if (!ALLOWED_SERIES_TRANSITIONS[this.status].includes(next)) {
      throw new InvalidSeriesTransitionError(
        `La serie "${this.code}" no puede pasar de "${this.status}" a "${next}"`,
      )
    }

    assertValidDate(at, 'updatedAt')

    return new DoorSeries({ ...this, status: next, updatedAt: at })
  }

  publish(at: Date): DoorSeries {
    return this.withStatus('published', at)
  }

  archive(at: Date): DoorSeries {
    return this.withStatus('archived', at)
  }

  restore(at: Date): DoorSeries {
    return this.withStatus('draft', at)
  }
}
