import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/domain/catalog/locale'

import { routing } from './routing'

describe('enrutado por idioma', () => {
  it('ofrece exactamente los idiomas del dominio', () => {
    expect(routing.locales).toEqual(SUPPORTED_LOCALES)
    expect(routing.defaultLocale).toBe(DEFAULT_LOCALE)
  })

  it('prefija todas las URLs con el idioma', () => {
    const prefix =
      typeof routing.localePrefix === 'string' ? routing.localePrefix : routing.localePrefix?.mode

    expect(prefix).toBe('always')
  })
})
