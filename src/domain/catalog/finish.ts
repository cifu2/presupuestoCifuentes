/**
 * Acabado de puerta (lacado, chapa natural, aluminio…). Elemento de catálogo global que se
 * asocia a las series mediante la tabla de compatibilidad.
 */

import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertValidDate,
} from '@/domain/shared/assertions'

import type { LocalizedText } from './catalog-text'
import { assertCatalogTransition, type CatalogStatus } from './catalog-status'
import { assertCatalogCode } from './identifiers'

export interface FinishProps {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly status: CatalogStatus
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class Finish {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly status: CatalogStatus
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: FinishProps) {
    this.id = props.id
    this.code = props.code
    this.name = props.name
    this.description = props.description
    this.status = props.status
    this.sortOrder = props.sortOrder
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  static create(props: FinishProps): Finish {
    assertNonEmptyString(props.id, 'id')
    assertCatalogCode(props.code, 'code')
    assertIntegerInRange(props.sortOrder, 'sortOrder', 0, 10_000)
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    return new Finish({ ...props })
  }

  isPublished(): boolean {
    return this.status === 'published'
  }

  withStatus(next: CatalogStatus, at: Date): Finish {
    assertCatalogTransition(this.status, next)
    assertValidDate(at, 'updatedAt')

    return new Finish({ ...this, status: next, updatedAt: at })
  }

  publish(at: Date): Finish {
    return this.withStatus('published', at)
  }

  archive(at: Date): Finish {
    return this.withStatus('archived', at)
  }

  restore(at: Date): Finish {
    return this.withStatus('draft', at)
  }
}
