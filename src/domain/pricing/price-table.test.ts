import { describe, expect, it } from 'vitest'

import { Dimensions } from '@/domain/catalog/measurement'
import { InvalidTariffVersionError, InvalidValueError } from '@/domain/shared/errors'
import { Money } from '@/domain/shared/money'

import { PriceModifier, PriceTable } from './price-table'
import { makeBand, makeModifier, makePriceTable } from './testing/factories'

describe('PriceTable', () => {
  it('exige precio por m² en la estrategia per_square_metre', () => {
    expect(() => makePriceTable({ perSquareMetre: null })).toThrow(InvalidTariffVersionError)
  })

  it('rechaza precio por m² y precio fijo a la vez', () => {
    expect(() => makePriceTable({ fixedPrice: Money.fromDecimalString('100') })).toThrow(
      InvalidTariffVersionError,
    )
  })

  it('exige al menos una banda en la estrategia size_bands', () => {
    expect(() => makePriceTable({ strategy: 'size_bands', perSquareMetre: null })).toThrow(
      InvalidTariffVersionError,
    )
  })

  it('rechaza bandas que se solapan: una medida no puede tener dos precios', () => {
    expect(() =>
      makePriceTable({
        strategy: 'size_bands',
        perSquareMetre: null,
        bands: [
          makeBand({ id: 'band-a', minWidthMm: 600, maxWidthMm: 900 }),
          makeBand({ id: 'band-b', minWidthMm: 800, maxWidthMm: 1000 }),
        ],
      }),
    ).toThrow(InvalidTariffVersionError)
  })

  it('rechaza una banda con el mínimo por encima del máximo', () => {
    expect(() => makeBand({ minWidthMm: 900, maxWidthMm: 800 })).toThrow(InvalidTariffVersionError)
  })

  it('exige importe en los modificadores fijos y porcentaje en los porcentuales', () => {
    expect(() => makeModifier({ kind: 'fixed', amount: null })).toThrow(InvalidTariffVersionError)
    expect(() => makeModifier({ kind: 'percentage', amount: null, percentage: null })).toThrow(
      InvalidTariffVersionError,
    )
  })

  it('exige targetId en los modificadores de acabado, color o accesorio', () => {
    expect(() => makeModifier({ target: 'finish', targetId: null })).toThrow(
      InvalidTariffVersionError,
    )
  })

  it('no admite targetId en instalación, portes y urgencia', () => {
    expect(() => makeModifier({ target: 'installation', targetId: 'algo' })).toThrow(
      InvalidTariffVersionError,
    )
  })

  it('calcula el precio base por m² redondeando la superficie al alza', () => {
    const table = makePriceTable({ perSquareMetre: Money.fromDecimalString('1000') })

    const price = table.basePriceFor(Dimensions.of(333, 333))

    // 110.889 mm² = 0,110889 m² → 0,111 m² redondeando al alza.
    expect(price?.toString()).toBe('111.00')
  })

  it('aplica la banda que contiene la medida', () => {
    const table = makePriceTable({
      strategy: 'size_bands',
      perSquareMetre: null,
      bands: [
        makeBand({ id: 'band-media', maxWidthMm: 950, price: Money.fromDecimalString('980') }),
        makeBand({
          id: 'band-alta',
          minHeightMm: 2201,
          maxHeightMm: 2400,
          price: Money.fromDecimalString('1320'),
        }),
      ],
    })

    expect(table.basePriceFor(Dimensions.of(900, 2100))?.toString()).toBe('980.00')
    expect(table.basePriceFor(Dimensions.of(900, 2300))?.toString()).toBe('1320.00')
    expect(table.basePriceFor(Dimensions.of(1200, 2100))).toBeNull()
  })

  it('devuelve el precio fijo sin mirar la medida', () => {
    const table = PriceTable.create({
      tariffVersionId: 'tariff-fixed',
      strategy: 'fixed',
      perSquareMetre: null,
      fixedPrice: Money.fromDecimalString('1450'),
      bands: [],
      modifiers: [],
    })

    expect(table.basePriceFor(Dimensions.of(800, 2000))?.toString()).toBe('1450.00')
  })

  it('valida código y porcentaje del modificador', () => {
    expect(() => PriceModifier.create({ ...validModifier(), code: ' ' })).toThrow(InvalidValueError)
    expect(() => makeModifier({ kind: 'percentage', amount: null, percentage: '101' })).toThrow(
      InvalidValueError,
    )
  })
})

function validModifier(): Parameters<typeof PriceModifier.create>[0] {
  return {
    id: 'modifier-1',
    code: 'EXTRA',
    label: null,
    kind: 'fixed',
    target: 'installation',
    targetId: null,
    amount: Money.fromDecimalString('10'),
    percentage: null,
  }
}
