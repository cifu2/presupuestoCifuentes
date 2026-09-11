import { describe, expect, it } from 'vitest'

import {
  InvalidCatalogTransitionError,
  InvalidCatalogValueError,
  InvalidValueError,
} from '@/domain/shared/errors'

import { makeFinish, TEST_NOW } from './testing/factories'

describe('Finish', () => {
  it('crea un acabado publicado', () => {
    const finish = makeFinish()

    expect(finish.code).toBe('LACADO')
    expect(finish.isPublished()).toBe(true)
  })

  it('valida el código, el orden y las fechas', () => {
    expect(() => makeFinish({ code: 'lacado' })).toThrow(InvalidCatalogValueError)
    expect(() => makeFinish({ sortOrder: 1.5 })).toThrow(InvalidValueError)
    expect(() => makeFinish({ createdAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
  })

  it('recorre el ciclo editorial con validación de transiciones', () => {
    const draft = makeFinish({ status: 'draft' })
    const published = draft.publish(TEST_NOW)
    const archived = published.archive(TEST_NOW)

    expect(published.isPublished()).toBe(true)
    expect(archived.status).toBe('archived')
    expect(archived.restore(TEST_NOW).status).toBe('draft')
    expect(() => archived.publish(TEST_NOW)).toThrow(InvalidCatalogTransitionError)
    expect(() => draft.publish(new Date('no-es-fecha'))).toThrow(InvalidValueError)
  })
})
