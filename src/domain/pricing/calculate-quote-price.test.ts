/**
 * Tabla de casos del motor de precios (ADR-0003): una prueba por estrategia, por modificador, por
 * redondeo y por cada camino de "a consultar".
 */

import { describe, expect, it } from 'vitest'

import {
  makeSeries,
  makeSizeRange,
  makeTariffVersion,
  TEST_NOW,
} from '@/domain/catalog/testing/factories'
import { Money } from '@/domain/shared/money'

import { calculateQuotePrice, type CalculateQuotePriceInput } from './calculate-quote-price'
import { makeBand, makeConfiguration, makeModifier, makePriceTable } from './testing/factories'

function input(overrides: Partial<CalculateQuotePriceInput> = {}): CalculateQuotePriceInput {
  return {
    series: overrides.series ?? makeSeries(),
    configuration: overrides.configuration ?? makeConfiguration(),
    tariff: overrides.tariff === undefined ? makeTariffVersion() : overrides.tariff,
    priceTable: overrides.priceTable === undefined ? makePriceTable() : overrides.priceTable,
    allowedColorIds: overrides.allowedColorIds ?? null,
    instant: overrides.instant ?? TEST_NOW,
  }
}

describe('calculateQuotePrice', () => {
  it('calcula el precio base por m² con IVA desglosado', () => {
    const result = calculateQuotePrice(
      input({ priceTable: makePriceTable({ perSquareMetre: Money.fromDecimalString('400') }) }),
    )

    // 0,90 × 2,10 = 1,89 m² × 400,00 €/m² = 756,00 €; IVA 21 % = 158,76 €.
    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.basePrice.toString()).toBe('756.00')
    expect(result.breakdown.subtotal.toString()).toBe('756.00')
    expect(result.breakdown.taxAmount.toString()).toBe('158.76')
    expect(result.breakdown.total.toString()).toBe('914.76')
    expect(result.breakdown.currency).toBe('EUR')
  })

  it('redondea la superficie al alza a tres decimales', () => {
    const result = calculateQuotePrice(
      input({
        series: makeSeries({ sizeRange: makeSizeRange(1, 10_000, 1, 10_000) }),
        configuration: makeConfiguration({ widthMm: 333, heightMm: 333 }),
        priceTable: makePriceTable({ perSquareMetre: Money.fromDecimalString('1000') }),
      }),
    )

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    // 0,110889 m² → 0,111 m² al alza.
    expect(result.breakdown.basePrice.toString()).toBe('111.00')
  })

  it('usa el precio fijo de la estrategia fixed', () => {
    const result = calculateQuotePrice(
      input({
        priceTable: makePriceTable({
          strategy: 'fixed',
          perSquareMetre: null,
          fixedPrice: Money.fromDecimalString('1450'),
        }),
      }),
    )

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.basePrice.toString()).toBe('1450.00')
  })

  it('elige la banda de medida que corresponde', () => {
    const priceTable = makePriceTable({
      strategy: 'size_bands',
      perSquareMetre: null,
      bands: [
        makeBand({ id: 'band-media', maxWidthMm: 950, price: Money.fromDecimalString('980') }),
        makeBand({
          id: 'band-alta',
          minWidthMm: 951,
          price: Money.fromDecimalString('1180'),
        }),
      ],
    })

    const result = calculateQuotePrice(input({ priceTable }))

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.basePrice.toString()).toBe('980.00')
  })

  it('pasa a presupuesto manual cuando la medida supera el tamaño máximo de la serie', () => {
    const result = calculateQuotePrice(
      input({ configuration: makeConfiguration({ widthMm: 1500, heightMm: 2100 }) }),
    )

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'size_exceeds_series_max',
    })
  })

  it('pasa a presupuesto manual cuando la medida no llega al mínimo de la serie', () => {
    const result = calculateQuotePrice(
      input({ configuration: makeConfiguration({ widthMm: 400, heightMm: 2100 }) }),
    )

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'uncovered_configuration',
    })
  })

  it('pasa a presupuesto manual cuando no hay tarifa vigente', () => {
    const result = calculateQuotePrice(input({ tariff: null, priceTable: null }))

    expect(result).toMatchObject({ status: 'manual_quote_required', reason: 'no_tariff_in_force' })
  })

  it('pasa a presupuesto manual cuando la tarifa no está publicada', () => {
    const result = calculateQuotePrice(
      input({ tariff: makeTariffVersion({ status: 'draft', publishedAt: null }) }),
    )

    expect(result).toMatchObject({ status: 'manual_quote_required', reason: 'no_tariff_in_force' })
  })

  it('pasa a presupuesto manual cuando la tarifa vigente no tiene precios cargados', () => {
    const result = calculateQuotePrice(input({ priceTable: null }))

    expect(result).toMatchObject({ status: 'manual_quote_required', reason: 'no_tariff_in_force' })
  })

  it('pasa a presupuesto manual cuando la tabla de precios es de otra versión de tarifa', () => {
    const result = calculateQuotePrice(
      input({ priceTable: makePriceTable({ tariffVersionId: 'tariff-ci-100-v2' }) }),
    )

    expect(result).toMatchObject({ status: 'manual_quote_required', reason: 'no_tariff_in_force' })
  })

  it('pasa a presupuesto manual cuando ninguna banda cubre la medida', () => {
    const result = calculateQuotePrice(
      input({
        configuration: makeConfiguration({ widthMm: 990, heightMm: 2190 }),
        priceTable: makePriceTable({
          strategy: 'size_bands',
          perSquareMetre: null,
          bands: [makeBand({ id: 'band-pequena', maxWidthMm: 800, maxHeightMm: 2000 })],
        }),
      }),
    )

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'uncovered_configuration',
    })
  })

  it('pasa a presupuesto manual cuando el acabado no es compatible con la serie', () => {
    const result = calculateQuotePrice(
      input({ configuration: makeConfiguration({ finishId: 'finish-no-permitido' }) }),
    )

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'uncovered_configuration',
    })
  })

  it('pasa a presupuesto manual cuando el accesorio no es compatible con la serie', () => {
    const result = calculateQuotePrice(
      input({ configuration: makeConfiguration({ accessoryIds: ['accessory-vidrio'] }) }),
    )

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'uncovered_configuration',
    })
  })

  it('pasa a presupuesto manual cuando el color no pertenece al acabado elegido', () => {
    const result = calculateQuotePrice(
      input({
        configuration: makeConfiguration({ finishId: 'finish-lacado', colorId: 'color-otro' }),
        allowedColorIds: ['color-ral-9010'],
      }),
    )

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'uncovered_configuration',
    })
  })

  it('suma los modificadores de acabado, color y accesorios en líneas separadas', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-lacado',
          code: 'ACABADO-LACADO',
          target: 'finish',
          targetId: 'finish-lacado',
          amount: Money.fromDecimalString('45'),
        }),
        makeModifier({
          id: 'modifier-color',
          code: 'COLOR-RAL-7016',
          target: 'color',
          targetId: 'color-ral-7016',
          amount: Money.fromDecimalString('25'),
        }),
        makeModifier({
          id: 'modifier-manilla',
          code: 'MANILLA',
          kind: 'per_unit',
          target: 'accessory',
          targetId: 'accessory-manilla',
          amount: Money.fromDecimalString('32'),
        }),
      ],
    })

    const result = calculateQuotePrice(
      input({
        configuration: makeConfiguration({
          finishId: 'finish-lacado',
          colorId: 'color-ral-7016',
          accessoryIds: ['accessory-manilla'],
        }),
        priceTable,
        allowedColorIds: ['color-ral-7016'],
      }),
    )

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.lines.map((line) => line.code)).toEqual([
      'base',
      'ACABADO-LACADO',
      'COLOR-RAL-7016',
      'MANILLA',
    ])
    expect(result.breakdown.subtotal.toString()).toBe('858.00')
  })

  it('no aplica modificadores de catálogo que no están en la configuración', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-lacado',
          code: 'ACABADO-LACADO',
          target: 'finish',
          targetId: 'finish-lacado',
          amount: Money.fromDecimalString('45'),
        }),
      ],
    })

    const result = calculateQuotePrice(input({ priceTable }))

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.lines).toHaveLength(1)
    expect(result.breakdown.subtotal.toString()).toBe('756.00')
  })

  it('aplica el porcentaje de urgencia sobre el precio base', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-urgencia',
          code: 'URGENCIA',
          kind: 'percentage',
          target: 'urgency',
          amount: null,
          percentage: '5',
        }),
      ],
    })

    const result = calculateQuotePrice(
      input({ configuration: makeConfiguration({ extras: ['urgency'] }), priceTable }),
    )

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    // 5 % de 756,00 € = 37,80 €.
    expect(result.breakdown.lines[1]?.amount.toString()).toBe('37.80')
    expect(result.breakdown.subtotal.toString()).toBe('793.80')
  })

  it('aplica el descuento solo cuando la configuración lleva su código', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-promo',
          code: 'PROMO10',
          kind: 'percentage',
          target: 'discount',
          targetId: 'PROMO10',
          amount: null,
          percentage: '10',
        }),
      ],
    })

    const withoutCode = calculateQuotePrice(input({ priceTable }))
    const withCode = calculateQuotePrice(
      input({ configuration: makeConfiguration({ discountCode: 'PROMO10' }), priceTable }),
    )

    expect(withoutCode.status).toBe('priced')
    expect(withCode.status).toBe('priced')

    if (withoutCode.status !== 'priced' || withCode.status !== 'priced') return

    expect(withoutCode.breakdown.subtotal.toString()).toBe('756.00')
    expect(withCode.breakdown.subtotal.toString()).toBe('680.40')
  })

  it('aplica los descuentos automáticos (sin código)', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-promo',
          code: 'PROMO-AUTO',
          kind: 'fixed',
          target: 'discount',
          targetId: null,
          amount: Money.fromDecimalString('56'),
        }),
      ],
    })

    const result = calculateQuotePrice(input({ priceTable }))

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.subtotal.toString()).toBe('700.00')
  })

  it('nunca deja el subtotal por debajo de cero', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-promo',
          code: 'PROMO-LOCO',
          kind: 'fixed',
          target: 'discount',
          targetId: null,
          amount: Money.fromDecimalString('5000'),
        }),
      ],
    })

    const result = calculateQuotePrice(input({ priceTable }))

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.subtotal.toString()).toBe('0.00')
    expect(result.breakdown.taxAmount.toString()).toBe('0.00')
    expect(result.breakdown.total.toString()).toBe('0.00')
    expect(result.breakdown.lines[1]?.amount.toString()).toBe('756.00')
  })

  it('mantiene la coherencia entre líneas, subtotal, IVA y total', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-instalacion',
          code: 'INSTALACION',
          target: 'installation',
          amount: Money.fromDecimalString('180'),
        }),
        makeModifier({
          id: 'modifier-promo',
          code: 'PROMO10',
          kind: 'percentage',
          target: 'discount',
          targetId: 'PROMO10',
          amount: null,
          percentage: '10',
        }),
      ],
    })

    const result = calculateQuotePrice(
      input({
        configuration: makeConfiguration({ extras: ['installation'], discountCode: 'PROMO10' }),
        priceTable,
      }),
    )

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    const linesTotal = result.breakdown.lines.reduce(
      (accumulated, line) =>
        line.kind === 'discount'
          ? accumulated - line.amount.cents
          : accumulated + line.amount.cents,
      0n,
    )

    expect(linesTotal).toBe(result.breakdown.subtotal.cents)
    expect(result.breakdown.subtotal.add(result.breakdown.taxAmount).toString()).toBe(
      result.breakdown.total.toString(),
    )
    // 756 + 180 = 936; 10 % = 93,60 → 842,40; IVA 21 % = 176,90 (redondeo half-up).
    expect(result.breakdown.subtotal.toString()).toBe('842.40')
    expect(result.breakdown.taxAmount.toString()).toBe('176.90')
  })

  it('no aplica un modificador de accesorio si el accesorio no está elegido', () => {
    const priceTable = makePriceTable({
      modifiers: [
        makeModifier({
          id: 'modifier-manilla',
          code: 'MANILLA',
          target: 'accessory',
          targetId: 'accessory-manilla',
          amount: Money.fromDecimalString('32'),
        }),
      ],
    })

    const result = calculateQuotePrice(input({ priceTable }))

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.breakdown.lines).toHaveLength(1)
  })
})
