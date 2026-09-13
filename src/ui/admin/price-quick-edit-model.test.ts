/**
 * Lógica de la edición rápida de precios (CIF-243).
 *
 * El caso que más importa es el diff: el API reemplaza la tabla completa de la versión, así que si el
 * formulario mandara los campos que nadie tocó, guardar un precio borraría el otro. Aquí se fija que
 * «no tocado» viaja ausente y «vaciado» viaja como `null`.
 */

import { describe, expect, it } from 'vitest'

import {
  diffPriceQuickEdit,
  EMPTY_FORM,
  isEmptyPriceTable,
  normalizePriceInput,
  priceEditLockReason,
  toPriceQuickEditForm,
  type PriceTableView,
} from './price-quick-edit-model'

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

describe('normalizePriceInput', () => {
  it('acepta el decimal del borde y la coma del teclado español', () => {
    expect(normalizePriceInput('450')).toEqual({ ok: true, value: '450' })
    expect(normalizePriceInput('450.50')).toEqual({ ok: true, value: '450.50' })
    expect(normalizePriceInput(' 450,50 ')).toEqual({ ok: true, value: '450.50' })
  })

  it('un campo vacío significa «vaciar el precio», no «no tocarlo»', () => {
    expect(normalizePriceInput('   ')).toEqual({ ok: true, value: null })
  })

  it('rechaza lo que el API respondería con 400', () => {
    expect(normalizePriceInput('cuatrocientos')).toEqual({ ok: false })
    expect(normalizePriceInput('450,50.25')).toEqual({ ok: false })
    expect(normalizePriceInput('1e3')).toEqual({ ok: false })
  })
})

describe('toPriceQuickEditForm', () => {
  it('precarga los importes de la tabla leída', () => {
    expect(
      toPriceQuickEditForm(table({ fixedPrice: { amount: '900.00', currency: 'EUR' } })),
    ).toEqual({ perSquareMetre: '450.00', fixedPrice: '900.00' })
  })

  it('sin tabla (borrador recién creado) deja los campos vacíos', () => {
    expect(toPriceQuickEditForm(null)).toEqual(EMPTY_FORM)
  })
})

describe('diffPriceQuickEdit', () => {
  const initial = toPriceQuickEditForm(table({ fixedPrice: { amount: '900.00', currency: 'EUR' } }))

  it('no envía nada si el propietario no ha cambiado nada', () => {
    expect(diffPriceQuickEdit(initial, { ...initial })).toEqual({
      ok: true,
      patch: {},
      changed: false,
    })
  })

  it('envía solo el campo tocado: el otro precio no se reescribe', () => {
    expect(diffPriceQuickEdit(initial, { ...initial, perSquareMetre: '470,25' })).toEqual({
      ok: true,
      patch: { perSquareMetre: '470.25' },
      changed: true,
    })
  })

  it('vaciar un campo viaja como `null` explícito', () => {
    expect(diffPriceQuickEdit(initial, { ...initial, fixedPrice: '' })).toEqual({
      ok: true,
      patch: { fixedPrice: null },
      changed: true,
    })
  })

  it('un importe ilegible señalando el campo y sin mandar nada', () => {
    expect(diffPriceQuickEdit(initial, { ...initial, fixedPrice: 'novecientos' })).toEqual({
      ok: false,
      field: 'fixedPrice',
    })
  })
})

describe('isEmptyPriceTable', () => {
  it('sin tabla o sin ningún importe, publicar respondería EMPTY_PRICE_TABLE', () => {
    expect(isEmptyPriceTable(null)).toBe(true)
    expect(isEmptyPriceTable(table({ perSquareMetre: null }))).toBe(true)
  })

  it('con un precio base o con bandas, la tabla no está vacía', () => {
    expect(isEmptyPriceTable(table())).toBe(false)
    expect(isEmptyPriceTable(table({ perSquareMetre: null, bands: [{}] }))).toBe(false)
  })
})

describe('priceEditLockReason', () => {
  it('solo el borrador se edita', () => {
    expect(priceEditLockReason('draft')).toBeNull()
    expect(priceEditLockReason('published')).toBe('published')
    expect(priceEditLockReason('archived')).toBe('archived')
  })
})
