/**
 * Accesorio o herraje configurable (manillas, cierrapuertas, vidrio, ventilación…).
 *
 * El precio concreto de cada accesorio lo define la tarifa vigente de la serie (ADR-0003); aquí
 * solo se modela su identidad, categoría y disponibilidad.
 */

import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertValidDate,
} from '@/domain/shared/assertions'
import { InvalidValueError } from '@/domain/shared/errors'

import type { LocalizedText } from './catalog-text'
import { assertCatalogTransition, type CatalogStatus } from './catalog-status'
import { assertCatalogCode } from './identifiers'

export const ACCESSORY_CATEGORIES = [
  'hardware',
  'closing',
  'glass',
  'ventilation',
  'other',
] as const

export type AccessoryCategory = (typeof ACCESSORY_CATEGORIES)[number]

export interface AccessoryProps {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly category: AccessoryCategory
  readonly status: CatalogStatus
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class Accessory {
  readonly id: string
  readonly code: string
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly category: AccessoryCategory
  readonly status: CatalogStatus
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: AccessoryProps) {
    this.id = props.id
    this.code = props.code
    this.name = props.name
    this.description = props.description
    this.category = props.category
    this.status = props.status
    this.sortOrder = props.sortOrder
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  static create(props: AccessoryProps): Accessory {
    assertNonEmptyString(props.id, 'id')
    assertCatalogCode(props.code, 'code')
    assertIntegerInRange(props.sortOrder, 'sortOrder', 0, 10_000)
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    if (!ACCESSORY_CATEGORIES.includes(props.category)) {
      throw new InvalidValueError(
        `category debe ser una de ${ACCESSORY_CATEGORIES.join(', ')}; recibido "${props.category}"`,
      )
    }

    return new Accessory({ ...props })
  }

  isPublished(): boolean {
    return this.status === 'published'
  }

  withStatus(next: CatalogStatus, at: Date): Accessory {
    assertCatalogTransition(this.status, next)
    assertValidDate(at, 'updatedAt')

    return new Accessory({ ...this, status: next, updatedAt: at })
  }

  publish(at: Date): Accessory {
    return this.withStatus('published', at)
  }

  archive(at: Date): Accessory {
    return this.withStatus('archived', at)
  }

  restore(at: Date): Accessory {
    return this.withStatus('draft', at)
  }
}
