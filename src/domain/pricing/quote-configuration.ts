/**
 * Configuración de puerta que se presupuesta (entrada del motor de precios).
 *
 * Es la única representación de "lo que el cliente ha elegido". Se congela tal cual en el
 * presupuesto emitido (ADR-0003, precio congelado) y se valida al construirse para que el motor
 * reciba siempre una configuración coherente.
 */

import { assertNonEmptyString } from '@/domain/shared/assertions'
import { InvalidValueError } from '@/domain/shared/errors'

import type { Dimensions } from '@/domain/catalog/measurement'

export const QUOTE_EXTRAS = ['installation', 'shipping', 'urgency'] as const

export type QuoteExtra = (typeof QUOTE_EXTRAS)[number]

export interface QuoteConfigurationProps {
  readonly seriesId: string
  readonly dimensions: Dimensions
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null
}

export interface QuoteConfigurationSnapshot {
  readonly seriesId: string
  readonly widthMm: number
  readonly heightMm: number
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null
}

export class QuoteConfiguration {
  readonly seriesId: string
  readonly dimensions: Dimensions
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null

  private constructor(props: QuoteConfigurationProps) {
    this.seriesId = props.seriesId
    this.dimensions = props.dimensions
    this.finishId = props.finishId
    this.colorId = props.colorId
    this.accessoryIds = props.accessoryIds
    this.extras = props.extras
    this.discountCode = props.discountCode
  }

  static create(props: QuoteConfigurationProps): QuoteConfiguration {
    assertNonEmptyString(props.seriesId, 'seriesId')

    if (props.finishId !== null) {
      assertNonEmptyString(props.finishId, 'finishId')
    }

    if (props.colorId !== null) {
      // Un color pertenece siempre a un acabado: sin acabado no hay color que aplicar.
      if (props.finishId === null) {
        throw new InvalidValueError('Para elegir color hay que elegir antes un acabado')
      }

      assertNonEmptyString(props.colorId, 'colorId')
    }

    const seenAccessories = new Set<string>()

    for (const accessoryId of props.accessoryIds) {
      assertNonEmptyString(accessoryId, 'accessoryIds')

      if (seenAccessories.has(accessoryId)) {
        throw new InvalidValueError(
          `El accesorio "${accessoryId}" está repetido en la configuración`,
        )
      }

      seenAccessories.add(accessoryId)
    }

    const seenExtras = new Set<string>()

    for (const extra of props.extras) {
      if (!QUOTE_EXTRAS.includes(extra)) {
        throw new InvalidValueError(
          `extra debe ser uno de ${QUOTE_EXTRAS.join(', ')}; recibido "${extra}"`,
        )
      }

      if (seenExtras.has(extra)) {
        throw new InvalidValueError(`El extra "${extra}" está repetido en la configuración`)
      }

      seenExtras.add(extra)
    }

    if (props.discountCode !== null) {
      assertNonEmptyString(props.discountCode, 'discountCode')
    }

    return new QuoteConfiguration({
      ...props,
      accessoryIds: [...props.accessoryIds],
      extras: [...props.extras],
    })
  }

  hasExtra(extra: QuoteExtra): boolean {
    return this.extras.includes(extra)
  }

  usesAccessory(accessoryId: string): boolean {
    return this.accessoryIds.includes(accessoryId)
  }

  usesDiscountCode(code: string): boolean {
    return this.discountCode === code
  }

  /** Copia plana e inmutable que se guarda con el presupuesto emitido. */
  toSnapshot(): QuoteConfigurationSnapshot {
    return {
      seriesId: this.seriesId,
      widthMm: this.dimensions.widthMm,
      heightMm: this.dimensions.heightMm,
      finishId: this.finishId,
      colorId: this.colorId,
      accessoryIds: [...this.accessoryIds],
      extras: [...this.extras],
      discountCode: this.discountCode,
    }
  }
}
