import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatMoney,
  pendingFieldLabels,
  quoteDocumentTexts,
} from '@/i18n/quote-document-texts'

describe('formatMoney', () => {
  it('formatea en euros con las convenciones de cada idioma', () => {
    expect(formatMoney(123_456n, 'EUR', 'es')).toBe('1.234,56 €')
    expect(formatMoney(123_456n, 'EUR', 'en')).toBe('€1,234.56')
  })

  it('formatea importes de menos de un euro y negativos', () => {
    expect(formatMoney(5n, 'EUR', 'es')).toBe('0,05 €')
    expect(formatMoney(-1_000n, 'EUR', 'en')).toBe('-€10.00')
  })

  it('no usa coma flotante: mantiene importes grandes exactos', () => {
    expect(formatMoney(9_007_199_254_740_993n, 'EUR', 'es')).toBe('90.071.992.547.409,93 €')
  })

  it('deja la moneda al final si no es el euro', () => {
    expect(formatMoney(1_000n, 'USD', 'es')).toBe('10,00 USD')
  })
})

describe('formatDate', () => {
  it('formatea la fecha en UTC y en el idioma pedido', () => {
    const date = new Date('2026-09-12T23:30:00.000Z')

    expect(formatDate(date, 'es')).toBe('12 de septiembre de 2026')
    expect(formatDate(date, 'en')).toBe('12 September 2026')
  })
})

describe('textos del documento', () => {
  it('interpola las medidas y los datos del presupuesto', () => {
    const texts = quoteDocumentTexts('es')

    expect(texts.measurement(900, 2100)).toBe('900 × 2100 mm')
    expect(texts.taxLine('21')).toBe('IVA (21)')
    expect(texts.emailSubject('PC-2026-000001')).toContain('PC-2026-000001')
    expect(texts.pendingConfigurationNotice('el NIF')).toContain('el NIF')
  })

  it('traduce los valores pendientes a rótulos legibles', () => {
    expect(pendingFieldLabels('es', ['issuer.taxId', 'conditions.en'])).toBe(
      'el NIF, las condiciones en inglés',
    )
    expect(pendingFieldLabels('en', ['issuer.taxId'])).toBe('the tax ID')
  })

  it('deja el identificador tal cual si no hay rótulo', () => {
    expect(pendingFieldLabels('es', ['issuer.desconocido'])).toBe('issuer.desconocido')
  })
})
