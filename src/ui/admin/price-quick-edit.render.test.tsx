/**
 * Render de la edición rápida de precios (CIF-243), en servidor y sin navegador.
 *
 * Comprueba lo que el propietario ve antes de tocar nada: los importes precargados, el aviso de
 * `EMPTY_PRICE_TABLE` **con el botón de publicar deshabilitado** (no un 409 después del clic) y el
 * formulario cerrado cuando la versión ya no es un borrador.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Locale } from '@/domain/catalog/locale'

import { PriceQuickEdit } from './price-quick-edit'
import type { PriceTableView } from './price-quick-edit-model'
import type { TariffVersionSummary } from './view-models'

const messagesDirectory = fileURLToPath(new URL('../../../messages/', import.meta.url))

function messages(locale: Locale): AbstractIntlMessages {
  return JSON.parse(
    readFileSync(join(messagesDirectory, `${locale}.json`), 'utf8'),
  ) as AbstractIntlMessages
}

function render(locale: Locale, node: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      {node}
    </NextIntlClientProvider>,
  )
}

const VERSION: TariffVersionSummary = {
  id: 'v-1',
  seriesId: 's-1',
  seriesName: 'Serie A',
  versionNumber: 3,
  status: 'draft',
  effectiveFrom: null,
  priceCount: 1,
}

function table(overrides: Partial<PriceTableView> = {}): PriceTableView {
  return {
    tariffVersionId: 'v-1',
    strategy: 'per_square_metre',
    perSquareMetre: { amount: '450.00', currency: 'EUR' },
    fixedPrice: null,
    bands: [],
    modifiers: [],
    ...overrides,
  }
}

describe('PriceQuickEdit · borrador con precios', () => {
  it('precarga los importes y deja guardar y publicar', () => {
    const html = render('es', <PriceQuickEdit version={VERSION} initialTable={table()} />)

    expect(html).toContain('Precio por m² (€)')
    expect(html).toContain('value="450.00"')
    expect(html).toContain('Guardar')
    expect(html).toContain('Publicar')
    expect(html).toContain('Solo se guardan los importes que cambias')
    expect(html).not.toContain('La tarifa no tiene precios cargados')
    // `buttonClass` incluye variantes `disabled:` en sus utilidades: se comprueba el atributo, que es
    // lo que de verdad cierra el control, y no la palabra suelta.
    expect(html).not.toContain(' disabled=""')
  })

  it('en inglés usa los mismos campos traducidos', () => {
    const html = render('en', <PriceQuickEdit version={VERSION} initialTable={table()} />)

    expect(html).toContain('Price per m² (€)')
    expect(html).toContain('Save')
    expect(html).toContain('Publish')
  })
})

describe('PriceQuickEdit · tabla vacía', () => {
  it('avisa de EMPTY_PRICE_TABLE antes del clic y bloquea publicar', () => {
    const html = render(
      'es',
      <PriceQuickEdit version={VERSION} initialTable={table({ perSquareMetre: null })} />,
    )

    expect(html).toContain('La tarifa no tiene precios cargados')
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Publicar<\/button>/)
  })
})

describe('PriceQuickEdit · versión no editable', () => {
  it('una versión publicada cierra el formulario y lo explica', () => {
    const html = render(
      'es',
      <PriceQuickEdit
        version={{ ...VERSION, status: 'published', effectiveFrom: '2026-09-13' }}
        initialTable={table()}
      />,
    )

    expect(html).toContain('Una tarifa publicada no se edita')
    expect(html).not.toContain('La tarifa no tiene precios cargados')
    expect(html).toContain(' disabled=""')
  })
})
