/**
 * Idiomas del catálogo (ADR-0005).
 *
 * El catálogo se escribe en base de datos con una fila de traducción por idioma y `fallback`
 * al idioma por defecto. Ampliar idiomas es añadir una entrada a `SUPPORTED_LOCALES` y las
 * traducciones; no se toca código de dominio.
 */

import { UnsupportedLocaleError } from '@/domain/shared/errors'

export const DEFAULT_LOCALE = 'es' as const

export const SUPPORTED_LOCALES = ['es', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function parseLocale(value: string): Locale {
  const normalized = value.trim().toLowerCase()

  if (!isSupportedLocale(normalized)) {
    throw new UnsupportedLocaleError(
      `Idioma no soportado "${value}"; idiomas disponibles: ${SUPPORTED_LOCALES.join(', ')}`,
    )
  }

  return normalized
}
