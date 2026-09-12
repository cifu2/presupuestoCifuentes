/**
 * Texto de catálogo multi-idioma con fallback al idioma por defecto (ADR-0005).
 *
 * El propietario escribe los textos en el panel; el configurador los pide en el idioma activo.
 * Si falta una traducción se muestra la del idioma por defecto y el panel avisa de lo que falta
 * (`missingLocales`).
 */

import { InvalidCatalogTextError } from '@/domain/shared/errors'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locale'

export type LocalizedTextInput = { readonly [L in Locale]?: string } & { readonly es: string }

/** Traducciones presentes, sin fallback: lo que un *upsert* de `catalog_text` escribe fila a fila. */
export type LocalizedTextTranslations = Partial<Record<Locale, string>>

/**
 * Fusiona un texto existente con los idiomas que llegan en un *upsert* parcial.
 *
 * Un idioma con cadena vacía o ausente se interpreta como «no definir»: se conserva la traducción
 * anterior. Un idioma con valor no vacío sustituye la traducción previa; para borrar una traducción
 * existente se pasa `null` explícito. El resultado pasa por `LocalizedText.of`, así que la regla del
 * idioma por defecto se sigue aplicando (si `current` es `null` y el parche no trae el idioma por
 * defecto, la fusión falla como cualquier texto de catálogo sin él).
 */
export function mergeLocalizedText(
  current: LocalizedText | null,
  patch: Readonly<Partial<Record<Locale, string | null>>>,
): LocalizedText {
  const merged: Record<string, string> =
    current === null ? {} : { ...localizedTextTranslations(current) }

  for (const [locale, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue
    }

    if (value === null) {
      delete merged[locale]
      continue
    }

    merged[locale] = value
  }

  return LocalizedText.of(merged as LocalizedTextInput)
}

export class LocalizedText {
  private readonly translations: ReadonlyMap<Locale, string>
  private readonly fallbackText: string

  private constructor(translations: ReadonlyMap<Locale, string>) {
    this.translations = translations
    this.fallbackText = translations.get(DEFAULT_LOCALE) ?? ''
  }

  static of(input: LocalizedTextInput): LocalizedText {
    const translations = new Map<Locale, string>()

    for (const locale of SUPPORTED_LOCALES) {
      const value = input[locale]?.trim() ?? ''

      if (value.length > 0) {
        translations.set(locale, value)
      }
    }

    if (!translations.has(DEFAULT_LOCALE)) {
      throw new InvalidCatalogTextError(
        `Todo texto de catálogo necesita al menos el idioma "${DEFAULT_LOCALE}"`,
      )
    }

    return new LocalizedText(translations)
  }

  /** Texto que solo existe en el idioma por defecto. */
  static single(value: string): LocalizedText {
    return LocalizedText.of({ es: value })
  }

  resolve(locale: Locale): string {
    return this.translations.get(locale) ?? this.fallbackText
  }

  hasTranslation(locale: Locale): boolean {
    return this.translations.has(locale)
  }

  availableLocales(): readonly Locale[] {
    return SUPPORTED_LOCALES.filter((locale) => this.translations.has(locale))
  }

  /** Idiomas soportados sin texto propio: lo que el panel marca como "falta traducir". */
  missingLocales(): readonly Locale[] {
    return SUPPORTED_LOCALES.filter((locale) => !this.translations.has(locale))
  }
}

/**
 * Traducciones realmente escritas, sin fallback. Lo usan los adaptadores de escritura para saber
 * qué filas de `catalog_text` hay que crear, actualizar o borrar (un idioma sin entrada no debe
 * quedar con una fila huérfana).
 */
export function localizedTextTranslations(text: LocalizedText): LocalizedTextTranslations {
  const translations: LocalizedTextTranslations = {}

  for (const locale of SUPPORTED_LOCALES) {
    if (text.hasTranslation(locale)) {
      translations[locale] = text.resolve(locale)
    }
  }

  return translations
}
