import { describe, expect, it } from 'vitest'

import { UnsupportedLocaleError } from '@/domain/shared/errors'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, parseLocale } from './locale'

describe('idiomas del catálogo', () => {
  it('usa el español como idioma por defecto entre los soportados', () => {
    expect(DEFAULT_LOCALE).toBe('es')
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE)
  })

  it('reconoce los idiomas soportados', () => {
    expect(isSupportedLocale('es')).toBe(true)
    expect(isSupportedLocale('en')).toBe(true)
    expect(isSupportedLocale('fr')).toBe(false)
    expect(isSupportedLocale('ES')).toBe(false)
  })

  it('normaliza mayúsculas y espacios al interpretar un idioma', () => {
    expect(parseLocale(' EN ')).toBe('en')
    expect(parseLocale('es')).toBe('es')
  })

  it('rechaza idiomas no soportados con un error tipado', () => {
    expect(() => parseLocale('fr')).toThrow(UnsupportedLocaleError)
    expect(() => parseLocale('de')).toThrow(/no soportado/i)
  })
})
