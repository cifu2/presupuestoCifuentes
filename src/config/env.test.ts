import { describe, expect, it } from 'vitest'

import { environmentFlag, resolveEnvironment } from './env'

describe('environmentFlag', () => {
  it('interpreta el texto "false" como false (hallazgo B1 de CIF-71)', () => {
    expect(environmentFlag.parse('false')).toBe(false)
    expect(environmentFlag.parse('0')).toBe(false)
    expect(environmentFlag.parse('no')).toBe(false)
  })

  it('interpreta el texto "true" como true', () => {
    expect(environmentFlag.parse('true')).toBe(true)
    expect(environmentFlag.parse('1')).toBe(true)
    expect(environmentFlag.parse('yes')).toBe(true)
  })

  it('cae en false cuando la variable no está definida o llega vacía', () => {
    expect(environmentFlag.parse(undefined)).toBe(false)
    expect(environmentFlag.parse('')).toBe(false)
    expect(environmentFlag.parse('   ')).toBe(false)
  })

  it('rechaza valores ambiguos en vez de coercionarlos', () => {
    expect(environmentFlag.safeParse('quizá').success).toBe(false)
  })
})

describe('resolveEnvironment', () => {
  it('prioriza VERCEL_ENV cuando el despliegue corre en Vercel', () => {
    expect(resolveEnvironment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe('preview')
    expect(resolveEnvironment({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(
      'production',
    )
  })

  it('cae en NODE_ENV fuera de Vercel (local, tests y CI)', () => {
    expect(resolveEnvironment({ VERCEL_ENV: undefined, NODE_ENV: 'development' })).toBe(
      'development',
    )
    expect(resolveEnvironment({ VERCEL_ENV: undefined, NODE_ENV: 'test' })).toBe('test')
  })
})
