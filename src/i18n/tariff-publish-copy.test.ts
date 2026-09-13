/**
 * Contrato de copy del panel al publicar tarifas (ADR-0003 rev. 2 §12, CIF-545).
 *
 * La confirmación de publicación y el aviso de `TARIFF_NOT_EDITABLE` son texto de usuario, no
 * contrato de API: anuncian la **fecha de entrada en vigor** de la versión nueva, dicen que la
 * anterior deja de estar vigente en ese mismo instante y no prometen nada que el motor no haga —ni
 * «la serie se queda sin tarifa», ni dos pasos, ni jerga del motor—. El copy se comprueba en las dos
 * lenguas y **renderizado con ICU**, que es como lo lee el propietario: un texto con `{date}` mal
 * puesto no pasaría por aquí.
 */

import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import en from '../../messages/en.json'
import es from '../../messages/es.json'

const DICTIONARIES: Readonly<Record<Locale, typeof es>> = { es, en }

/** Lo que la confirmación y el aviso tienen que decir, por idioma (ADR-0003 rev. 2 §12). */
const REQUIRED_COPY: Readonly<
  Record<
    Locale,
    {
      readonly effect: string
      readonly predecessor: string
      readonly notice: string
      readonly noticeEffect: string
    }
  >
> = {
  es: {
    effect: 'Entra en vigor el',
    predecessor: 'la versión anterior deja de estar vigente',
    notice: 'Una tarifa publicada no se edita',
    noticeEffect: 'entra en vigor en su fecha',
  },
  en: {
    effect: 'It enters into force on',
    predecessor: 'the previous version stops being in force',
    notice: 'A published price list is not edited',
    noticeEffect: 'enters into force on its date',
  },
}

/** Frases y códigos que el copy no puede contener: prometerían una salida que no existe. */
const FORBIDDEN = [
  'se queda sin tarifa',
  'queda sin tarifa',
  'left without a price list',
  'dos pasos',
  'two steps',
  'TARIFF_NOT_EDITABLE',
  'AMBIGUOUS_TARIFF',
  '409',
  'validFrom',
  'validUntil',
] as const

const SAMPLE_DATE = '1 de junio de 2026'

function panelCopy(locale: Locale) {
  return createTranslator({ locale, messages: DICTIONARIES[locale], namespace: 'CatalogAdmin' })
}

function errorCopy(locale: Locale) {
  return createTranslator({ locale, messages: DICTIONARIES[locale], namespace: 'DomainErrors' })
}

describe('copy del panel al publicar una tarifa', () => {
  it.each(SUPPORTED_LOCALES)(
    'la confirmación de %s anuncia la fecha de entrada en vigor y qué le pasa a la anterior',
    (locale) => {
      const t = panelCopy(locale)
      const rendered = t('confirm.publishTariffBody', { date: SAMPLE_DATE })

      expect(t('confirm.publishTariffTitle').trim()).not.toBe('')
      expect(rendered).toContain(SAMPLE_DATE)
      expect(rendered).toContain(REQUIRED_COPY[locale].effect)
      expect(rendered).toContain(REQUIRED_COPY[locale].predecessor)
    },
  )

  it.each(SUPPORTED_LOCALES)(
    'el aviso de %s dice que una tarifa publicada no se edita y dónde va el cambio',
    (locale) => {
      const notice = panelCopy(locale)('tariffs.notEditable')
      const error = errorCopy(locale)('TARIFF_NOT_EDITABLE')

      expect(notice).toContain(REQUIRED_COPY[locale].notice)
      expect(notice).toContain(REQUIRED_COPY[locale].noticeEffect)
      expect(error).toContain(REQUIRED_COPY[locale].notice)
      expect(error.trim()).not.toBe('')
    },
  )

  it('no promete una salida que no exista ni filtra jerga del motor', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = panelCopy(locale)
      const copy = [
        t('confirm.publishTariffBody', { date: SAMPLE_DATE }),
        t('confirm.publishTariffTitle'),
        t('tariffs.notEditable'),
        errorCopy(locale)('TARIFF_NOT_EDITABLE'),
      ].join('\n')

      for (const forbidden of FORBIDDEN) {
        expect(copy, `${locale} no puede decir «${forbidden}»`).not.toContain(forbidden)
      }
    }
  })
})
