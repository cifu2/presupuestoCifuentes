import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/domain/catalog/locale'

import { buildLocaleAlternates } from './alternates'

describe('alternativas por ruta', () => {
  it('apunta la raíz a la portada de cada idioma', () => {
    expect(buildLocaleAlternates('/', 'es')).toEqual({
      canonical: '/es',
      languages: { es: '/es', en: '/en', 'x-default': '/es' },
    })
  })

  it('mantiene la ruta hermana en una ruta anidada', () => {
    expect(buildLocaleAlternates('/configurador', 'en')).toEqual({
      canonical: '/en/configurador',
      languages: {
        es: '/es/configurador',
        en: '/en/configurador',
        'x-default': '/es/configurador',
      },
    })
  })

  it('ignora la query y el fragmento en la canónica', () => {
    expect(buildLocaleAlternates('/configurador?v=2&modelo=alba', 'es')).toEqual(
      buildLocaleAlternates('/configurador', 'es'),
    )
    expect(buildLocaleAlternates('/configurador#acabados', 'es').canonical).toBe('/es/configurador')
  })

  it('normaliza barras sobrantes y rutas vacías', () => {
    expect(buildLocaleAlternates('/configurador/', 'es')).toEqual(
      buildLocaleAlternates('/configurador', 'es'),
    )
    expect(buildLocaleAlternates('//configurador//medidas', 'es').canonical).toBe(
      '/es/configurador/medidas',
    )
    expect(buildLocaleAlternates('', 'es').canonical).toBe('/es')
  })

  it('deduce el idioma activo del prefijo de la ruta', () => {
    expect(buildLocaleAlternates('/en/configurador')).toEqual(
      buildLocaleAlternates('/configurador', 'en'),
    )
  })

  it('prioriza el idioma explícito sobre el prefijo de la ruta', () => {
    expect(buildLocaleAlternates('/en/configurador', 'es').canonical).toBe('/es/configurador')
  })

  it('declara una alternativa por idioma soportado, con x-default al idioma por defecto', () => {
    const { languages } = buildLocaleAlternates('/panel', 'en')

    for (const locale of SUPPORTED_LOCALES) {
      expect(languages[locale]).toBe(`/${locale}/panel`)
    }
    expect(languages['x-default']).toBe(`/${DEFAULT_LOCALE}/panel`)
  })
})
