import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES } from '@/domain/catalog/locale'

import { CATALOG_STATUSES } from '@/domain/catalog/catalog-status'
import { FINISH_LABEL_KEYS, NAV_ITEMS, SERIES_TAB_ITEMS, statusLabelKey } from './panel-navigation'

/**
 * Guardas estáticas del panel: el port no puede introducir literales de color ni de texto, ni
 * depender de capas que no le corresponden (ADR-0023 §3 y §9). Sin esto, la revisión visual se
 * queda en «parece que está en inglés» y una clave borrada pasa desapercibida.
 *
 * CIF-285 cierra el agujero que encontró la revisión por mutación de CIF-279: el CSS del panel
 * (M1, scrim del modal) y los atributos de texto del JSX (M2, `aria-label`) no los miraba nadie.
 * Las funciones de escaneo se exportan para que el control de mutación las ejerza sobre una copia
 * mutada del fichero real y exija que la reintroducción del literal falle.
 */

const SOURCES = [
  fileURLToPath(new URL('.', import.meta.url)),
  fileURLToPath(new URL('../../app/[locale]/admin/', import.meta.url)),
]

const MESSAGES = fileURLToPath(new URL('../../../messages/', import.meta.url))

const SOURCE_EXTENSIONS = /\.tsx?$/
const STYLE_EXTENSIONS = /\.css$/

function filesUnder(directory: string, extensions: RegExp): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)

    if (statSync(path).isDirectory()) {
      return filesUnder(path, extensions)
    }

    return extensions.test(path) && !path.includes('.test.') ? [path] : []
  })
}

function readSources(directory: string, extensions: RegExp): { path: string; content: string }[] {
  return filesUnder(directory, extensions).map((path) => ({
    path,
    content: readFileSync(path, 'utf8'),
  }))
}

const files = SOURCES.flatMap((directory) => readSources(directory, SOURCE_EXTENSIONS))

/** Hojas de estilo del panel: `admin.css` y las que se añadan bajo las mismas raíces. */
const styleFiles = SOURCES.flatMap((directory) => readSources(directory, STYLE_EXTENSIONS))

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

/** Fuera de los comentarios no hay razón para un color ni un texto literal. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function matchingBrace(source: string, open: number): number {
  let depth = 0

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1
    } else if (source[index] === '}') {
      depth -= 1

      if (depth === 0) return index
    }
  }

  return -1
}

/** Quita los bloques `@theme { … }`: ahí sí viven los valores de los tokens de §2. */
export function withoutThemeBlocks(css: string): string {
  let remaining = css
  let result = ''

  for (;;) {
    const start = remaining.indexOf('@theme')

    if (start === -1) return result + remaining

    result += remaining.slice(0, start)

    const open = remaining.indexOf('{', start)
    const close = open === -1 ? -1 : matchingBrace(remaining, open)

    if (close === -1) return result

    remaining = remaining.slice(close + 1)
  }
}

const COLOR_LITERALS = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)/g

/** Literales de color de un fragmento: `#fff`, `rgb(…)`, `hsl(…)` y sus equivalentes modernos. */
export function findColorLiterals(source: string): string[] {
  return [...source.matchAll(COLOR_LITERALS)].map((match) => match[0])
}

/** Igual que `findColorLiterals`, pero el bloque `@theme` queda exento. */
export function findColorLiteralsOutsideTheme(css: string): string[] {
  return findColorLiterals(stripComments(withoutThemeBlocks(css)))
}

/** `background` del `::backdrop` de un `dialog`, o `null` si la regla no existe. */
export function backdropBackground(css: string): string | null {
  const rule = /dialog::backdrop\s*\{([^}]*)\}/.exec(stripComments(css))
  const background = rule?.[1]?.match(/background\s*:\s*([^;]+);/)

  return background?.[1]?.trim() ?? null
}

/** Atributos que llevan texto de interfaz: su valor tiene que salir de `messages/*.json`. */
const TEXT_ATTRIBUTES = ['aria-label', 'title', 'alt'] as const

/** La marca no se traduce y `alt=""` (imagen decorativa) es legítimo; el resto, no. */
const TEXT_ATTRIBUTE_ALLOWLIST = new Set(['Cifuentes'])

/** Valores literales de `aria-label`/`title`/`alt`, incluidos los escritos como expresión. */
export function findLiteralTextAttributes(source: string): string[] {
  const scanned = stripComments(source)
  const offenders: string[] = []

  for (const attribute of TEXT_ATTRIBUTES) {
    const pattern = new RegExp(
      `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["']([^"']*)["']\\s*\\})`,
      'g',
    )

    for (const match of scanned.matchAll(pattern)) {
      const value = (match[1] ?? match[2] ?? match[3] ?? '').trim()

      if (/[A-Za-zÀ-ÿ]{2,}/.test(value) && !TEXT_ATTRIBUTE_ALLOWLIST.has(value)) {
        offenders.push(`${attribute}="${value}"`)
      }
    }
  }

  return offenders
}

/** `aria-labelledby` apunta a ids; un literal traducido ahí no asocia ninguna etiqueta. */
export function findForeignLabelReferences(source: string): string[] {
  return [...stripComments(source).matchAll(/\baria-labelledby\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => (match[1] ?? match[2] ?? '').trim())
    .filter(
      (value) =>
        value !== '' && !value.split(/\s+/).every((token) => /^[a-z][a-z0-9-]*$/.test(token)),
    )
}

describe('guardas estáticas del panel', () => {
  it('encuentra las fuentes del panel que debe revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('encuentra el CSS del panel que debe revisar', () => {
    expect(styleFiles.map(({ path }) => basename(path))).toContain('admin.css')
  })

  it('no usa literales de color: todo sale de los tokens de sistema-de-diseno §2', () => {
    const withColors = files
      .filter(({ content }) => findColorLiterals(content).length > 0)
      .map(({ path }) => path)

    expect(withColors).toEqual([])
  })

  it('no usa literales de color en el CSS del panel (M1 de CIF-101)', () => {
    const offenders = styleFiles.flatMap(({ path, content }) =>
      findColorLiteralsOutsideTheme(content).map((literal) => `${path}: ${literal}`),
    )

    expect(offenders).toEqual([])
  })

  it('el backdrop del diálogo usa el token de scrim (M1 de CIF-101)', () => {
    const adminCss = styleFiles.find(({ path }) => path.endsWith('admin.css'))

    expect(adminCss).toBeDefined()
    expect(backdropBackground(adminCss?.content ?? '')).toBe('var(--color-scrim)')
  })

  it('no usa glifos de plataforma: los iconos del panel son SVG del sistema de diseño', () => {
    const withPictographs = files
      .filter(({ content }) => /\p{Extended_Pictographic}/u.test(content))
      .map(({ path }) => path)

    expect(withPictographs).toEqual([])
  })

  it('no escribe textos de interfaz sueltos en el JSX (solo el nombre de marca)', () => {
    const allowlist = new Set(['Cifuentes'])
    const offenders: string[] = []

    for (const { path, content } of files.filter((file) => file.path.endsWith('.tsx'))) {
      const withoutComments = stripComments(content)
      // Los genéricos de TypeScript en llamadas a hooks (`useRef<HTMLButtonElement>(null)`) parecen
      // una etiqueta JSX y harían pasar por texto lo que hay entre dos declaraciones seguidas: se
      // quitan antes de buscar nodos de texto.
      const withoutTypeArguments = withoutComments.replace(/\b(use[A-Z]\w*)<[^<>()]*>\(/g, '$1(')

      // El texto tiene que ir precedido por una etiqueta JSX real (`<span …>`), no por un `=>` ni
      // por el `>` de un genérico de TypeScript.
      for (const match of withoutTypeArguments.matchAll(
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

  it('no escribe literales de texto en aria-label/title/alt (M2 de CIF-101)', () => {
    const offenders = files
      .filter(({ path }) => path.endsWith('.tsx'))
      .flatMap(({ path, content }) =>
        findLiteralTextAttributes(content).map((attribute) => `${path}: ${attribute}`),
      )

    expect(offenders).toEqual([])
  })

  it('aria-labelledby referencia ids del documento, nunca texto traducido', () => {
    const offenders = files
      .filter(({ path }) => path.endsWith('.tsx'))
      .flatMap(({ path, content }) =>
        findForeignLabelReferences(content).map((value) => `${path}: ${value}`),
      )

    expect(offenders).toEqual([])
  })

  it('la guarda de atributos mira JSX real y no es vacua', () => {
    const guarded = files.reduce(
      (total, { content }) =>
        total + [...content.matchAll(/\b(?:aria-label|aria-labelledby|title|alt)=/g)].length,
      0,
    )

    expect(guarded).toBeGreaterThan(5)
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

/**
 * Control de mutación: reproduce sobre el fichero real las dos mutaciones que la revisión CIF-279
 * encontró verdes. Si alguna vuelve a colarse en el árbol, este bloque falla.
 */
describe('control de mutación de las guardas de CIF-101', () => {
  const panelDirectory = SOURCES[0] ?? ''
  const adminCss = readFileSync(join(panelDirectory, 'admin.css'), 'utf8')
  const panelShell = readFileSync(join(panelDirectory, 'panel-shell.tsx'), 'utf8')

  it('M1: un color literal en el backdrop de admin.css haría fallar la guarda de CSS', () => {
    const mutated = adminCss.replace(
      'background: var(--color-scrim);',
      'background: rgb(23 32 42 / 0.45);',
    )

    expect(mutated).not.toBe(adminCss)
    expect(findColorLiteralsOutsideTheme(mutated)).toEqual(['rgb(23 32 42 / 0.45)'])
    expect(backdropBackground(mutated)).toBe('rgb(23 32 42 / 0.45)')
  })

  it('M2: un aria-label literal en panel-shell.tsx haría fallar la guarda de atributos', () => {
    const mutated = panelShell.replace("aria-label={t('a11y.locale')}", 'aria-label="Idioma"')

    expect(mutated).not.toBe(panelShell)
    expect(findLiteralTextAttributes(mutated)).toEqual(['aria-label="Idioma"'])
    expect(findLiteralTextAttributes(panelShell)).toEqual([])
  })

  it('respeta las excepciones: @theme para los colores, la marca y los ids para los textos', () => {
    expect(
      findColorLiteralsOutsideTheme('@theme { --color-scrim: rgb(23 32 42 / 0.45); }'),
    ).toEqual([])
    expect(findColorLiteralsOutsideTheme('dialog::backdrop { background: #ffffff; }')).toEqual([
      '#ffffff',
    ])
    expect(findLiteralTextAttributes('aria-label="Cifuentes"')).toEqual([])
    expect(findLiteralTextAttributes("title={t('a11y.locale')}")).toEqual([])
    expect(findLiteralTextAttributes('alt=""')).toEqual([])
    expect(findForeignLabelReferences('aria-labelledby="tariff-dialog-title"')).toEqual([])
    expect(findForeignLabelReferences('aria-labelledby="Idioma"')).toEqual(['Idioma'])
  })
})
