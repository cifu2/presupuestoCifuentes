import { describe, expect, it } from 'vitest'

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import {
  buildQuoteDocument,
  hasPendingConfiguration,
  quoteDocumentFileName,
  type BuildQuoteDocumentInput,
} from '@/domain/quote/quote-document'
import { Quote } from '@/domain/quote/quote'
import { InvalidQuoteError, InvalidValueError } from '@/domain/shared/errors'
import { Money } from '@/domain/shared/money'

const ISSUED_AT = new Date('2026-09-12T08:00:00.000Z')

function makeQuote(locale: 'es' | 'en' = 'es'): Quote {
  return Quote.issue({
    id: 'quote-1',
    reference: 'PC-2026-000001',
    configuration: makeConfiguration({
      finishId: 'finish-lacado',
      accessoryIds: ['accessory-manilla'],
    }),
    tariffVersionId: 'tariff-ci-100-v1',
    locale,
    breakdown: makeBreakdown({
      lines: [
        {
          code: 'base',
          label: LocalizedText.of({ es: 'Puerta CI-100', en: 'CI-100 door' }),
          kind: 'base',
          units: 1,
          unitAmount: Money.fromDecimalString('400'),
          amount: Money.fromDecimalString('400'),
        },
      ],
    }),
    validUntil: new Date('2026-10-12T08:00:00.000Z'),
    createdAt: ISSUED_AT,
  })
}

function makeInput(overrides: Partial<BuildQuoteDocumentInput> = {}): BuildQuoteDocumentInput {
  return {
    quote: makeQuote(),
    version: 1,
    issuer: {
      name: 'Puertas Cifuentes S.L.',
      taxId: 'B12345678',
      address: 'Calle Mayor 1',
      email: 'presupuestos@example.com',
      phone: '+34 900 000 000',
      website: 'https://example.com',
      isPending: false,
    },
    customer: { name: 'Ana', email: 'ana@example.com' },
    configuration: {
      seriesName: 'Serie CI-100',
      widthMm: 900,
      heightMm: 2100,
      finishName: 'Lacado',
      colorName: null,
      accessoryNames: ['Manilla de acero'],
      extras: [],
    },
    conditions: ['Validez 30 días'],
    pendingFields: [],
    ...overrides,
  }
}

describe('buildQuoteDocument', () => {
  it('deriva las líneas y los totales del desglose congelado', () => {
    const document = buildQuoteDocument(makeInput())

    expect(document.reference).toBe('PC-2026-000001')
    expect(document.version).toBe(1)
    expect(document.lines).toHaveLength(1)
    expect(document.lines[0]?.label).toBe('Puerta CI-100')
    expect(document.totals).toEqual({
      currency: 'EUR',
      subtotalCents: 40_000n,
      taxRatePercent: '21',
      taxCents: 8_400n,
      totalCents: 48_400n,
    })
    expect(document.customer).toEqual({ name: 'Ana', email: 'ana@example.com' })
    expect(hasPendingConfiguration(document)).toBe(false)
  })

  it('resuelve las etiquetas de las líneas al idioma del presupuesto', () => {
    const document = buildQuoteDocument(makeInput({ quote: makeQuote('en') }))

    expect(document.locale).toBe('en')
    expect(document.lines[0]?.label).toBe('CI-100 door')
  })

  it('rechaza un documento sin condiciones y sin aviso de pendiente', () => {
    expect(() => buildQuoteDocument(makeInput({ conditions: [] }))).toThrow(InvalidQuoteError)
  })

  it('acepta un documento sin condiciones si avisa de que están pendientes', () => {
    const document = buildQuoteDocument(
      makeInput({ conditions: [], pendingFields: ['conditions.es'] }),
    )

    expect(hasPendingConfiguration(document)).toBe(true)
  })

  it('rechaza una versión fuera de rango', () => {
    expect(() => buildQuoteDocument(makeInput({ version: 0 }))).toThrow(InvalidValueError)
  })
})

describe('quoteDocumentFileName', () => {
  it('nombra el fichero en el idioma del presupuesto', () => {
    expect(quoteDocumentFileName(buildQuoteDocument(makeInput()))).toBe(
      'presupuesto-PC-2026-000001.pdf',
    )
    expect(quoteDocumentFileName(buildQuoteDocument(makeInput({ quote: makeQuote('en') })))).toBe(
      'quote-PC-2026-000001.pdf',
    )
  })
})
