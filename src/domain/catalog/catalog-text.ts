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
