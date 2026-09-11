import { describe, expect, it } from 'vitest'

import { resolveEnvironment } from './env'

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
