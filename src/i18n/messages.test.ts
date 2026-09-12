import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/domain/catalog/locale'

import { TRANSLATED_DOMAIN_ERROR_CODES } from './domain-errors'

type Messages = { [key: string]: string | Messages }

/**
 * Nombres accesibles del panel que el port del prototipo v3.2 (hallazgos M1/M2 de CIF-55 → CIF-101)
 * consume como `aria-label`/`aria-labelledby`. La paridad de claves sola no los protege: borrados en
 * todos los idiomas a la vez, el diccionario seguiría siendo coherente y el port volvería a
 * literales sin traducir. Se exige por nombre, como `TRANSLATED_DOMAIN_ERROR_CODES`.
 */
const REQUIRED_CATALOG_ADMIN_A11Y_KEYS = ['locale', 'sidebarSections', 'tabs'] as const

const messagesDirectory = fileURLToPath(new URL('../../messages', import.meta.url))

function readMessages(locale: string): Messages {
  return JSON.parse(readFileSync(join(messagesDirectory, `${locale}.json`), 'utf8')) as Messages
}

function messageFiles(): string[] {
  return readdirSync(messagesDirectory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort()
}

function flattenEntries(messages: Messages, prefix = ''): [string, string][] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key

    return typeof value === 'string' ? [[path, value]] : flattenEntries(value, path)
  })
}

function placeholdersOf(message: string): string[] {
  return [...message.matchAll(/\{\s*([a-zA-Z][\w]*)/g)].map((match) => match[1] ?? '').sort()
}

const entriesByLocale = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    Object.fromEntries(flattenEntries(readMessages(locale))),
  ]),
) as Record<(typeof SUPPORTED_LOCALES)[number], Record<string, string | undefined>>

describe('diccionarios de mensajes', () => {
  it('tiene exactamente un diccionario por idioma soportado', () => {
    expect(messageFiles()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  it('usa el mismo conjunto de claves en todos los idiomas', () => {
    const reference = Object.keys(entriesByLocale[DEFAULT_LOCALE]).sort()

    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(entriesByLocale[locale]).sort(), `claves de ${locale}`).toEqual(reference)
    }
  })

  it('no deja ningún texto vacío', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(entriesByLocale[locale])) {
        expect(value?.trim(), `${locale}:${key}`).not.toBe('')
      }
    }
  })

  it('conserva los mismos marcadores en todas las traducciones', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(entriesByLocale[locale])) {
        const reference = entriesByLocale[DEFAULT_LOCALE][key] ?? ''

        expect(placeholdersOf(value ?? ''), `${locale}:${key}`).toEqual(placeholdersOf(reference))
      }
    }
  })

  it('conserva los nombres accesibles del panel en todos los idiomas', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of REQUIRED_CATALOG_ADMIN_A11Y_KEYS) {
        expect(
          entriesByLocale[locale][`CatalogAdmin.a11y.${key}`]?.trim(),
          `${locale}:CatalogAdmin.a11y.${key}`,
        ).toBeTruthy()
      }
    }
  })

  it('traduce todos los errores de dominio en todos los idiomas', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const code of TRANSLATED_DOMAIN_ERROR_CODES) {
        expect(
          entriesByLocale[locale][`DomainErrors.${code}`]?.trim(),
          `${locale}:${code}`,
        ).toBeTruthy()
      }
    }
  })
})
