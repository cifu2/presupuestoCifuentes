import { describe, expect, it } from 'vitest'

import { InvalidCatalogTextError } from '@/domain/shared/errors'

import { LocalizedText } from './catalog-text'

describe('LocalizedText', () => {
  it('resuelve el texto en el idioma pedido', () => {
    const text = LocalizedText.of({ es: 'Puerta blindada', en: 'Armoured door' })

    expect(text.resolve('es')).toBe('Puerta blindada')
    expect(text.resolve('en')).toBe('Armoured door')
  })

  it('cae al español cuando falta la traducción', () => {
    const text = LocalizedText.single('Manilla')

    expect(text.resolve('en')).toBe('Manilla')
    expect(text.hasTranslation('en')).toBe(false)
  })

  it('informa de los idiomas pendientes de traducir para el panel', () => {
    const text = LocalizedText.of({ es: 'Lacado' })

    expect(text.availableLocales()).toEqual(['es'])
    expect(text.missingLocales()).toEqual(['en'])
  })

  it('considera traducido un idioma con texto propio', () => {
    const text = LocalizedText.of({ es: 'Lacado', en: 'Lacquered' })

    expect(text.hasTranslation('en')).toBe(true)
    expect(text.availableLocales()).toEqual(['es', 'en'])
    expect(text.missingLocales()).toEqual([])
  })

  it('recorta los espacios y trata los textos en blanco como ausentes', () => {
    const text = LocalizedText.of({ es: '  Lacado  ', en: '   ' })

    expect(text.resolve('es')).toBe('Lacado')
    expect(text.resolve('en')).toBe('Lacado')
    expect(text.missingLocales()).toEqual(['en'])
  })

  it('exige el idioma por defecto para crear un texto', () => {
    expect(() => LocalizedText.of({ es: '   ' })).toThrow(InvalidCatalogTextError)
  })

  it('exige el idioma por defecto aunque haya traducciones en otros idiomas', () => {
    expect(() => LocalizedText.of({ es: '   ', en: 'Armoured door' })).toThrow(
      InvalidCatalogTextError,
    )
  })
})
