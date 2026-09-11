import { describe, expect, it } from 'vitest'

import { InvalidCatalogValueError, InvalidValueError } from '@/domain/shared/errors'

import { makeColor, TEST_NOW } from './testing/factories'

describe('Color', () => {
  it('crea un color asociado a un acabado', () => {
    const color = makeColor()

    expect(color.finishId).toBe('finish-lacado')
    expect(color.hex).toBe('#F1EDE1')
  })

  it('normaliza el hexadecimal a mayúsculas', () => {
    expect(makeColor({ hex: '#f1ede1' }).hex).toBe('#F1EDE1')
  })

  it('admite colores sin hexadecimal y rechaza los mal formados', () => {
    expect(makeColor({ hex: null }).hex).toBeNull()
    expect(() => makeColor({ hex: '#GGGGGG' })).toThrow(InvalidCatalogValueError)
    expect(() => makeColor({ hex: 'F1EDE1' })).toThrow(InvalidCatalogValueError)
  })

  it('exige acabado, código y fechas válidos', () => {
    expect(() => makeColor({ finishId: '' })).toThrow(InvalidValueError)
    expect(() => makeColor({ code: 'ral 9010' })).toThrow(InvalidCatalogValueError)
    expect(() => makeColor({ updatedAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
  })

  it('recorre el ciclo editorial con validación de transiciones', () => {
    const draft = makeColor({ status: 'draft' })

    const archived = draft.publish(TEST_NOW).archive(TEST_NOW)

    expect(draft.publish(TEST_NOW).isPublished()).toBe(true)
    expect(archived.status).toBe('archived')
    expect(archived.restore(TEST_NOW).status).toBe('draft')
    expect(() => draft.publish(new Date('no-es-fecha'))).toThrow(InvalidValueError)
  })
})
