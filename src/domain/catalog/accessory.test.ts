import { describe, expect, it } from 'vitest'

import {
  InvalidCatalogTransitionError,
  InvalidCatalogValueError,
  InvalidValueError,
} from '@/domain/shared/errors'

import { makeAccessory, TEST_NOW } from './testing/factories'

describe('Accessory', () => {
  it('crea un accesorio con su categoría', () => {
    const accessory = makeAccessory()

    expect(accessory.category).toBe('hardware')
    expect(accessory.isPublished()).toBe(true)
  })

  it('rechaza categorías desconocidas', () => {
    expect(() =>
      makeAccessory({
        // @ts-expect-error: comprobamos la validación de datos que llegan sin tipar del panel
        category: 'pintura',
      }),
    ).toThrow(InvalidValueError)
  })

  it('valida el código y las fechas', () => {
    expect(() => makeAccessory({ code: 'manilla' })).toThrow(InvalidCatalogValueError)
    expect(() => makeAccessory({ createdAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
  })

  it('recorre el ciclo editorial con validación de transiciones', () => {
    const draft = makeAccessory({ status: 'draft' })
    const archived = draft.publish(TEST_NOW).archive(TEST_NOW)

    expect(archived.status).toBe('archived')
    expect(archived.restore(TEST_NOW).status).toBe('draft')
    expect(() => archived.publish(TEST_NOW)).toThrow(InvalidCatalogTransitionError)
  })
})
