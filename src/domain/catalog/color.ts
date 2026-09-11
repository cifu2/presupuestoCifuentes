/**
 * Color de un acabado. Cada color pertenece a un acabado (p. ej. los RAL de un lacado) y puede
 * llevar su código hexadecimal para la vista previa 2D.
 */

import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertValidDate,
} from '@/domain/shared/assertions'
import { InvalidCatalogValueError } from '@/domain/shared/errors'

import type { LocalizedText } from './catalog-text'
import { assertCatalogTransition, type CatalogStatus } from './catalog-status'
import { assertCatalogCode } from './identifiers'

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/

export interface ColorProps {
  readonly id: string
  readonly finishId: string
  readonly code: string
  readonly name: LocalizedText
  readonly hex: string | null
  readonly status: CatalogStatus
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class Color {
  readonly id: string
  readonly finishId: string
  readonly code: string
  readonly name: LocalizedText
  readonly hex: string | null
  readonly status: CatalogStatus
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: ColorProps) {
    this.id = props.id
    this.finishId = props.finishId
    this.code = props.code
    this.name = props.name
    this.hex = props.hex
    this.status = props.status
    this.sortOrder = props.sortOrder
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  static create(props: ColorProps): Color {
    assertNonEmptyString(props.id, 'id')
    assertNonEmptyString(props.finishId, 'finishId')
    assertCatalogCode(props.code, 'code')
    assertIntegerInRange(props.sortOrder, 'sortOrder', 0, 10_000)
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    const hex = props.hex === null ? null : props.hex.trim().toUpperCase()

    if (hex !== null && !HEX_COLOR_PATTERN.test(hex)) {
      throw new InvalidCatalogValueError(`hex debe ser un color "#RRGGBB"; recibido "${props.hex}"`)
    }

    return new Color({ ...props, hex })
  }

  isPublished(): boolean {
    return this.status === 'published'
  }

  withStatus(next: CatalogStatus, at: Date): Color {
    assertCatalogTransition(this.status, next)
    assertValidDate(at, 'updatedAt')

    return new Color({ ...this, status: next, updatedAt: at })
  }

  publish(at: Date): Color {
    return this.withStatus('published', at)
  }

  archive(at: Date): Color {
    return this.withStatus('archived', at)
  }

  restore(at: Date): Color {
    return this.withStatus('draft', at)
  }
}
