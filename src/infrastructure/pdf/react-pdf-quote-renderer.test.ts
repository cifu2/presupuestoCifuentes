/**
 * Test del render del PDF (ADR-0004 §3), sin red.
 *
 * Renderiza un documento de ejemplo y comprueba lo que el propietario vería: que el PDF es válido y
 * tiene un tamaño razonable, y que el texto se puede **extraer** y dice lo que tiene que decir
 * (referencia, configuración, IVA, condiciones, aviso de valores pendientes).
 */

import { describe, expect, it } from 'vitest'
import { extractText } from 'unpdf'

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import {
  buildQuoteDocument,
  type BuildQuoteDocumentInput,
  type QuoteDocument,
} from '@/domain/quote/quote-document'
import { Quote } from '@/domain/quote/quote'

import { ReactPdfQuoteRenderer } from './react-pdf-quote-renderer'

const ISSUED_AT = new Date('2026-09-12T08:00:00.000Z')

function makeInput(
  overrides: Partial<BuildQuoteDocumentInput> = {},
  locale: 'es' | 'en' = 'es',
): BuildQuoteDocumentInput {
  const quote = Quote.issue({
    id: 'quote-1',
    reference: 'PC-2026-000123',
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
          label: LocalizedText.of({ es: 'Puerta CI-100 a medida', en: 'CI-100 bespoke door' }),
          kind: 'base',
          units: 1,
          unitAmount: makeBreakdown().basePrice,
          amount: makeBreakdown().basePrice,
        },
      ],
    }),
    validUntil: new Date('2026-10-12T08:00:00.000Z'),
    createdAt: ISSUED_AT,
  })

  return {
    quote,
    version: 1,
    issuer: {
      name: 'Puertas Cifuentes S.L.',
      taxId: 'B12345678',
      address: 'Calle Mayor 1, Cuenca',
      email: 'presupuestos@example.com',
      phone: '+34 900 000 000',
      website: 'https://example.com',
      isPending: false,
    },
    customer: { name: 'Ana Pérez', email: 'ana@example.com' },
    configuration: {
      seriesName: 'Serie CI-100',
      widthMm: 900,
      heightMm: 2100,
      finishName: 'Lacado',
      colorName: 'Blanco puro',
      accessoryNames: ['Manilla de acero'],
      extras: ['installation'],
    },
    conditions: ['Validez 30 días desde la emisión.', 'Portes no incluidos.'],
    pendingFields: [],
    ...overrides,
  }
}

async function textOf(document: QuoteDocument): Promise<string> {
  const pdf = await new ReactPdfQuoteRenderer().render(document)
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true })

  return text
}

describe('ReactPdfQuoteRenderer', () => {
  it('genera un PDF con tamaño razonable y cabecera válida', async () => {
    const pdf = await new ReactPdfQuoteRenderer().render(buildQuoteDocument(makeInput()))

    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
  })

  it('imprime la referencia, la configuración, el IVA y las condiciones', async () => {
    const text = await textOf(buildQuoteDocument(makeInput()))

    expect(text).toContain('PC-2026-000123')
    expect(text).toContain('Serie CI-100')
    expect(text).toContain('900 × 2100 mm')
    expect(text).toContain('Lacado')
    expect(text).toContain('Blanco puro')
    expect(text).toContain('Manilla de acero')
    expect(text).toContain('Ana Pérez')
    expect(text).toContain('IVA (21)')
    expect(text).toContain('484,00 €')
    expect(text).toContain('Validez 30 días desde la emisión.')
    expect(text).toContain('Puertas Cifuentes S.L.')
  })

  it('avisa en el PDF cuando faltan valores del propietario', async () => {
    const text = await textOf(
      buildQuoteDocument(
        makeInput({
          issuer: {
            name: '[pendiente de configurar]',
            taxId: '[pendiente de configurar]',
            address: '[pendiente de configurar]',
            email: '[pendiente de configurar]',
            phone: '[pendiente de configurar]',
            website: '[pendiente de configurar]',
            isPending: true,
          },
          pendingFields: ['issuer.name', 'issuer.taxId'],
        }),
      ),
    )

    expect(text).toContain('[pendiente de configurar]')
    expect(text).toContain('Documento provisional')
    expect(text).toContain('el nombre fiscal')
  })

  it('imprime el presupuesto en el idioma guardado', async () => {
    const text = await textOf(
      buildQuoteDocument(
        makeInput(
          {
            conditions: ['Valid for 30 days from issue.'],
            customer: { name: 'Ann', email: 'ann@example.com' },
          },
          'en',
        ),
      ),
    )

    expect(text).toContain('Issue date')
    expect(text).toContain('VAT (21)')
    expect(text).toContain('Valid for 30 days from issue.')
    expect(text).toContain('PC-2026-000123')
  })
})
