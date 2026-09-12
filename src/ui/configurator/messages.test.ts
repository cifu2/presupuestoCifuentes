import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES } from '@/domain/catalog/locale'

import {
  HINGE_MESSAGE_KEYS,
  MEASUREMENT_ERRORS,
  PLANKING_MESSAGE_KEYS,
  TYPE_MESSAGE_KEYS,
} from './selection'

/** Códigos de error que `validateContact` puede devolver por campo. */
const CONTACT_ERROR_CODES: Record<string, readonly string[]> = {
  name: ['required', 'too_short', 'too_long'],
  email: ['required', 'invalid_email'],
  phone: ['too_short', 'too_long'],
  message: ['too_long'],
}

/**
 * Cobertura i18n del configurador (ADR-0005, DoD).
 *
 * `messages.test.ts` garantiza que los diccionarios tienen las mismas claves; este test garantiza
 * que las claves que **usa** el configurador existen. Un `MISSING_MESSAGE` de next-intl no rompe el
 * test de paridad y solo aparece en el log del servidor, así que se protege aquí.
 *
 * Las claves literales se extraen del propio componente para que el test no se desincronice; las
 * familias dinámicas (tipos de puerta, errores por código…) se enumeran con sus tablas.
 */

const COMPONENT_PATH = fileURLToPath(new URL('./configurator-app.tsx', import.meta.url))
const MESSAGES_DIRECTORY = fileURLToPath(new URL('../../../messages', import.meta.url))

type Messages = { [key: string]: string | Messages }

function readMessages(locale: string): Messages {
  return JSON.parse(readFileSync(`${MESSAGES_DIRECTORY}/${locale}.json`, 'utf8')) as Messages
}

const dictionaries = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, readMessages(locale)]),
) as Record<(typeof SUPPORTED_LOCALES)[number], Messages>

function resolve(messages: Messages, path: string): string | undefined {
  let current: string | Messages | undefined = messages

  for (const segment of path.split('.')) {
    current = typeof current === 'string' ? undefined : current?.[segment]
  }

  return typeof current === 'string' ? current : undefined
}

const source = readFileSync(COMPONENT_PATH, 'utf8')

/** Claves literales: `t('…')` vive en `Configurator` y `tPreview('…')` en `Preview2D`. */
function literalKeys(): string[] {
  const configurator = [...source.matchAll(/(?<!Preview)\bt\(\s*'([A-Za-z][\w.]*)'/g)].map(
    (match) => `Configurator.${match[1] ?? ''}`,
  )
  const preview = [...source.matchAll(/\btPreview\(\s*'([A-Za-z][\w.]*)'/g)].map(
    (match) => `Preview2D.${match[1] ?? ''}`,
  )

  return [...configurator, ...preview]
}

/** Claves construidas con plantilla: se cruzan con las tablas de enumerados del módulo. */
function dynamicKeys(): string[] {
  return [
    ...Object.values(TYPE_MESSAGE_KEYS).map((key) => `Preview2D.types.${key}`),
    ...Object.values(HINGE_MESSAGE_KEYS).map((key) => `Preview2D.hingeSides.${key}`),
    ...Object.values(PLANKING_MESSAGE_KEYS).map((key) => `Preview2D.plankings.${key}`),
    ...MEASUREMENT_ERRORS.map((code) => `Configurator.measurements.errors.${code}`),
    ...['generic', 'network', 'invalid', 'notFound', 'validation'].flatMap((code) => [
      `Configurator.price.errors.${code}`,
      `Configurator.quote.errors.${code}`,
    ]),
    ...Object.entries(CONTACT_ERROR_CODES).flatMap(([field, codes]) =>
      codes.map((code) => `Configurator.contact.errors.${field}.${code}`),
    ),
  ]
}

describe('mensajes del configurador', () => {
  it('encuentra claves literales que revisar (el test no se queda vacío)', () => {
    expect(literalKeys().length).toBeGreaterThan(15)
  })

  it('todas las claves usadas existen en todos los idiomas', () => {
    const keys = [...literalKeys(), ...dynamicKeys()]

    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        expect(resolve(dictionaries[locale], key), `${locale}:${key}`).toBeTruthy()
      }
    }
  })

  it('no usa claves obsoletas de la paleta de demostración de CIF-6', () => {
    expect(resolve(dictionaries.es, 'Preview2D.colors.ninguno')).toBeTruthy()
    for (const removed of ['ral-9010', 'ral-7016', 'roble']) {
      expect(resolve(dictionaries.es, `Preview2D.colors.${removed}`)).toBeUndefined()
    }
  })
})
