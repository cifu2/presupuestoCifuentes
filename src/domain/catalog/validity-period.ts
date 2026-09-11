/**
 * Vigencia de una versión de tarifa (ADR-0003).
 *
 * Intervalo semiabierto `[validFrom, validUntil)`: una tarifa que termina el 2026-12-31 sigue
 * siendo vigente ese día y deja de serlo al empezar el 2027-01-01. `validUntil` nulo significa
 * vigencia abierta.
 */

import { assertValidDate } from '@/domain/shared/assertions'
import { InvalidValidityPeriodError } from '@/domain/shared/errors'

export class ValidityPeriod {
  readonly validFrom: Date
  readonly validUntil: Date | null

  private constructor(validFrom: Date, validUntil: Date | null) {
    this.validFrom = validFrom
    this.validUntil = validUntil
  }

  static of(validFrom: Date, validUntil: Date | null = null): ValidityPeriod {
    assertValidDate(validFrom, 'validFrom')

    if (validUntil !== null) {
      assertValidDate(validUntil, 'validUntil')

      if (validUntil.getTime() <= validFrom.getTime()) {
        throw new InvalidValidityPeriodError(
          'validUntil debe ser posterior a validFrom; si la tarifa no caduca, deja validUntil vacío',
        )
      }
    }

    return new ValidityPeriod(validFrom, validUntil)
  }

  contains(instant: Date): boolean {
    if (instant.getTime() < this.validFrom.getTime()) {
      return false
    }

    return this.validUntil === null || instant.getTime() < this.validUntil.getTime()
  }

  overlaps(other: ValidityPeriod): boolean {
    const thisEnd = this.validUntil?.getTime() ?? Number.POSITIVE_INFINITY
    const otherEnd = other.validUntil?.getTime() ?? Number.POSITIVE_INFINITY

    return this.validFrom.getTime() < otherEnd && other.validFrom.getTime() < thisEnd
  }

  isOpenEnded(): boolean {
    return this.validUntil === null
  }
}
