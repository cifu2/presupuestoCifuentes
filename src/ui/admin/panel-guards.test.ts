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

/**
 * Quita los comentarios de bloque y de línea. El escáner distingue strings y plantillas, así que un
 * `//` dentro de un literal (`href="https://…"`) no borra media línea de código (H3 de CIF-302).
 */
export function stripComments(source: string, syntax: 'js' | 'css' = 'js'): string {
  let result = ''
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (char === '"' || char === "'" || char === '`') {
      const end = endOfString(source, index)

      result += source.slice(index, end)
      index = end
      continue
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)

      result += ' '
      index = end === -1 ? source.length : end + 2
      continue
    }

    if (syntax === 'js' && char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index)

      index = end === -1 ? source.length : end
      continue
    }

    result += char
    index += 1
  }

  return result
}

/** Comentarios de CSS: solo los de bloque; en una hoja de estilos `//` no comenta nada. */
export function stripCssComments(css: string): string {
  return stripComments(css, 'css')
}

/** Índice del primer carácter tras el literal (comillas o plantilla) que abre en `start`. */
function endOfString(source: string, start: number): number {
  const quote = source[start]
  let index = start + 1

  while (index < source.length) {
    const char = source[index]

    if (char === '\\') {
      index += 2
      continue
    }

    if (quote === '`' && char === '$' && source[index + 1] === '{') {
      const close = matchingClose(source, index + 1, '}')

      index = close === -1 ? source.length : close + 1
      continue
    }

    if (char === quote) return index + 1

    index += 1
  }

  return source.length
}

/** Índice del cierre que equilibra el delimitador abierto en `open`, ignorando strings. */
function matchingClose(source: string, open: number, close: string): number {
  const opening = source[open]
  let depth = 0

  for (let index = open; index < source.length; index += 1) {
    const char = source[index]

    if (char === '"' || char === "'" || char === '`') {
      index = endOfString(source, index) - 1
      continue
    }

    if (char === opening) {
      depth += 1
    } else if (char === close) {
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
    const close = open === -1 ? -1 : matchingClose(remaining, open, '}')

    if (close === -1) return result

    remaining = remaining.slice(close + 1)
  }
}

/**
 * Colores con nombre de CSS (`white`, `transparent`…). El lookaround descarta el nombre cuando forma
 * parte de otra palabra o de una clase de Tailwind (`white-space`, `bg-transparent`, `text-white`):
 * ahí el nombre no es un valor de color y no debe contar como literal (H1 de CIF-302).
 */
const NAMED_COLORS = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'transparent',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
] as const

const COLOR_LITERALS = new RegExp(
  [
    '#[0-9a-fA-F]{3,8}\\b',
    '\\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\\([^)]*\\)',
    `(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`,
  ].join('|'),
  'g',
)

/**
 * Literales de color de un fragmento: `#fff`, `rgb(…)`, `hsl(…)`, sus equivalentes modernos y los
 * colores con nombre (`white`, `transparent`).
 */
export function findColorLiterals(source: string): string[] {
  return [...source.matchAll(COLOR_LITERALS)].map((match) => match[0])
}

/** Igual que `findColorLiterals`, pero el bloque `@theme` queda exento. */
export function findColorLiteralsOutsideTheme(css: string): string[] {
  return findColorLiterals(withoutThemeBlocks(stripCssComments(css)))
}

/**
 * Cuerpos de las reglas `dialog::backdrop`, en orden de aparición. La cascada la gana la última, así
 * que una segunda regla al final del fichero no puede esconder el color de la primera (H1 de CIF-302).
 */
export function backdropRules(css: string): string[] {
  const scanned = stripCssComments(css)
  const pattern = /dialog::backdrop[^{}]*\{/g
  const rules: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(scanned)) !== null) {
    const open = match.index + match[0].length - 1
    const close = matchingClose(scanned, open, '}')

    if (close === -1) break

    rules.push(scanned.slice(open + 1, close))
    pattern.lastIndex = close + 1
  }

  return rules
}

/** `background` del `::backdrop` que gana la cascada, o `null` si la regla no existe. */
export function backdropBackground(css: string): string | null {
  const background = backdropRules(css)
    .at(-1)
    ?.match(/background\s*:\s*([^;]+);/)

  return background?.[1]?.trim() ?? null
}

/** Atributos que llevan texto de interfaz: su valor tiene que salir de `messages/*.json`. */
const TEXT_ATTRIBUTES = ['aria-label', 'title', 'alt'] as const

/** La marca no se traduce y `alt=""` (imagen decorativa) es legítimo; el resto, no. */
const TEXT_ATTRIBUTE_ALLOWLIST = new Set(['Cifuentes'])

type AttributeValue = { kind: 'quoted' | 'expression'; text: string }

/** Valor del atributo que empieza en `start`: el texto entrecomillado o el interior de `{…}`. */
function readAttributeValue(source: string, start: number): AttributeValue | null {
  const char = source[start]

  if (char === '"' || char === "'") {
    return { kind: 'quoted', text: source.slice(start + 1, endOfString(source, start) - 1) }
  }

  if (char === '{') {
    const close = matchingClose(source, start, '}')

    return close === -1 ? null : { kind: 'expression', text: source.slice(start + 1, close) }
  }

  return null
}

/** `true` si la posición cae dentro de una etiqueta JSX (`<a …>`), no en una expresión suelta. */
function isInsideJsxTag(source: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = source[cursor]

    if (char === '<') return true

    // El `=>` de una prop anterior no cierra la etiqueta; el `>` de cierre, sí.
    if (char === '>' && source[cursor - 1] !== '=') return false
  }

  return false
}

/**
 * Quita las llamadas `t(…)`: su string es una clave de traducción, no texto de interfaz. Respeta los
 * paréntesis anidados (`t('a11y.sortBy', { column: t(labelKey) })`).
 */
function withoutTranslationCalls(expression: string): string {
  let result = ''
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (
      char === 't' &&
      !/[\w$.]/.test(expression[index - 1] ?? '') &&
      /^\s*\(/.test(expression.slice(index + 1))
    ) {
      const close = matchingClose(expression, expression.indexOf('(', index), ')')

      if (close === -1) return result + expression.slice(index)

      result += 't()'
      index = close + 1
      continue
    }

    result += char
    index += 1
  }

  return result
}

/** Trozos literales de una plantilla y su forma normalizada (`tab-${x}` → `tab-*`). */
function templateParts(body: string): { texts: string[]; pattern: string } {
  const texts: string[] = []
  let pattern = ''
  let chunk = ''
  let index = 0

  while (index < body.length) {
    const char = body[index]

    if (char === '\\') {
      chunk += body[index + 1] ?? ''
      index += 2
      continue
    }

    if (char === '$' && body[index + 1] === '{') {
      const close = matchingClose(body, index + 1, '}')

      texts.push(chunk)
      pattern += chunk
      chunk = ''
      pattern += '*'
      index = close === -1 ? body.length : close + 1
      continue
    }

    chunk += char
    index += 1
  }

  texts.push(chunk)
  pattern += chunk

  return { texts, pattern }
}

type StringLiteral = { text: string; templatePattern: string | null }

/** Strings y plantillas de una expresión, con la plantilla normalizada para comparar ids. */
function collectLiterals(expression: string): StringLiteral[] {
  const literals: StringLiteral[] = []
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (char === '"' || char === "'") {
      const end = endOfString(expression, index)

      literals.push({ text: expression.slice(index + 1, end - 1), templatePattern: null })
      index = end
      continue
    }

    if (char === '`') {
      const end = endOfString(expression, index)
      const { texts, pattern } = templateParts(expression.slice(index + 1, end - 1))
      const chunks = texts.filter((text) => text.trim() !== '')

      for (const text of chunks) {
        literals.push({ text, templatePattern: pattern })
      }

      if (chunks.length === 0) {
        literals.push({ text: '', templatePattern: pattern })
      }

      index = end
      continue
    }

    index += 1
  }

  return literals
}

/**
 * Literales de `aria-label`/`title`/`alt`, incluidos los escritos como plantilla o ternario. Quedan
 * fuera los valores dinámicos, las claves de `t(…)` y lo que no es una etiqueta JSX (M2 de CIF-101,
 * H2/H3 de CIF-302).
 */
export function findLiteralTextAttributes(source: string): string[] {
  const scanned = stripComments(source)
  const pattern = new RegExp(`(?<![\\w.$-])(${TEXT_ATTRIBUTES.join('|')})\\s*=\\s*`, 'g')
  const offenders: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(scanned)) !== null) {
    if (!isInsideJsxTag(scanned, match.index)) continue

    const attribute = match[1] ?? ''
    const value = readAttributeValue(scanned, match.index + match[0].length)

    if (value === null) continue

    const literals: StringLiteral[] =
      value.kind === 'quoted'
        ? [{ text: value.text, templatePattern: null }]
        : collectLiterals(withoutTranslationCalls(value.text))

    for (const literal of literals) {
      const text = literal.text.trim()

      if (!/[A-Za-zÀ-ÿ]{2,}/.test(text) || TEXT_ATTRIBUTE_ALLOWLIST.has(text)) continue

      offenders.push(`${attribute}="${text}"`)
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

/** Referencias de `aria-labelledby`: tokens estáticos y formas de plantilla (`tab-${x}` → `tab-*`). */
function labelReferences(source: string): string[] {
  const scanned = stripComments(source)
  const pattern = /(?<![\w.$-])aria-labelledby\s*=\s*/g
  const references: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(scanned)) !== null) {
    if (!isInsideJsxTag(scanned, match.index)) continue

    const value = readAttributeValue(scanned, match.index + match[0].length)

    if (value === null) continue

    if (value.kind === 'quoted') {
      references.push(...tokens(value.text))
      continue
    }

    for (const literal of collectLiterals(withoutTranslationCalls(value.text))) {
      references.push(
        ...(literal.templatePattern === null ? tokens(literal.text) : [literal.templatePattern]),
      )
    }
  }

  return references
}

function tokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '')
}

/** ids declarados en el documento: literales y plantillas (`id={`tab-${x}`}` → `tab-*`). */
export function declaredIdPatterns(source: string): string[] {
  const scanned = stripComments(source)
  const pattern = /(?<![\w.$-])id\s*=\s*/g
  const ids: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(scanned)) !== null) {
    if (!isInsideJsxTag(scanned, match.index)) continue

    const value = readAttributeValue(scanned, match.index + match[0].length)

    if (value === null) continue

    if (value.kind === 'quoted') {
      ids.push(value.text.trim())
      continue
    }

    for (const literal of collectLiterals(withoutTranslationCalls(value.text))) {
      ids.push(literal.templatePattern ?? literal.text.trim())
    }
  }

  return ids
}

/** Cada trozo literal de la referencia tiene que aparecer, en orden, en el id declarado. */
function referencesMatch(reference: string, declared: string): boolean {
  const segments = reference.split('*').filter((segment) => segment !== '')

  if (segments.length === 0) return true

  let cursor = 0

  for (const segment of segments) {
    const found = declared.indexOf(segment, cursor)

    if (found === -1) return false

    cursor = found + segment.length
  }

  return true
}

/**
 * Referencias `aria-labelledby` que no casan con ningún `id` declarado. `declaredIds` permite pasar
 * el corpus completo del panel: la etiqueta y el id pueden vivir en ficheros distintos (H2 de CIF-302).
 */
export function findDanglingLabelReferences(source: string, declaredIds?: string[]): string[] {
  const declared = declaredIds ?? declaredIdPatterns(source)

  return labelReferences(source).filter(
    (reference) => !declared.some((candidate) => referencesMatch(reference, candidate)),
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

  it('el backdrop del diálogo se declara una sola vez y usa el token de scrim (M1 de CIF-101)', () => {
    const adminCss = styleFiles.find(({ path }) => path.endsWith('admin.css'))
    const backdrop = backdropRules(adminCss?.content ?? '')

    expect(adminCss).toBeDefined()
    // Una segunda regla `dialog::backdrop` gana la cascada y escondería el color real (H1 de CIF-302).
    expect(backdrop).toHaveLength(1)
    expect(backdropBackground(adminCss?.content ?? '')).toBe('var(--color-scrim)')
  })

  it('no escribe textos de interfaz sueltos en el JSX (solo el nombre de marca)', () => {
    const allowlist = new Set(['Cifuentes'])
    const offenders: string[] = []

    for (const { path, content } of files.filter((file) => file.path.endsWith('.tsx'))) {
      const withoutComments = stripComments(content)

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

  it('no escribe literales de texto en aria-label/title/alt (M2 de CIF-101)', () => {
    const offenders = files
      .filter(({ path }) => path.endsWith('.tsx'))
      .flatMap(({ path, content }) =>
        findLiteralTextAttributes(content).map((attribute) => `${path}: ${attribute}`),
      )

    expect(offenders).toEqual([])
  })

  it('aria-labelledby referencia ids del documento, nunca texto traducido', () => {
    const panels = files.filter(({ path }) => path.endsWith('.tsx'))
    const declaredIds = panels.flatMap(({ content }) => declaredIdPatterns(content))
    const translated = panels.flatMap(({ path, content }) =>
      findForeignLabelReferences(content).map((value) => `${path}: ${value}`),
    )
    const dangling = panels.flatMap(({ path, content }) =>
      findDanglingLabelReferences(content, declaredIds).map((value) => `${path}: ${value}`),
    )

    expect(declaredIds.length).toBeGreaterThan(0)
    expect(translated).toEqual([])
    expect(dangling).toEqual([])
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

  it('H1: una segunda regla dialog::backdrop con color con nombre haría fallar la guarda', () => {
    const mutated = `${adminCss}\ndialog::backdrop {\n  background: white;\n}\n`

    expect(findColorLiteralsOutsideTheme(mutated)).toEqual(['white'])
    expect(backdropRules(mutated)).toHaveLength(2)
    expect(backdropBackground(mutated)).toBe('white')
    expect(backdropBackground(adminCss)).toBe('var(--color-scrim)')
  })

  it('H2: un aria-label de plantilla literal en panel-shell.tsx haría fallar la guarda', () => {
    const mutated = panelShell.replace("aria-label={t('a11y.locale')}", 'aria-label={`Idioma`}')

    expect(mutated).not.toBe(panelShell)
    expect(findLiteralTextAttributes(mutated)).toContain('aria-label="Idioma"')
    expect(findLiteralTextAttributes(panelShell)).toEqual([])
  })

  it('H2: renombrar el id de la pestaña sin tocar la referencia haría fallar la guarda de ids', () => {
    const seriesDetail = readFileSync(join(panelDirectory, 'series-detail.tsx'), 'utf8')
    const mutated = seriesDetail.replace('id={`tab-${item.tab}`}', 'id={`pestana-${item.tab}`}')

    expect(mutated).not.toBe(seriesDetail)
    expect(declaredIdPatterns(seriesDetail)).toContain('tab-*')
    expect(findDanglingLabelReferences(mutated, declaredIdPatterns(mutated))).toEqual(['tab-*'])
  })

  it('respeta las excepciones: @theme para los colores, la marca y los ids para los textos', () => {
    expect(
      findColorLiteralsOutsideTheme('@theme { --color-scrim: rgb(23 32 42 / 0.45); }'),
    ).toEqual([])
    expect(findColorLiteralsOutsideTheme('dialog::backdrop { background: #ffffff; }')).toEqual([
      '#ffffff',
    ])
    expect(findLiteralTextAttributes('<div aria-label="Cifuentes">Cifuentes</div>')).toEqual([])
    expect(findLiteralTextAttributes("<div title={t('a11y.locale')} />")).toEqual([])
    expect(findLiteralTextAttributes('<img alt="" />')).toEqual([])
    expect(findForeignLabelReferences('aria-labelledby="tariff-dialog-title"')).toEqual([])
    expect(findForeignLabelReferences('aria-labelledby="Idioma"')).toEqual(['Idioma'])
  })
})

/**
 * Cobertura de los huecos H1–H3 que dejó la revisión CIF-298: colores con nombre, reglas de backdrop
 * duplicadas, atributos escritos como expresión y un `stripComments` que distinga strings de código.
 */
describe('endurecimiento de las guardas (H1–H3 de CIF-302)', () => {
  it('H1: los colores con nombre de CSS cuentan como literales', () => {
    expect(findColorLiterals('dialog::backdrop { background: white; }')).toEqual(['white'])
    expect(findColorLiterals('a { color: transparent; }')).toEqual(['transparent'])
    expect(findColorLiterals('a { opacity: 1; }')).toEqual([])
  })

  it('H1: no confunde nombres de color con clases de Tailwind ni con otras palabras', () => {
    expect(findColorLiterals('className="bg-transparent text-white border-black/50"')).toEqual([])
    expect(findColorLiterals('white-space: nowrap;')).toEqual([])
    expect(findColorLiterals('const rendered = 1')).toEqual([])
  })

  it('H1: el backdrop exige una única regla y lee la que gana la cascada', () => {
    const duplicated =
      'dialog::backdrop { background: var(--color-scrim); }\ndialog::backdrop { background: white; }'

    expect(backdropRules(duplicated)).toHaveLength(2)
    expect(backdropBackground(duplicated)).toBe('white')
    expect(findColorLiteralsOutsideTheme(duplicated)).toEqual(['white'])
  })

  it('H2: detecta literales en plantillas, ternarios y strings de expresión', () => {
    expect(findLiteralTextAttributes('<span aria-label={`Idioma`}>x</span>')).toEqual([
      'aria-label="Idioma"',
    ])
    expect(
      findLiteralTextAttributes("<span aria-label={cond ? 'Idioma' : t('x')}>x</span>"),
    ).toEqual(['aria-label="Idioma"'])
    expect(findLiteralTextAttributes("<span aria-label={'Idioma'}>x</span>")).toEqual([
      'aria-label="Idioma"',
    ])
    expect(findLiteralTextAttributes("<span title={t('a11y.locale')}>x</span>")).toEqual([])
    expect(findLiteralTextAttributes('<span aria-label={label}>x</span>')).toEqual([])
    expect(findLiteralTextAttributes('<span aria-label={`${label}`}>x</span>')).toEqual([])
  })

  it('H2: no marca prefijos data-* ni asignaciones fuera de una etiqueta JSX', () => {
    expect(findLiteralTextAttributes('<span data-aria-label="Idioma">x</span>')).toEqual([])
    expect(findLiteralTextAttributes("img.alt = 'Foto'")).toEqual([])
    expect(findLiteralTextAttributes("const title = 'Foto'")).toEqual([])
    expect(findLiteralTextAttributes('<img alt="Foto" />')).toEqual(['alt="Foto"'])
    // Un `=>` en una prop anterior no puede cegar la guarda: la etiqueta sigue abierta.
    expect(
      findLiteralTextAttributes('<button onClick={() => go()} aria-label="Idioma" />'),
    ).toEqual(['aria-label="Idioma"'])
  })

  it('H2: un aria-labelledby estático tiene que apuntar a un id declarado', () => {
    expect(findDanglingLabelReferences('<div aria-labelledby="tab-nope" />')).toEqual(['tab-nope'])
    expect(findDanglingLabelReferences('<div id="tab-real" aria-labelledby="tab-real" />')).toEqual(
      [],
    )
    expect(
      findDanglingLabelReferences('<div aria-labelledby="tab-1 tab-2" />', ['tab-1', 'tab-2']),
    ).toEqual([])
    expect(
      findDanglingLabelReferences('<div aria-labelledby="tab-1 tab-nope" />', ['tab-1']),
    ).toEqual(['tab-nope'])
  })

  it('H2: un aria-labelledby de plantilla casa con un id de plantilla compatible', () => {
    expect(
      findDanglingLabelReferences(
        '<button aria-labelledby={`tab-${tab}`} /><div id={`tab-${item.tab}`} />',
      ),
    ).toEqual([])
    expect(
      findDanglingLabelReferences(
        '<button aria-labelledby={`tab-${tab}`} /><div id={`otro-${item.tab}`} />',
      ),
    ).toEqual(['tab-*'])
  })

  it('H3: stripComments no borra media línea por un // dentro de un string', () => {
    const jsx = '<a href="https://x" aria-label="Idioma">x</a>'

    expect(stripComments(jsx)).toContain('href="https://x"')
    expect(findLiteralTextAttributes(jsx)).toEqual(['aria-label="Idioma"'])
    expect(stripComments('// aria-label="Idioma"\nconst visible = 1')).not.toContain('Idioma')
    expect(stripComments('const url = "https://x" // nota\n')).toContain('https://x')
  })

  it('H3: en CSS `url(//cdn/x.png)` no es un comentario y no oculta el color', () => {
    expect(findColorLiteralsOutsideTheme('a { background: url(//cdn/x.png) rgb(1 2 3); }')).toEqual(
      ['rgb(1 2 3)'],
    )
    expect(backdropRules('dialog::backdrop { background: url(//cdn/x.png) white; }')).toHaveLength(
      1,
    )
  })
})
