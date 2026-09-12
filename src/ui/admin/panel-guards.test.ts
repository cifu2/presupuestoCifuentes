import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES } from '@/domain/catalog/locale'

import { CATALOG_STATUSES } from '@/domain/catalog/catalog-status'
import { FINISH_LABEL_KEYS, NAV_ITEMS, SERIES_TAB_ITEMS, statusLabelKey } from './panel-navigation'

/**
 * Guardas estáticas del panel: el port no puede introducir literales de color ni de texto, ni
 * depender de capas que no le corresponden (ADR-0023 §3 y §9). Sin esto, la revisión visual se
 * queda en «parece que está en inglés» y una clave borrada pasa desapercibida.
 */

const SOURCES = [
  fileURLToPath(new URL('.', import.meta.url)),
  fileURLToPath(new URL('../../app/[locale]/admin/', import.meta.url)),
]

const MESSAGES = fileURLToPath(new URL('../../../messages/', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)

    if (statSync(path).isDirectory()) {
      return sourceFiles(path)
    }

    return /\.tsx?$/.test(path) && !path.includes('.test.') ? [path] : []
  })
}

const files = SOURCES.flatMap(sourceFiles).map((path) => ({
  path,
  content: readFileSync(path, 'utf8'),
}))

function flatten(messages: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`

    return typeof value === 'string' ? [path] : flatten(value as Record<string, unknown>, path)
  })
}

const dictionaries = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')) as Record<string, unknown>,
  ]),
)

const panelKeys = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, flatten(dictionaries[locale] ?? {})]),
) as Record<(typeof SUPPORTED_LOCALES)[number], string[]>

function panelKeySet(locale: (typeof SUPPORTED_LOCALES)[number]): Set<string> {
  return new Set(
    panelKeys[locale].filter((key) => key.startsWith('CatalogAdmin.')).map((key) => key.slice(13)),
  )
}

describe('guardas estáticas del panel', () => {
  it('encuentra las fuentes del panel que debe revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('no usa literales de color: todo sale de los tokens de sistema-de-diseno §2', () => {
    const withColors = files
      .filter(({ content }) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(content))
      .map(({ path }) => path)

    expect(withColors).toEqual([])
  })

  it('no escribe textos de interfaz sueltos en el JSX (solo el nombre de marca)', () => {
    const allowlist = new Set(['Cifuentes'])
    const offenders: string[] = []

    for (const { path, content } of files.filter((file) => file.path.endsWith('.tsx'))) {
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

      // El texto tiene que ir precedido por una etiqueta JSX real (`<span …>`), no por un `=>` ni
      // por el `>` de un genérico de TypeScript.
      for (const match of withoutComments.matchAll(
        /<[A-Za-z][^<>]*>([^<>{}]*[A-Za-zÀ-ÿ]{2,}[^<>{}]*)</g,
      )) {
        const text = (match[1] ?? '').trim()

        if (text !== '' && !allowlist.has(text)) {
          offenders.push(`${path}: ${text}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('usa claves que existen en los dos idiomas, incluidas las dinámicas', () => {
    const expected = new Set<string>()

    for (const { content } of files) {
      for (const match of content.matchAll(/\bt\(\s*'([^']+)'/g)) {
        expected.add(match[1] ?? '')
      }

      // Claves pasadas como prop o construidas en tablas (`captionKey="tariffs.allCaption"`).
      for (const match of content.matchAll(/'((?:[a-z][a-zA-Z]*)(?:\.[a-zA-Z]+)+)'/g)) {
        expected.add(match[1] ?? '')
      }
    }

    for (const item of [...NAV_ITEMS, ...SERIES_TAB_ITEMS]) {
      expected.add(item.labelKey)
    }

    for (const key of FINISH_LABEL_KEYS) {
      expected.add(key)
    }

    for (const status of CATALOG_STATUSES) {
      expected.add(statusLabelKey(status))
    }

    for (const locale of SUPPORTED_LOCALES) {
      expected.add(`i18n.${locale}`)
    }

    const missing = [...expected]
      .filter((key) => !key.startsWith('http') && !key.includes('/'))
      .filter((key) => !panelKeySet('es').has(key) || !panelKeySet('en').has(key))

    expect(missing).toEqual([])
    expect(expected.size).toBeGreaterThan(40)
  })

  it('la presentación no conoce infraestructura, aplicación ni la raíz de composición', () => {
    const offenders = files
      .filter(({ content }) => /from '@\/(infrastructure|application|composition)/.test(content))
      .map(({ path }) => path)

    expect(offenders).toEqual([])
  })
})
