import { describe, expect, it } from 'vitest'

import { firstParam, loadSection, requestedState } from './panel-loading'

describe('carga de secciones del panel', () => {
  it('devuelve el estado listo con los datos del lector', async () => {
    const result = await loadSection({
      requested: undefined,
      load: async () => [1, 2],
      isEmpty: (data) => data.length === 0,
    })

    expect(result).toEqual({ state: 'ready', data: [1, 2] })
  })

  it('marca vacío cuando el lector no devuelve nada', async () => {
    const result = await loadSection({
      requested: undefined,
      load: async () => [],
      isEmpty: (data: unknown[]) => data.length === 0,
    })

    expect(result.state).toBe('empty')
  })

  it('pinta el estado de error si el lector falla, sin propagar la excepción', async () => {
    const result = await loadSection({
      requested: undefined,
      load: async () => {
        throw new Error('fallo del lector')
      },
      isEmpty: () => false,
    })

    expect(result).toEqual({ state: 'error', data: null })
  })

  it('respeta el estado forzado por la URL aunque haya datos', async () => {
    const result = await loadSection({
      requested: 'forbidden',
      load: async () => [1],
      isEmpty: () => false,
    })

    expect(result.state).toBe('forbidden')
  })

  it('lee el primer valor de un parámetro repetido', () => {
    expect(firstParam(['a', 'b'])).toBe('a')
    expect(firstParam('a')).toBe('a')
    expect(firstParam(undefined)).toBeUndefined()
    expect(requestedState({ state: ['empty', 'error'] })).toBe('empty')
  })
})
