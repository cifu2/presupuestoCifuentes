import { describe, expect, it } from 'vitest'

import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import { InvalidQuoteError, InvalidQuoteTransitionError } from '@/domain/shared/errors'
import { Money } from '@/domain/shared/money'

import { Quote } from './quote'

const ISSUED_AT = new Date('2026-09-11T10:00:00.000Z')

function makeQuote(): Quote {
  return Quote.issue({
    id: 'quote-1',
    reference: 'PC-2026-000001',
    configuration: makeConfiguration({ finishId: 'finish-lacado' }),
    tariffVersionId: 'tariff-ci-100-v1',
    locale: 'es',
    breakdown: makeBreakdown(),
    validUntil: new Date('2026-10-11T10:00:00.000Z'),
    createdAt: ISSUED_AT,
  })
}

describe('Quote', () => {
  it('nace emitido, con su desglose y su referencia', () => {
    const quote = makeQuote()

    expect(quote.status).toBe('issued')
    expect(quote.reference).toBe('PC-2026-000001')
    expect(quote.lines).toHaveLength(1)
    expect(quote.totalCents).toBe(48_400n)
    expect(quote.configurationSnapshot.finishId).toBe('finish-lacado')
  })

  it('rechaza un desglose cuyas líneas no suman el subtotal', () => {
    expect(() =>
      Quote.issue({
        id: 'quote-1',
        reference: 'PC-2026-000001',
        configuration: makeConfiguration(),
        tariffVersionId: 'tariff-ci-100-v1',
        locale: 'es',
        breakdown: makeBreakdown({ subtotal: Money.fromDecimalString('999') }),
        validUntil: null,
        createdAt: ISSUED_AT,
      }),
    ).toThrow(InvalidQuoteError)
  })

  it('rechaza un total que no es subtotal + IVA', () => {
    expect(() =>
      Quote.issue({
        id: 'quote-1',
        reference: 'PC-2026-000001',
        configuration: makeConfiguration(),
        tariffVersionId: 'tariff-ci-100-v1',
        locale: 'es',
        breakdown: makeBreakdown({ total: Money.fromDecimalString('1') }),
        validUntil: null,
        createdAt: ISSUED_AT,
      }),
    ).toThrow(InvalidQuoteError)
  })

  it('exige que la validez sea posterior a la emisión', () => {
    expect(() =>
      Quote.issue({
        id: 'quote-1',
        reference: 'PC-2026-000001',
        configuration: makeConfiguration(),
        tariffVersionId: 'tariff-ci-100-v1',
        locale: 'es',
        breakdown: makeBreakdown(),
        validUntil: ISSUED_AT,
        createdAt: ISSUED_AT,
      }),
    ).toThrow(InvalidQuoteError)
  })

  it('sabe si ha caducado', () => {
    const quote = makeQuote()

    expect(quote.isExpiredAt(new Date('2026-10-10T10:00:00.000Z'))).toBe(false)
    expect(quote.isExpiredAt(new Date('2026-10-11T10:00:00.000Z'))).toBe(true)
  })

  it('permite aceptar, rechazar o caducar, pero no volver atrás', () => {
    const quote = makeQuote()
    const later = new Date('2026-09-12T10:00:00.000Z')

    expect(quote.accept(later).status).toBe('accepted')
    expect(quote.reject(later).status).toBe('rejected')
    expect(quote.expire(later).status).toBe('expired')
    expect(() => quote.accept(later).reject(later)).toThrow(InvalidQuoteTransitionError)
    expect(() => quote.expire(later).accept(later)).toThrow(InvalidQuoteTransitionError)
  })
})
