/**
 * Idioma del 404 global.
 *
 * El 404 se renderiza fuera del segmento `[locale]` (ver `docs/i18n.md`), así que el idioma no
 * llega por `params`: se deduce de lo que acompaña a la petición, en este orden
 *
 * 1. Cabecera `X-NEXT-INTL-LOCALE`, que fija el middleware de next-intl con el idioma ya negociado
 *    (prefijo de la URL → cookie `NEXT_LOCALE` → `Accept-Language`).
 * 2. Cookie `NEXT_LOCALE`, por si la petición no pasó por el middleware.
 * 3. Cabecera `Accept-Language`.
 * 4. Español, el idioma por defecto.
 *
 * Es una función pura para poder probarla sin arrancar Next.
 */

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@/domain/catalog/locale'

/** Cabecera que el middleware de next-intl añade a cada petición que atiende. */
export const LOCALE_HEADER_NAME = 'x-next-intl-locale'

/** Cookie con el idioma elegido por la persona que navega (nombre por defecto de next-intl). */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

export type NotFoundLocaleSources = {
  readonly localeHeader?: string | null
  readonly localeCookie?: string | null
  readonly acceptLanguage?: string | null
}

/** Normaliza una etiqueta BCP 47 y devuelve el idioma soportado, o `undefined` si no lo es. */
function toSupportedLocale(value: string | null | undefined): Locale | undefined {
  if (value == null) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()

  if (isSupportedLocale(normalized)) {
    return normalized
  }

  const [primary] = normalized.split('-')

  return primary !== undefined && isSupportedLocale(primary) ? primary : undefined
}

type LanguagePreference = {
  readonly tag: string
  readonly quality: number
  readonly position: number
}

function parseAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (header == null || header.trim() === '') {
    return undefined
  }

  const preferences: LanguagePreference[] = []
  const entries = header.split(',')

  for (const [position, entry] of entries.entries()) {
    const [tag = '', ...parameters] = entry.split(';')
    const qualityParameter = parameters
      .map((parameter) => parameter.trim().toLowerCase())
      .find((parameter) => parameter.startsWith('q='))
    const quality =
      qualityParameter === undefined ? 1 : Number.parseFloat(qualityParameter.slice(2))

    if (Number.isFinite(quality) && quality > 0) {
      preferences.push({ tag: tag.trim(), quality, position })
    }
  }

  preferences.sort((left, right) => right.quality - left.quality || left.position - right.position)

  for (const preference of preferences) {
    const locale = toSupportedLocale(preference.tag)

    if (locale !== undefined) {
      return locale
    }
  }

  return undefined
}

/** Idioma con el que renderizar el 404 a partir de las señales de la petición. */
export function resolveNotFoundLocale(sources: NotFoundLocaleSources): Locale {
  return (
    toSupportedLocale(sources.localeHeader) ??
    toSupportedLocale(sources.localeCookie) ??
    parseAcceptLanguage(sources.acceptLanguage) ??
    DEFAULT_LOCALE
  )
}
