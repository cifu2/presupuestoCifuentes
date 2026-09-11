import { readdirSync, readFileSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * `/es` y `/en` se prerenderizan (SSG) porque, antes de pedir traducciones, algún componente de la
 * petición fija el idioma con `setRequestLocale(locale)`. Si nadie lo hace, next-intl lo resuelve
 * leyendo `headers()`, Next marca `/[locale]` como dinámico y se pierde el SSG **sin que nada falle
 * de forma visible**.
 *
 * Medido con `pnpm build` sobre este árbol:
 *
 * | `layout.tsx` | `page.tsx` | `/[locale]` en el build  |
 * | ------------ | ---------- | ------------------------ |
 * | sin llamada  | sin llamada | `ƒ` dinámico (ni `/es`) |
 * | con llamada  | sin llamada | `● /es` y `● /en`        |
 * | sin llamada  | con llamada | `● /es` y `● /en`        |
 *
 * Por eso el patrón del repositorio es el que documenta next-intl ("add `setRequestLocale` to all
 * relevant layouts and pages"): cada `layout.tsx` y cada `page.tsx` del segmento que renderiza
 * traducciones lo llama, y este test lo protege. Ver `docs/i18n.md#render-estático`.
 *
 * El guard distingue tres casos (hallazgos H1 y H2 de la revisión CIF-39):
 *
 * - **Componente cliente** (`'use client'`): no se le exige la llamada. En el build cliente
 *   `setRequestLocale` lanza `"setRequestLocale is not supported in Client Components."` y no hace
 *   falta: el segmento se sigue prerenderizando. H1.
 * - **Uso con el idioma explícito**: `getTranslations({ locale, namespace })` o
 *   `<NextIntlClientProvider locale={locale}>` no resuelven el idioma leyendo `headers()`, así que no
 *   exigen la llamada. Es el caso de `generateMetadata` en el layout.
 * - **Uso que depende de la petición**: la llamada tiene que aparecer **antes** del primer uso de
 *   `getTranslations|getLocale|getMessages|getFormatter|getNow|getTimeZone|NextIntlClientProvider` en
 *   orden de fichero. Comprobar solo la presencia dejaba pasar la pérdida silenciosa de SSG. H2.
 *
 * Quedan fuera a propósito los ficheros que no son `page.tsx`/`layout.tsx` (`not-found.tsx` y
 * `template.tsx` los cubre la llamada del layout; `error.tsx` es cliente por obligación) y los que
 * traducen a través de un wrapper local (H3).
 */
const localeSegmentDirectory = fileURLToPath(new URL('../app/[locale]', import.meta.url))

/** Directiva que marca el fichero como componente cliente. */
const CLIENT_DIRECTIVE = /^\s*['"]use client['"]\s*;?/

const SET_REQUEST_LOCALE_CALL = /(?<![\w.$])setRequestLocale\s*\(/

/**
 * APIs de servidor de next-intl que resuelven el idioma de la petición: si nadie lo ha fijado antes
 * con `setRequestLocale`, leen `headers()` y la ruta pasa a ser dinámica.
 */
const REQUEST_LOCALE_CALLS =
  /(?<![\w.$])(?:getTranslations|getLocale|getMessages|getFormatter|getNow|getTimeZone)\s*\(/g

/**
 * El proveedor de mensajes también resuelve el idioma de la petición si no recibe `locale`. El
 * lookbehind descarta el tag de cierre (no aporta nada) y solo cuenta el de apertura.
 */
const NEXT_INTL_CLIENT_PROVIDER = /(?<![\w.$/])NextIntlClientProvider\b/g

/**
 * Quita comentarios (de bloque y de línea) para que una llamada comentada no cuente como llamada.
 * Un `//` precedido de `:` (una URL dentro de una cadena) no abre comentario.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Quita las declaraciones `import` para no confundir el nombre importado con una llamada. */
function withoutImports(source: string): string {
  return source
    .replace(/^[ \t]*import\s+[\s\S]*?from\s*['"][^'"]*['"]\s*;?/gm, ' ')
    .replace(/^[ \t]*import\s*['"][^'"]*['"]\s*;?/gm, ' ')
}

/** Argumentos de la llamada que abre en `openParenIndex`, con los paréntesis balanceados. */
function readArguments(code: string, openParenIndex: number): string {
  let depth = 0

  for (let index = openParenIndex; index < code.length; index += 1) {
    if (code[index] === '(') {
      depth += 1
    } else if (code[index] === ')') {
      depth -= 1

      if (depth === 0) {
        return code.slice(openParenIndex + 1, index)
      }
    }
  }

  return code.slice(openParenIndex + 1)
}

/** Texto del tag JSX que abre en `startIndex`, hasta el `>` que lo cierra. */
function readJsxTag(code: string, startIndex: number): string {
  let braces = 0

  for (let index = startIndex; index < code.length; index += 1) {
    const character = code[index]

    if (character === '{') {
      braces += 1
    } else if (character === '}') {
      braces -= 1
    } else if (character === '>' && braces === 0 && code[index - 1] !== '=') {
      return code.slice(startIndex, index)
    }
  }

  return code.slice(startIndex)
}

/**
 * Primer uso de next-intl que **depende del idioma de la petición**, o `null` si no hay ninguno. Un
 * uso con el idioma explícito no lo necesita y no cuenta para el orden (H2).
 */
function firstImplicitUsageIndex(code: string): number | null {
  const usages: { index: number; explicitLocale: boolean }[] = []

  for (const match of code.matchAll(REQUEST_LOCALE_CALLS)) {
    usages.push({
      index: match.index,
      explicitLocale: /\blocale\b/.test(readArguments(code, match.index + match[0].length - 1)),
    })
  }

  for (const match of code.matchAll(NEXT_INTL_CLIENT_PROVIDER)) {
    usages.push({
      index: match.index,
      explicitLocale: /\blocale\s*=/.test(readJsxTag(code, match.index)),
    })
  }

  const first = usages
    .filter((usage) => !usage.explicitLocale)
    .sort((left, right) => left.index - right.index)[0]

  return first ? first.index : null
}

type RouteFileAnalysis = {
  /** `'use client'`: la llamada es imposible en el cliente y no hace falta (H1). */
  isClient: boolean
  /** Índice de `setRequestLocale(...)`; `null` si el fichero no la llama. */
  callIndex: number | null
  /** Índice del primer uso dependiente de la petición; `null` si no hay ninguno. */
  usageIndex: number | null
}

/** Analiza un `page.tsx`/`layout.tsx` para decidir si fija el idioma de la petición (y cuándo). */
function analyseRouteFile(source: string): RouteFileAnalysis {
  const code = withoutImports(withoutComments(source))
  const call = SET_REQUEST_LOCALE_CALL.exec(code)

  return {
    isClient: CLIENT_DIRECTIVE.test(withoutComments(source)),
    callIndex: call ? call.index : null,
    usageIndex: firstImplicitUsageIndex(code),
  }
}

type RouteFile = {
  /** Ruta relativa al segmento, p. ej. `configurador/page.tsx`. */
  path: string
  source: string
}

/** `layout.tsx` y `page.tsx` del segmento `[locale]`, a cualquier profundidad. */
function routeFiles(directory: string = localeSegmentDirectory): RouteFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return routeFiles(absolutePath)
    }

    if (!entry.isFile() || (entry.name !== 'page.tsx' && entry.name !== 'layout.tsx')) {
      return []
    }

    return [
      {
        path: relative(localeSegmentDirectory, absolutePath).split(sep).join(posix.sep),
        source: readFileSync(absolutePath, 'utf8'),
      },
    ]
  })
}

/** Ficheros que piden traducciones dependientes de la petición sin fijar antes el idioma. */
function forgottenRouteFiles(files: RouteFile[]): string[] {
  return files
    .filter((file) => {
      const { isClient, callIndex, usageIndex } = analyseRouteFile(file.source)

      if (isClient || usageIndex === null) {
        return false
      }

      return callIndex === null || callIndex > usageIndex
    })
    .map((file) => file.path)
}

const FIX_HINT =
  'Llama a `setRequestLocale(locale)` justo después de resolver `params` y antes del primer ' +
  '`getTranslations`/`getLocale`/`getMessages`/`getFormatter`/`NextIntlClientProvider` (ver ' +
  'docs/i18n.md). Sin la llamada next-intl lee `headers()`, la ruta pasa a dinámica y se pierde el ' +
  'SSG de /es y /en.'

describe('render estático del segmento [locale]', () => {
  const files = routeFiles()

  it('encuentra los ficheros de ruta del segmento', () => {
    expect(files.map((file) => file.path)).toEqual(
      expect.arrayContaining(['layout.tsx', 'page.tsx']),
    )
  })

  it('cada página o layout que resuelve traducciones dependientes de la petición fija el idioma', () => {
    expect(forgottenRouteFiles(files), FIX_HINT).toEqual([])
  })

  it('el layout raíz del segmento fija el idioma de la petición', () => {
    const rootLayout = files.find((file) => file.path === 'layout.tsx')
    const analysis = analyseRouteFile(rootLayout?.source ?? '')

    expect(rootLayout, 'no se encontró [locale]/layout.tsx').toBeDefined()
    expect(
      analysis.isClient,
      'el layout raíz del segmento no puede ser un componente cliente',
    ).toBe(false)
    expect(analysis.callIndex, FIX_HINT).not.toBeNull()
  })

  it('ignora las llamadas comentadas', () => {
    expect(
      analyseRouteFile("import { setRequestLocale } from 'next-intl/server'").callIndex,
    ).toBeNull()
    expect(
      analyseRouteFile(
        "import { setRequestLocale } from 'next-intl/server'\n// setRequestLocale(locale)",
      ).callIndex,
    ).toBeNull()
    expect(
      analyseRouteFile(
        "import { setRequestLocale } from 'next-intl/server'\n/* setRequestLocale(locale) */",
      ).callIndex,
    ).toBeNull()
    expect(
      analyseRouteFile(
        "import { setRequestLocale } from 'next-intl/server'\nsetRequestLocale(locale)",
      ).callIndex,
    ).not.toBeNull()
  })
})

describe('H1 · componentes cliente', () => {
  const clientPage = `'use client'

import { useTranslations } from 'next-intl'

export default function ConfiguradorPage() {
  const t = useTranslations('Configurator')

  return <p>{t('title')}</p>
}
`

  it('no exige la llamada a una página cliente que usa hooks de next-intl', () => {
    expect(
      forgottenRouteFiles([{ path: 'configurador/page.tsx', source: clientPage }]),
      'la llamada es imposible en el cliente y el segmento se prerenderiza igual',
    ).toEqual([])
  })

  it('exime a cualquier fichero con la directiva `use client`', () => {
    const clientWithServerImport = `'use client'

import { getTranslations } from 'next-intl/server'

export default function Page() {
  void getTranslations

  return null
}
`

    expect(
      forgottenRouteFiles([{ path: 'configurador/page.tsx', source: clientWithServerImport }]),
    ).toEqual([])
  })

  it('sigue exigiendo la llamada al componente de servidor equivalente', () => {
    const serverPage = `import { getTranslations } from 'next-intl/server'

export default async function ConfiguradorPage() {
  const t = await getTranslations('Configurator')

  return <p>{t('title')}</p>
}
`

    expect(forgottenRouteFiles([{ path: 'configurador/page.tsx', source: serverPage }])).toEqual([
      'configurador/page.tsx',
    ])
  })
})

describe('H2 · orden de la llamada', () => {
  function serverPage(body: string): string {
    return `import { getTranslations, setRequestLocale } from 'next-intl/server'

type PageProps = { params: Promise<{ locale: string }> }

export default async function Page({ params }: PageProps) {
  const { locale } = await params

${body}
}
`
  }

  it('detecta la llamada posterior al primer uso', () => {
    const source = serverPage(`  const t = await getTranslations('Home')

  setRequestLocale(locale)

  return <p>{t('title')}</p>`)

    expect(forgottenRouteFiles([{ path: 'page.tsx', source }])).toEqual(['page.tsx'])
  })

  it('acepta la llamada anterior al primer uso', () => {
    const source = serverPage(`  setRequestLocale(locale)

  const t = await getTranslations('Home')

  return <p>{t('title')}</p>`)

    expect(forgottenRouteFiles([{ path: 'page.tsx', source }])).toEqual([])
  })

  it('no cuenta los `import` como uso', () => {
    const source = serverPage(`  return <p>sin traducciones</p>`)

    expect(forgottenRouteFiles([{ path: 'page.tsx', source }])).toEqual([])
  })

  it('no exige la llamada si el idioma va explícito', () => {
    const source = serverPage(`  const t = await getTranslations({ locale, namespace: 'Metadata' })

  return <p>{t('title')}</p>`)

    expect(forgottenRouteFiles([{ path: 'page.tsx', source }])).toEqual([])
  })

  it('exige la llamada antes de `getLocale` y de `getMessages`', () => {
    const getLocaleSource = serverPage(`  const current = await getLocale()

  setRequestLocale(locale)

  return <p>{current}</p>`)
    const getMessagesSource = serverPage(`  const messages = await getMessages()

  setRequestLocale(locale)

  return <p>{Object.keys(messages).length}</p>`)

    expect(forgottenRouteFiles([{ path: 'page.tsx', source: getLocaleSource }])).toEqual([
      'page.tsx',
    ])
    expect(forgottenRouteFiles([{ path: 'page.tsx', source: getMessagesSource }])).toEqual([
      'page.tsx',
    ])
  })

  it('cuenta `NextIntlClientProvider` sin `locale` y no con él', () => {
    const implicit = serverPage(`  setRequestLocale(locale)

  return <NextIntlClientProvider>hola</NextIntlClientProvider>`)
    const outOfOrder = serverPage(`  const messages = { a: 'b' }

  return (
    <NextIntlClientProvider messages={messages}>
      <p>hola</p>
    </NextIntlClientProvider>
  )`)
    const explicit = serverPage(`  const messages = { a: 'b' }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <p>hola</p>
    </NextIntlClientProvider>
  )`)

    expect(forgottenRouteFiles([{ path: 'layout.tsx', source: implicit }])).toEqual([])
    expect(forgottenRouteFiles([{ path: 'layout.tsx', source: outOfOrder }])).toEqual([
      'layout.tsx',
    ])
    expect(forgottenRouteFiles([{ path: 'layout.tsx', source: explicit }])).toEqual([])
  })
})
