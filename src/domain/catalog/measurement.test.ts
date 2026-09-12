import { describe, expect, it } from 'vitest'

import {
  InvalidMeasurementError,
  InvalidSizeRangeError,
  InvalidValueError,
} from '@/domain/shared/errors'

import { Dimensions, SizeRange, assertValidMeasure } from './measurement'

describe('Dimensions', () => {
  it('acepta medidas en milímetros enteros', () => {
    const dimensions = Dimensions.of(900, 2100)

    expect(dimensions.widthMm).toBe(900)
    expect(dimensions.heightMm).toBe(2100)
  })

  it('rechaza medidas vacías, negativas, decimales o desmesuradas', () => {
    for (const [width, height] of [
      [0, 2100],
      [-1, 2100],
      [900, 0],
      [900.5, 2100],
      [10_001, 2100],
    ] as const) {
      expect(() => Dimensions.of(width, height)).toThrow(InvalidMeasurementError)
    }
  })

  it('calcula la superficie en milímetros cuadrados', () => {
    expect(Dimensions.of(900, 2100).areaInSquareMillimetres).toBe(1_890_000n)
  })

  it('redondea la superficie en m² al alza con tres decimales', () => {
    expect(Dimensions.of(1000, 1000).areaInMilliSquareMetres()).toBe(1000n)
    expect(Dimensions.of(1000, 1001).areaInMilliSquareMetres()).toBe(1001n)
    expect(Dimensions.of(1, 1500).areaInMilliSquareMetres()).toBe(2n)
    expect(Dimensions.of(1, 1).areaInMilliSquareMetres()).toBe(1n)
  })

  it('compara medidas por valor', () => {
    expect(Dimensions.of(900, 2100).equals(Dimensions.of(900, 2100))).toBe(true)
    expect(Dimensions.of(900, 2100).equals(Dimensions.of(901, 2100))).toBe(false)
  })

  it('valida una medida suelta con assertValidMeasure', () => {
    expect(() => assertValidMeasure(900, 'widthMm')).not.toThrow()
    expect(() => assertValidMeasure(0, 'widthMm')).toThrow(InvalidValueError)
    expect(() => assertValidMeasure(10.5, 'widthMm')).toThrow(InvalidValueError)
  })
})

describe('SizeRange (tamaño máximo por serie)', () => {
  it('exige coherencia entre mínimo y máximo', () => {
    expect(() =>
      SizeRange.of({ minWidthMm: 1200, maxWidthMm: 1000, minHeightMm: 1800, maxHeightMm: 2200 }),
    ).toThrow(InvalidSizeRangeError)

    expect(() =>
      SizeRange.of({ minWidthMm: 600, maxWidthMm: 1000, minHeightMm: 2300, maxHeightMm: 2200 }),
    ).toThrow(InvalidSizeRangeError)
  })

  it('rechaza límites que no son milímetros positivos', () => {
    expect(() =>
      SizeRange.of({ minWidthMm: 0, maxWidthMm: 1000, minHeightMm: 1800, maxHeightMm: 2200 }),
    ).toThrow(InvalidMeasurementError)
  })

  it('construye un rango solo con máximos', () => {
    const range = SizeRange.withMaximum(1200, 2400)

    expect(range.minWidthMm).toBe(1)
    expect(range.minHeightMm).toBe(1)
    expect(range.maxWidthMm).toBe(1200)
    expect(range.maxHeightMm).toBe(2400)
  })

  it('acepta una medida dentro del rango', () => {
    const range = SizeRange.withMaximum(1200, 2400)
    const assessment = range.assess(Dimensions.of(1000, 2100))

    expect(assessment).toEqual({ status: 'within_range' })
    expect(range.allows(Dimensions.of(1000, 2100))).toBe(true)
  })

  it('detecta superar el ancho máximo y exige presupuesto manual', () => {
    const range = SizeRange.withMaximum(1200, 2400)
    const assessment = range.assess(Dimensions.of(1300, 2100))

    expect(assessment.status).toBe('out_of_range')
    expect(assessment).toEqual({
      status: 'out_of_range',
      violations: ['width_above_maximum'],
      requiresManualQuote: true,
    })
    expect(range.allows(Dimensions.of(1300, 2100))).toBe(false)
  })

  it('detecta superar el alto máximo y exige presupuesto manual', () => {
    const range = SizeRange.withMaximum(1200, 2400)

    expect(range.assess(Dimensions.of(1000, 2500))).toEqual({
      status: 'out_of_range',
      violations: ['height_above_maximum'],
      requiresManualQuote: true,
    })
  })

  it('acumula todas las violaciones cuando se superan ancho y alto', () => {
    const range = SizeRange.withMaximum(1200, 2400)

    expect(range.assess(Dimensions.of(1300, 2500))).toEqual({
      status: 'out_of_range',
      violations: ['width_above_maximum', 'height_above_maximum'],
      requiresManualQuote: true,
    })
  })

  it('trata quedar por debajo del mínimo como fuera de rango sin precio automático', () => {
    const range = SizeRange.of({
      minWidthMm: 600,
      maxWidthMm: 1200,
      minHeightMm: 1800,
      maxHeightMm: 2400,
    })

    expect(range.assess(Dimensions.of(500, 1700))).toEqual({
      status: 'out_of_range',
      violations: ['width_below_minimum', 'height_below_minimum'],
      requiresManualQuote: false,
    })
  })

  // N1 de CIF-62: el rango es inclusivo en sus dos extremos (`>` / `<`, no `>=` / `<=`). Un
  // off-by-one aquí manda una puerta de 1200 × 2400 al presupuesto manual y pierde el precio
  // automático sin que nada más se ponga rojo.
  it('trata el mínimo y el máximo exactos como dentro de rango', () => {
    const range = SizeRange.of({
      minWidthMm: 700,
      maxWidthMm: 1200,
      minHeightMm: 1900,
      maxHeightMm: 2400,
    })

    expect(range.assess(Dimensions.of(700, 1900))).toEqual({ status: 'within_range' })
    expect(range.assess(Dimensions.of(1200, 2400))).toEqual({ status: 'within_range' })
    expect(range.allows(Dimensions.of(700, 1900))).toBe(true)
    expect(range.allows(Dimensions.of(1200, 2400))).toBe(true)
  })

  it('un solo milímetro fuera por cualquier extremo sale del rango', () => {
    const range = SizeRange.of({
      minWidthMm: 700,
      maxWidthMm: 1200,
      minHeightMm: 1900,
      maxHeightMm: 2400,
    })

    expect(range.assess(Dimensions.of(699, 1900))).toEqual({
      status: 'out_of_range',
      violations: ['width_below_minimum'],
      requiresManualQuote: false,
    })
    expect(range.assess(Dimensions.of(700, 1899))).toEqual({
      status: 'out_of_range',
      violations: ['height_below_minimum'],
      requiresManualQuote: false,
    })
    expect(range.assess(Dimensions.of(1201, 2400))).toEqual({
      status: 'out_of_range',
      violations: ['width_above_maximum'],
      requiresManualQuote: true,
    })
    expect(range.assess(Dimensions.of(1200, 2401))).toEqual({
      status: 'out_of_range',
      violations: ['height_above_maximum'],
      requiresManualQuote: true,
    })
  })
})
