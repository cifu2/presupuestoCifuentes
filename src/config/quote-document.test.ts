import { describe, expect, it } from 'vitest'

import {
  ISSUER_FIELDS,
  PENDING_CONFIGURATION_MARKER,
  parseConditions,
  parseRecipients,
  resolveQuoteDocumentSettings,
  type QuoteDocumentConfigSource,
} from '@/config/quote-document'

type Source = QuoteDocumentConfigSource

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    QUOTE_ISSUER_NAME: undefined,
    QUOTE_ISSUER_TAX_ID: undefined,
    QUOTE_ISSUER_ADDRESS: undefined,
    QUOTE_ISSUER_EMAIL: undefined,
    QUOTE_ISSUER_PHONE: undefined,
    QUOTE_ISSUER_WEBSITE: undefined,
    QUOTE_CONDITIONS_ES: undefined,
    QUOTE_CONDITIONS_EN: undefined,
    QUOTE_INTERNAL_RECIPIENTS: undefined,
    ...overrides,
  }
}

describe('parseConditions', () => {
  it('parte por líneas y descarta las vacías', () => {
    expect(parseConditions('  Primera  \n\n Segunda \n')).toEqual(['Primera', 'Segunda'])
  })

  it('sin valor devuelve una lista vacía', () => {
    expect(parseConditions(undefined)).toEqual([])
  })
})

describe('parseRecipients', () => {
  it('separa por comas y limpia los huecos', () => {
    expect(parseRecipients(' comercial@example.com , , copia@example.com ')).toEqual([
      'comercial@example.com',
      'copia@example.com',
    ])
  })
})

describe('resolveQuoteDocumentSettings', () => {
  it('sin respuestas del propietario marca todos los datos y avisa de lo pendiente', () => {
    const settings = resolveQuoteDocumentSettings(makeSource())

    expect(settings.issuer.name).toBe(PENDING_CONFIGURATION_MARKER)
    expect(settings.issuer.isPending).toBe(true)
    expect(settings.pendingFields).toEqual([...ISSUER_FIELDS, 'conditions.es', 'conditions.en'])
    expect(settings.conditions.es).toEqual([])
    expect(settings.internalRecipients).toEqual([])
  })

  it('con los valores configurados no queda nada pendiente', () => {
    const settings = resolveQuoteDocumentSettings(
      makeSource({
        QUOTE_ISSUER_NAME: 'Puertas Cifuentes S.L.',
        QUOTE_ISSUER_TAX_ID: 'B12345678',
        QUOTE_ISSUER_ADDRESS: 'Calle Mayor 1, Cuenca',
        QUOTE_ISSUER_EMAIL: 'presupuestos@example.com',
        QUOTE_ISSUER_PHONE: '+34 900 000 000',
        QUOTE_ISSUER_WEBSITE: 'https://example.com',
        QUOTE_CONDITIONS_ES: 'Validez 30 días\nIVA no incluido en el precio base',
        QUOTE_CONDITIONS_EN: 'Valid for 30 days',
        QUOTE_INTERNAL_RECIPIENTS: 'comercial@example.com',
      }),
    )

    expect(settings.issuer).toEqual({
      name: 'Puertas Cifuentes S.L.',
      taxId: 'B12345678',
      address: 'Calle Mayor 1, Cuenca',
      email: 'presupuestos@example.com',
      phone: '+34 900 000 000',
      website: 'https://example.com',
      isPending: false,
    })
    expect(settings.conditions.es).toEqual(['Validez 30 días', 'IVA no incluido en el precio base'])
    expect(settings.conditions.en).toEqual(['Valid for 30 days'])
    expect(settings.pendingFields).toEqual([])
    expect(settings.internalRecipients).toEqual(['comercial@example.com'])
  })

  it('si falta un idioma usa las condiciones del idioma por defecto y lo deja pendiente', () => {
    const settings = resolveQuoteDocumentSettings(
      makeSource({ QUOTE_CONDITIONS_ES: 'Validez 30 días' }),
    )

    expect(settings.conditions.en).toEqual(['Validez 30 días'])
    expect(settings.pendingFields).toEqual([...ISSUER_FIELDS, 'conditions.en'])
  })
})
