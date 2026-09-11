/**
 * Medidas y tamaño máximo por serie.
 *
 * Regla de negocio del MVP: cada serie define un rango de medidas (mínimo y **máximo** por
 * ancho y alto). Una configuración por encima del máximo no recibe precio automático: pasa a
 * presupuesto manual (ADR-0003). Las medidas son milímetros enteros.
 */

import { assertIntegerInRange } from '@/domain/shared/assertions'
import { InvalidMeasurementError, InvalidSizeRangeError } from '@/domain/shared/errors'

export const MIN_DIMENSION_MM = 1
export const MAX_DIMENSION_MM = 10_000

const SQUARE_MILLIMETRES_PER_MILLI_SQUARE_METRE = 1_000n

export class Dimensions {
  readonly widthMm: number
  readonly heightMm: number

  private constructor(widthMm: number, heightMm: number) {
    this.widthMm = widthMm
    this.heightMm = heightMm
  }

  static of(widthMm: number, heightMm: number): Dimensions {
    assertPositiveDimension(widthMm, 'widthMm')
    assertPositiveDimension(heightMm, 'heightMm')

    return new Dimensions(widthMm, heightMm)
  }

  get areaInSquareMillimetres(): bigint {
    return BigInt(this.widthMm) * BigInt(this.heightMm)
  }

  /**
   * Superficie en milésimas de m² (m² × 1000) redondeada **al alza**, tal y como exige ADR-0003.
   * Sin coma flotante: 1.000 mm² = 1 milésima de m².
   */
  areaInMilliSquareMetres(): bigint {
    const oneBelowCeiling = SQUARE_MILLIMETRES_PER_MILLI_SQUARE_METRE - 1n

    return (
      (this.areaInSquareMillimetres + oneBelowCeiling) / SQUARE_MILLIMETRES_PER_MILLI_SQUARE_METRE
    )
  }

  equals(other: Dimensions): boolean {
    return this.widthMm === other.widthMm && this.heightMm === other.heightMm
  }
}

function assertPositiveDimension(value: number, field: string): void {
  if (!Number.isInteger(value) || value < MIN_DIMENSION_MM || value > MAX_DIMENSION_MM) {
    throw new InvalidMeasurementError(
      `${field} debe ser un entero entre ${MIN_DIMENSION_MM} y ${MAX_DIMENSION_MM} mm; recibido ${value}`,
    )
  }
}

export type SizeViolation =
  'width_below_minimum' | 'width_above_maximum' | 'height_below_minimum' | 'height_above_maximum'

export type SizeAssessment =
  | { readonly status: 'within_range' }
  | {
      readonly status: 'out_of_range'
      readonly violations: readonly SizeViolation[]
      /** Superar el máximo (o no llegar al mínimo) obliga a presupuesto manual. */
      readonly requiresManualQuote: boolean
    }

export interface SizeRangeInput {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
}

export class SizeRange {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number

  private constructor(input: SizeRangeInput) {
    this.minWidthMm = input.minWidthMm
    this.maxWidthMm = input.maxWidthMm
    this.minHeightMm = input.minHeightMm
    this.maxHeightMm = input.maxHeightMm
  }

  static of(input: SizeRangeInput): SizeRange {
    assertPositiveDimension(input.minWidthMm, 'minWidthMm')
    assertPositiveDimension(input.maxWidthMm, 'maxWidthMm')
    assertPositiveDimension(input.minHeightMm, 'minHeightMm')
    assertPositiveDimension(input.maxHeightMm, 'maxHeightMm')

    if (input.minWidthMm > input.maxWidthMm) {
      throw new InvalidSizeRangeError(
        `El ancho mínimo (${input.minWidthMm} mm) no puede superar el máximo (${input.maxWidthMm} mm)`,
      )
    }

    if (input.minHeightMm > input.maxHeightMm) {
      throw new InvalidSizeRangeError(
        `El alto mínimo (${input.minHeightMm} mm) no puede superar el máximo (${input.maxHeightMm} mm)`,
      )
    }

    return new SizeRange(input)
  }

  /** Rango sin mínimo específico (mínimo = 1 mm), el caso habitual del catálogo. */
  static withMaximum(maxWidthMm: number, maxHeightMm: number): SizeRange {
    return SizeRange.of({
      minWidthMm: MIN_DIMENSION_MM,
      maxWidthMm,
      minHeightMm: MIN_DIMENSION_MM,
      maxHeightMm,
    })
  }

  assess(dimensions: Dimensions): SizeAssessment {
    const violations: SizeViolation[] = []

    if (dimensions.widthMm < this.minWidthMm) {
      violations.push('width_below_minimum')
    }
    if (dimensions.widthMm > this.maxWidthMm) {
      violations.push('width_above_maximum')
    }
    if (dimensions.heightMm < this.minHeightMm) {
      violations.push('height_below_minimum')
    }
    if (dimensions.heightMm > this.maxHeightMm) {
      violations.push('height_above_maximum')
    }

    if (violations.length === 0) {
      return { status: 'within_range' }
    }

    return {
      status: 'out_of_range',
      violations,
      requiresManualQuote: violations.some((violation) => violation.endsWith('above_maximum')),
    }
  }

  allows(dimensions: Dimensions): boolean {
    return this.assess(dimensions).status === 'within_range'
  }
}

export function assertValidMeasure(value: number, field: string): void {
  assertIntegerInRange(value, field, MIN_DIMENSION_MM, MAX_DIMENSION_MM)
}
