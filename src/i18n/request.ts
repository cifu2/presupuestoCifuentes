import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

/**
 * Configuración por petición de next-intl: resuelve el idioma del segmento `[locale]`, cae al
 * idioma por defecto si no es válido y carga el diccionario de `messages/` (ADR-0005).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Europe/Madrid',
  }
})
