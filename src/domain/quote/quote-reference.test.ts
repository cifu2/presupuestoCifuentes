import { describe, expect, it } from 'vitest'

import { InvalidQuoteReferenceError } from '@/domain/shared/errors'

import { assertQuoteReference, formatQuoteReference, quoteReferenceYear } from './quote-reference'

describe('referencias de presupuesto', () => {
  it('formatea la referencia con año y secuencia a seis dígitos', () => {
    expect(formatQuoteReference(2026, 123)).toBe('PC-2026-000123')
  })

  it('rechaza años y secuencias fuera de rango', () => {
    expect(() => formatQuoteReference(1999, 1)).toThrow(InvalidQuoteReferenceError)
    expect(() => formatQuoteReference(2026, 0)).toThrow(InvalidQuoteReferenceError)
    expect(() => formatQuoteReference(2026, 1_000_000)).toThrow(InvalidQuoteReferenceError)
  })

  it('valida el formato de una referencia', () => {
    expect(() => assertQuoteReference('PC-2026-000001')).not.toThrow()
    expect(() => assertQuoteReference('2026-1')).toThrow(InvalidQuoteReferenceError)
  })

  it('extrae el año de la referencia', () => {
    expect(quoteReferenceYear('PC-2026-000001')).toBe(2026)
    expect(() => quoteReferenceYear('nope')).toThrow(InvalidQuoteReferenceError)
  })
})
