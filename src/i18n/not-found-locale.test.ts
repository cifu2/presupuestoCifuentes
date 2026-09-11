import { describe, expect, it } from 'vitest'

import { resolveNotFoundLocale } from './not-found-locale'

describe('idioma del 404 global', () => {
  it('usa el español cuando no hay ninguna señal', () => {
    expect(resolveNotFoundLocale({})).toBe('es')
    expect(resolveNotFoundLocale({ localeHeader: null, localeCookie: null })).toBe('es')
  })

  it('da prioridad a la cabecera del middleware', () => {
    expect(
      resolveNotFoundLocale({
        localeHeader: 'en',
        localeCookie: 'es',
        acceptLanguage: 'es-ES,es;q=0.9',
      }),
    ).toBe('en')
  })

  it('acepta la etiqueta con región y normaliza mayúsculas', () => {
    expect(resolveNotFoundLocale({ localeHeader: 'EN-gb' })).toBe('en')
    expect(resolveNotFoundLocale({ localeCookie: ' Es ' })).toBe('es')
  })

  it('ignora señales con idiomas no soportados y sigue bajando de prioridad', () => {
    expect(
      resolveNotFoundLocale({ localeHeader: 'fr', localeCookie: 'de', acceptLanguage: 'en' }),
    ).toBe('en')
  })

  it('negocia con Accept-Language respetando la calidad', () => {
    expect(resolveNotFoundLocale({ acceptLanguage: 'en-GB,en;q=0.9,es;q=0.8' })).toBe('en')
    expect(resolveNotFoundLocale({ acceptLanguage: 'fr-FR,es;q=0.7,en;q=0.9' })).toBe('en')
    expect(resolveNotFoundLocale({ acceptLanguage: 'es;q=0.7,en;q=0.9' })).toBe('en')
  })

  it('descarta los idiomas marcados como no aceptables', () => {
    expect(resolveNotFoundLocale({ acceptLanguage: 'en;q=0,es;q=0.5' })).toBe('es')
    expect(resolveNotFoundLocale({ acceptLanguage: 'en;q=0,*;q=0.5' })).toBe('es')
  })

  it('cae al español ante una cabecera vacía o ilegible', () => {
    expect(resolveNotFoundLocale({ acceptLanguage: '' })).toBe('es')
    expect(resolveNotFoundLocale({ acceptLanguage: '???' })).toBe('es')
    expect(resolveNotFoundLocale({ acceptLanguage: 'en;q=abc' })).toBe('es')
  })
})
