/**
 * Enrutado por idioma (ADR-0005).
 *
 * La lista de idiomas vive en el dominio (`SUPPORTED_LOCALES`), así que un idioma nuevo se añade
 * en un solo sitio y se propaga a las URLs y a los diccionarios. Todas las rutas llevan prefijo
 * (`/es/...`, `/en/...`) y la raíz redirige al idioma por defecto.
 */

import { defineRouting } from 'next-intl/routing'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
})

export type AppLocale = Locale
