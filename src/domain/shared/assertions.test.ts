import { describe, expect, it } from 'vitest'

import { InvalidValueError } from './errors'
import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertPercentage,
  assertValidDate,
} from './assertions'

describe('assertNonEmptyString', () => {
  it('acepta texto con contenido', () => {
    expect(() => assertNonEmptyString('Lacado', 'name')).not.toThrow()
  })

  it('rechaza cadenas vacías o solo con espacios', () => {
    expect(() => assertNonEmptyString('', 'name')).toThrow(InvalidValueError)
    expect(() => assertNonEmptyString('   ', 'name')).toThrow(InvalidValueError)
  })

  it('respeta el mínimo de caracteres', () => {
    expect(() => assertNonEmptyString('ab', 'contact.name', 3)).toThrow(InvalidValueError)
    expect(() => assertNonEmptyString('abc', 'contact.name', 3)).not.toThrow()
  })
})

describe('assertIntegerInRange', () => {
  it('acepta enteros dentro del rango', () => {
    expect(() => assertIntegerInRange(900, 'widthMm', 1, 10_000)).not.toThrow()
  })

  it('rechaza valores no enteros o fuera de rango', () => {
    expect(() => assertIntegerInRange(2.5, 'widthMm', 1, 10_000)).toThrow(InvalidValueError)
    expect(() => assertIntegerInRange(0, 'widthMm', 1, 10_000)).toThrow(InvalidValueError)
    expect(() => assertIntegerInRange(10_001, 'widthMm', 1, 10_000)).toThrow(InvalidValueError)
  })
})

describe('assertValidDate', () => {
  it('acepta fechas válidas', () => {
    expect(() => assertValidDate(new Date('2026-09-11T00:00:00.000Z'), 'validFrom')).not.toThrow()
  })

  it('rechaza fechas inválidas', () => {
    expect(() => assertValidDate(new Date('no-es-fecha'), 'validFrom')).toThrow(InvalidValueError)
  })
})

describe('assertPercentage', () => {
  it('acepta porcentajes exactos entre 0 y 100', () => {
    for (const value of ['0', '21', '21.5', '100', '100.00', '0.0001']) {
      expect(() => assertPercentage(value, 'taxRatePercent')).not.toThrow()
    }
  })

  it('rechaza formatos no decimales', () => {
    for (const value of ['', 'abc', '21,5', '1e3', '1000']) {
      expect(() => assertPercentage(value, 'taxRatePercent')).toThrow(InvalidValueError)
    }
  })

  it('rechaza porcentajes por encima de 100', () => {
    expect(() => assertPercentage('101', 'taxRatePercent')).toThrow(InvalidValueError)
    expect(() => assertPercentage('100.5', 'taxRatePercent')).toThrow(InvalidValueError)
  })
})
