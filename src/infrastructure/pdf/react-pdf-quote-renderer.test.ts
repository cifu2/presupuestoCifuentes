/**
 * Test del render del PDF (ADR-0004 §3), sin red.
 *
 * Renderiza un documento de ejemplo y comprueba lo que el propietario vería: que el PDF es válido y
 * tiene un tamaño razonable, y que el texto se puede **extraer** y dice lo que tiene que decir
 * (referencia, configuración, IVA, condiciones, aviso de valores pendientes).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'
import { extractText, extractTextItems, getMeta } from 'unpdf'

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import {
  buildQuoteDocument,
  type BuildQuoteDocumentInput,
  type QuoteDocument,
} from '@/domain/quote/quote-document'
import { Quote } from '@/domain/quote/quote'
import { Money } from '@/domain/shared/money'

import { QUOTE_DOCUMENT_PALETTE } from './quote-document-palette'
import { hardCurrencySpace, ReactPdfQuoteRenderer } from './react-pdf-quote-renderer'

const ISSUED_AT = new Date('2026-09-12T08:00:00.000Z')

/** Presupuesto de ejemplo con las líneas que pida cada prueba. */
function quoteWithLines(
  lines: ReturnType<typeof makeBreakdown>['lines'],
  locale: 'es' | 'en' = 'es',
  breakdown: Partial<ReturnType<typeof makeBreakdown>> = {},
): Quote {
  return Quote.issue({
    id: 'quote-1',
    reference: 'PC-2026-000123',
    configuration: makeConfiguration({
      finishId: 'finish-lacado',
      accessoryIds: ['accessory-manilla'],
    }),
    tariffVersionId: 'tariff-ci-100-v1',
    locale,
    breakdown: makeBreakdown({ lines, ...breakdown }),
    validUntil: new Date('2026-10-12T08:00:00.000Z'),
    createdAt: ISSUED_AT,
  })
}

function makeInput(
  overrides: Partial<BuildQuoteDocumentInput> = {},
  locale: 'es' | 'en' = 'es',
): BuildQuoteDocumentInput {
  const quote = quoteWithLines(
    [
      {
        code: 'base',
        label: LocalizedText.of({ es: 'Puerta CI-100 a medida', en: 'CI-100 bespoke door' }),
        kind: 'base',
        units: 1,
        unitAmount: makeBreakdown().basePrice,
        amount: makeBreakdown().basePrice,
      },
    ],
    locale,
  )

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

/** Texto de cada página por separado: §6.3 se comprueba página a página. */
async function pagesOf(document: QuoteDocument): Promise<readonly string[]> {
  const pdf = await new ReactPdfQuoteRenderer().render(document)
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: false })

  return text
}

/** Texto con coordenadas (origen abajo a la izquierda): para comprobar dónde cae cada bloque. */
async function pageItemsOf(document: QuoteDocument) {
  const pdf = await new ReactPdfQuoteRenderer().render(document)
  const { items } = await extractTextItems(new Uint8Array(pdf))

  return items
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

/**
 * Presupuesto de 40 líneas de 10,00 €: cuadra con el desglose por defecto de la factoría
 * (400,00 € + 21 % de IVA) y entra en **dos** páginas exactas, con el bloque final en la segunda.
 */
function longDocument(): QuoteDocument {
  const lines = Array.from({ length: 40 }, (_, index) => ({
    code: `line-${index}`,
    label: LocalizedText.of({ es: `Línea ${index}`, en: `Line ${index}` }),
    kind: 'base' as const,
    units: 1,
    unitAmount: Money.fromDecimalString('10'),
    amount: Money.fromDecimalString('10'),
  }))

  return buildQuoteDocument(makeInput({ quote: quoteWithLines(lines) }))
}

describe('plantilla del documento (`plantilla-presupuesto`)', () => {
  it('rotula el desglose con nombre propio y publica las columnas de la tabla', async () => {
    const text = await textOf(buildQuoteDocument(makeInput()))

    expect(text).toContain('Desglose')
    expect(text).toContain('Concepto')
    expect(text).toContain('Cantidad')
    expect(text).toContain('Precio unitario')
    expect(text).toContain('Importe')
  })

  it('usa espacio duro antes del símbolo de moneda (§3.3)', () => {
    expect(hardCurrencySpace('400,00 €')).toBe('400,00\u00A0€')
    expect(hardCurrencySpace('10,00 USD')).toBe('10,00\u00A0USD')
    expect(hardCurrencySpace('€1,234.56')).toBe('€1,234.56')
  })

  it('imprime la cantidad cuando la línea lleva más de una unidad (§3.3)', async () => {
    const subtotal = Money.fromDecimalString('37.02')
    const taxAmount = subtotal.percentage('21')
    const document = buildQuoteDocument(
      makeInput({
        quote: quoteWithLines(
          [
            {
              code: 'accessory-manilla',
              label: LocalizedText.of({ es: 'Manilla de acero', en: 'Steel handle' }),
              kind: 'addition',
              units: 3,
              unitAmount: Money.fromDecimalString('12.34'),
              amount: Money.fromDecimalString('37.02'),
            },
          ],
          'es',
          { subtotal, taxAmount, total: subtotal.add(taxAmount) },
        ),
      }),
    )

    const text = await textOf(document)

    // Concepto · Cantidad · Precio unitario · Importe, con el espacio duro tolerado.
    expect(text).toMatch(/Manilla de acero\s+3\s+12,34\s€\s+37,02\s€/)
  })

  it('pagina con cabecera corrida, cabecera repetida y numeración real (§6.3)', async () => {
    const pages = await pagesOf(longDocument())

    expect(pages).toHaveLength(2)

    // Página 1: cabecera completa del emisor, sin cabecera corrida.
    expect(pages[0]).toContain('Puertas Cifuentes S.L.')
    expect(pages[0]).toContain('Calle Mayor 1, Cuenca')
    expect(pages[0]).not.toContain('Presupuesto · PC-2026-000123')

    // Página 2: cabecera corrida con título y referencia + cliente, sin el bloque del emisor.
    expect(pages[1]).toContain('Presupuesto · PC-2026-000123')
    expect(pages[1]).toContain('Ana Pérez')
    expect(pages[1]).not.toContain('Calle Mayor 1, Cuenca')
    expect(pages[1]).not.toContain('presupuestos@example.com')

    for (const page of pages) {
      // La cabecera de la tabla se repite y ninguna fila se parte ni se pierde.
      expect(page).toContain('Concepto')
      expect(page).toContain('Cantidad')
      expect(['Página 1 de 2', 'Página 2 de 2'].some((label) => page.includes(label))).toBe(true)
    }

    expect(pages[0]).toContain('Página 1 de 2')
    expect(pages[1]).toContain('Página 2 de 2')

    // Al menos dos filas por página y las 40 líneas una sola vez cada una.
    const rows = pages.map((page) => page.match(/Línea \d+/g) ?? [])
    const expected = Array.from({ length: 40 }, (_, index) => `Línea ${index}`)

    expect(rows[0]?.length).toBeGreaterThanOrEqual(2)
    expect(rows[1]?.length).toBeGreaterThanOrEqual(2)
    expect([...(rows[0] ?? []), ...(rows[1] ?? [])].sort()).toEqual([...expected].sort())
  })

  it('no parte la web del emisor: aparece una sola vez por documento', async () => {
    const pages = await pagesOf(longDocument())

    expect(pages.join('\n').match(/https:\/\/example\.com/g)).toHaveLength(1)
  })

  it('mantiene indivisibles totales, condiciones y aviso de precio congelado (§6.3)', async () => {
    const pages = await pagesOf(longDocument())

    for (const page of pages) {
      const together = [
        page.includes('Subtotal'),
        page.includes('Condiciones'),
        page.includes('Precio congelado en el momento de emitir el presupuesto.'),
      ]

      expect(new Set(together).size).toBe(1)
    }
  })

  it('el reintento extrae exactamente el mismo texto (precio congelado, §5.5)', async () => {
    const document = longDocument()
    const first = await pagesOf(document)
    const retry = await pagesOf(document)

    expect(retry).toEqual(first)
  })

  it('declara los metadatos del PDF y el idioma del documento (§6.5)', async () => {
    const pdf = await new ReactPdfQuoteRenderer().render(buildQuoteDocument(makeInput()))
    const { info } = await getMeta(new Uint8Array(pdf))

    expect(info.Title).toBe('Presupuesto PC-2026-000123')
    expect(info.Author).toBe('Puertas Cifuentes S.L.')
    expect(info.Subject).toBe('Presupuesto')
    expect(info.Language).toBe('es-ES')

    const english = await new ReactPdfQuoteRenderer().render(
      buildQuoteDocument(makeInput({}, 'en')),
    )
    const englishMeta = await getMeta(new Uint8Array(english))

    expect(englishMeta.info.Title).toBe('Quote PC-2026-000123')
    expect(englishMeta.info.Language).toBe('en-GB')
  })
})

/**
 * Regresión M1 de CIF-396: el pie se imprimía al final del flujo (y ≈ 500 pt) porque el bloque
 * `fixed` + `render` no tenía bloque contenedor anclado a la página. La extracción de texto no lo
 * veía; la posición sí.
 */
describe('banda inferior del pie (§3.1 y §3.6)', () => {
  /**
   * Coordenadas con origen abajo a la izquierda: el pie vive en los primeros 56,7 pt de la página
   * (la banda inferior de 20 mm de §3.1, que empieza a 785,2 pt del borde superior).
   */
  const BOTTOM_BAND_PT = 57

  it.each([
    ['1 página', () => buildQuoteDocument(makeInput())],
    ['2 páginas', () => longDocument()],
  ])('deja el pie en la banda inferior en todas las páginas (%s)', async (_label, build) => {
    const pages = await pageItemsOf(build())

    expect(pages.length).toBeGreaterThanOrEqual(1)

    for (const [index, page] of pages.entries()) {
      const brand = page.find((item) =>
        item.str.includes('Puertas Cifuentes · Presupuestos a medida'),
      )
      const number = page.find((item) => /Página \d+ de \d+/.test(item.str))

      expect(brand, `página ${index + 1}: falta el texto de marca del pie`).toBeDefined()
      expect(number, `página ${index + 1}: falta la numeración del pie`).toBeDefined()

      if (!brand || !number) return

      expect(brand.y, `página ${index + 1}: el pie no llega a la banda inferior`).toBeLessThan(
        BOTTOM_BAND_PT,
      )
      expect(brand.y, `página ${index + 1}: el pie se sale de la página`).toBeGreaterThan(0)
      expect(
        number.y,
        `página ${index + 1}: la numeración no está en la banda inferior`,
      ).toBeLessThan(BOTTOM_BAND_PT)
      // Marca y numeración comparten línea.
      expect(Math.abs(brand.y - number.y), `página ${index + 1}`).toBeLessThan(3)

      // Todo lo demás queda por encima: el pie no tapa contenido.
      const content = page.filter(
        (item) => item.str.trim().length > 0 && item !== brand && item !== number,
      )
      const lowestContentY = Math.min(...content.map((item) => item.y))

      expect(lowestContentY, `página ${index + 1}: contenido por debajo del pie`).toBeGreaterThan(
        brand.y,
      )
    }
  })

  it('mantiene la cabecera corrida arriba en las páginas de continuación', async () => {
    const pages = await pageItemsOf(longDocument())
    const runningHeader = pages[1]?.find((item) =>
      item.str.includes('Presupuesto · PC-2026-000123'),
    )
    const tableHeader = pages[1]?.find((item) => item.str.includes('Concepto'))

    expect(runningHeader).toBeDefined()
    expect(tableHeader).toBeDefined()

    if (!runningHeader || !tableHeader) return

    // Arriba del todo (841,89 − 40 de margen) pero por debajo del borde superior.
    expect(runningHeader.y).toBeGreaterThan(770)
    expect(runningHeader.y).toBeGreaterThan(tableHeader.y)
  })
})

/**
 * Guarda de la regla estructural de la cabecera de tabla (CIF-399; reserva R1 de CIF-396).
 *
 * La cabecera se cierra con `ruleStrong` —la regla estructural de §2.1 rev 8, de 0,75 pt y ≥3:1
 * sobre `surface`—, no con la regla decorativa `rule` de filas y pie. Es la decisión que costó una
 * revisión de Diseño (CIF-397 rev 8) y ninguna prueba la ataba: volver a `rule` dejaba la suite en
 * verde. Aquí se ancla por dos vías complementarias: el color tiene que estar **pintado** en el PDF
 * renderizado y el estilo tiene que declararlo y aplicarlo a la cabecera de la tabla.
 */

/** Código del renderer sin comentarios, para leer sus bloques de estilo. */
const rendererCode = readFileSync(
  fileURLToPath(new URL('./react-pdf-quote-renderer.tsx', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Canales 0..1 que el PDF escribe para un `#rrggbb` de la paleta. */
function rgbChannels(hex: string): readonly number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
}

/**
 * Colores de **trazo** del PDF, en orden de aparición. `@react-pdf` comprime los flujos de contenido
 * con zlib y fija el color de trazo con `SCN` (`RG` en la notación clásica), así que hay que
 * descomprimirlos para ver lo que de verdad se pinta en la página.
 */
async function strokeColors(document: QuoteDocument): Promise<readonly (readonly number[])[]> {
  const pdf = Buffer.from(await new ReactPdfQuoteRenderer().render(document))
  const colors: number[][] = []

  let cursor = 0
  while ((cursor = pdf.indexOf('stream', cursor)) !== -1) {
    const start = pdf.indexOf('\n', cursor) + 1
    const end = pdf.indexOf('endstream', start)
    if (end === -1) break

    let content: string
    try {
      content = inflateSync(pdf.subarray(start, end)).toString('latin1')
    } catch {
      content = pdf.subarray(start, end).toString('latin1')
    }

    for (const match of content.matchAll(/([\d.]+) +([\d.]+) +([\d.]+) +(?:SCN|RG)\b/g)) {
      const [, red, green, blue] = match
      if (red === undefined || green === undefined || blue === undefined) continue

      colors.push([Number(red), Number(green), Number(blue)])
    }

    cursor = end + 'endstream'.length
  }

  return colors
}

/** ¿Algún trazo del PDF usa el color `hex`? */
function paintsColor(strokes: readonly (readonly number[])[], hex: string): boolean {
  const expected = rgbChannels(hex)

  return strokes.some((stroke) =>
    expected.every((channel, index) => {
      const painted = stroke[index]

      return painted !== undefined && Math.abs(painted - channel) < 1e-3
    }),
  )
}

/** Bloque `nombre: { … }` de un `StyleSheet.create`, con sus llaves. */
function styleBlock(source: string, name: string): string | null {
  const start = new RegExp(`(?:^|\\n)\\s*${name}\\s*:\\s*\\{`).exec(source)
  if (start === null) return null

  const open = source.indexOf('{', start.index)
  let depth = 0

  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1
    else if (source[cursor] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, cursor + 1)
    }
  }

  return null
}

/** Valor declarado de una propiedad dentro de un bloque de estilo. */
function declared(block: string | null, property: string): string | null {
  if (block === null) return null

  const match = new RegExp(`(?:^|[\\s,{])${property}\\s*:\\s*([^,\\n}]+)`).exec(block)

  return match?.[1]?.trim() ?? null
}

describe('la cabecera de tabla se cierra con la regla estructural (R1 de CIF-396)', () => {
  it('el PDF pinta `ruleStrong` y `rule` como colores de trazo', async () => {
    const strokes = await strokeColors(buildQuoteDocument(makeInput()))

    expect(strokes.length).toBeGreaterThan(0)
    expect(
      paintsColor(strokes, QUOTE_DOCUMENT_PALETTE.ruleStrong),
      'ningún trazo del PDF usa `ruleStrong`: la cabecera perdió su regla estructural',
    ).toBe(true)
    expect(
      paintsColor(strokes, QUOTE_DOCUMENT_PALETTE.rule),
      'la regla decorativa `rule` de filas y pie ya no se pinta',
    ).toBe(true)
  })

  it('`tableHeader` declara `ruleStrong` a 0,75 pt; filas y pie siguen con `rule`', () => {
    expect(declared(styleBlock(rendererCode, 'tableHeader'), 'borderBottomColor')).toBe(
      'QUOTE_DOCUMENT_PALETTE.ruleStrong',
    )
    expect(declared(styleBlock(rendererCode, 'tableHeader'), 'borderBottomWidth')).toBe('0.75')

    expect(declared(styleBlock(rendererCode, 'tableRow'), 'borderBottomColor')).toBe(
      'QUOTE_DOCUMENT_PALETTE.rule',
    )
    expect(declared(styleBlock(rendererCode, 'footer'), 'borderTopColor')).toBe(
      'QUOTE_DOCUMENT_PALETTE.rule',
    )
  })

  it('la cabecera de la tabla aplica ese estilo', () => {
    expect(rendererCode).toMatch(/style=\{styles\.tableHeader\}/)
  })

  it('la guarda no es vacua: `ruleStrong` y `rule` son colores distintos', () => {
    expect(QUOTE_DOCUMENT_PALETTE.ruleStrong).not.toBe(QUOTE_DOCUMENT_PALETTE.rule)
  })
})
