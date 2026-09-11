import { describe, expect, it } from 'vitest'

import { InvalidValueError } from '@/domain/shared/errors'

import { makeConfiguration } from './testing/factories'

describe('QuoteConfiguration', () => {
  it('exige un acabado antes de elegir color', () => {
    expect(() => makeConfiguration({ colorId: 'color-ral-9010' })).toThrow(InvalidValueError)
  })

  it('rechaza accesorios repetidos', () => {
    expect(() =>
      makeConfiguration({ accessoryIds: ['accessory-manilla', 'accessory-manilla'] }),
    ).toThrow(InvalidValueError)
  })

  it('rechaza extras desconocidos o repetidos', () => {
    expect(() => makeConfiguration({ extras: ['installation', 'installation'] })).toThrow(
      InvalidValueError,
    )
  })

  it('rechaza un código de descuento vacío', () => {
    expect(() => makeConfiguration({ discountCode: '   ' })).toThrow(InvalidValueError)
  })

  it('congela la configuración en una instantánea plana', () => {
    const configuration = makeConfiguration({
      widthMm: 800,
      heightMm: 2000,
      finishId: 'finish-lacado',
      colorId: 'color-ral-9010',
      accessoryIds: ['accessory-manilla'],
      extras: ['installation'],
      discountCode: 'PROMO10',
    })

    expect(configuration.toSnapshot()).toEqual({
      seriesId: 'series-ci-100',
      widthMm: 800,
      heightMm: 2000,
      finishId: 'finish-lacado',
      colorId: 'color-ral-9010',
      accessoryIds: ['accessory-manilla'],
      extras: ['installation'],
      discountCode: 'PROMO10',
    })
    expect(configuration.hasExtra('installation')).toBe(true)
    expect(configuration.usesAccessory('accessory-manilla')).toBe(true)
    expect(configuration.usesDiscountCode('PROMO10')).toBe(true)
    expect(configuration.usesDiscountCode('OTRO')).toBe(false)
  })
})
