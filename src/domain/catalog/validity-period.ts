/**
 * Vigencia de una versión de tarifa (ADR-0003).
 *
 * Intervalo semiabierto `[validFrom, validUntil)`: una tarifa que termina el 2026-12-31 sigue
 * siendo vigente ese día y deja de serlo al empezar el 2027-01-01. `validUntil` nulo significa
 * vigencia abierta.
 *
 * Una vigencia abierta se cierra con `close`, que es como publicar una sucesora cierra a su
 * predecesora sin dejar hueco ni solape (ADR-0003 rev. 2, §8).
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

  /**
   * Cierra la vigencia en `validUntil` (pasa a `[validFrom, validUntil)`).
   *
   * Solo se cierra una vigencia **abierta** y con una fecha **posterior** a `validFrom`: cerrar
   * hacia atrás —o en el propio inicio— dejaría un intervalo invertido o vacío, que es justo lo que
   * el intervalo semiabierto no admite. Volver a cerrar una vigencia ya cerrada tampoco mueve su
   * fin, así que se rechaza en vez de reescribirlo en silencio.
   */
  close(validUntil: Date): ValidityPeriod {
    if (this.validUntil !== null) {
      throw new InvalidValidityPeriodError(
        'La vigencia ya está cerrada; no se puede volver a cerrar',
      )
    }

    return ValidityPeriod.of(this.validFrom, validUntil)
  }
}
