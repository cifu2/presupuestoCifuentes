import { describe, expect, it } from 'vitest'

import { InvalidMeasurementError, ResourceNotFoundError } from '@/domain/shared/errors'

import { makeTestWorld, makePriceInput } from '@/infrastructure/testing/fixtures'
import { calculatePrice } from './calculate-price'

function deps(world: ReturnType<typeof makeTestWorld>) {
  return {
    seriesRepository: world.seriesRepository,
    tariffPricingRepository: world.tariffPricingRepository,
    colorRepository: world.colorRepository,
    clock: world.clock,
  }
}

describe('calculatePrice', () => {
  it('devuelve el desglose con la tarifa vigente aplicada', async () => {
    const world = makeTestWorld()

    const result = await calculatePrice(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      locale: 'es',
    })

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    expect(result.series.slug).toBe('ci-100')
    expect(result.tariff.id).toBe('tariff-ci-100-v1')
    expect(result.breakdown.total.amount).toBe('914.76')
    expect(result.breakdown.taxRatePercent).toBe('21.00')
  })

  it('aplica modificadores de instalación, accesorios y descuento', async () => {
    const world = makeTestWorld()

    const result = await calculatePrice(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      accessoryIds: ['accessory-manilla'],
      extras: ['installation'],
      discountCode: 'PROMO10',
      locale: 'es',
    })

    expect(result.status).toBe('priced')

    if (result.status !== 'priced') return

    // 756 + 32 + 180 = 968; 10 % = 96,80 → 871,20; IVA 21 % = 182,96 (redondeo half-up).
    expect(result.breakdown.subtotal.amount).toBe('871.20')
    expect(result.breakdown.taxAmount.amount).toBe('182.95')
    expect(result.breakdown.lines.map((line) => line.code)).toEqual([
      'base',
      'INSTALACION',
      'MANILLA',
      'PROMO10',
    ])
  })

  it('pasa a presupuesto manual cuando la serie no tiene tarifa vigente', async () => {
    const world = makeTestWorld()

    const result = await calculatePrice(deps(world), {
      slug: 'ci-400',
      ...makePriceInput(),
      locale: 'es',
    })

    expect(result).toMatchObject({ status: 'manual_quote_required', reason: 'no_tariff_in_force' })
  })

  it('pasa a presupuesto manual cuando la medida supera el tamaño máximo', async () => {
    const world = makeTestWorld()

    const result = await calculatePrice(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      widthMm: 1200,
      locale: 'es',
    })

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'size_exceeds_series_max',
    })
  })

  it('lanza NOT_FOUND si la serie no está publicada', async () => {
    const world = makeTestWorld()

    await expect(
      calculatePrice(deps(world), { slug: 'ci-999', ...makePriceInput(), locale: 'es' }),
    ).rejects.toThrow(ResourceNotFoundError)
  })

  it('rechaza medidas fuera de los límites representables', async () => {
    const world = makeTestWorld()

    await expect(
      calculatePrice(deps(world), {
        slug: 'ci-100',
        ...makePriceInput(),
        widthMm: 0,
        locale: 'es',
      }),
    ).rejects.toThrow(InvalidMeasurementError)
  })
})
