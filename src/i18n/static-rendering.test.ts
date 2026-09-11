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
 */
const localeSegmentDirectory = fileURLToPath(new URL('../app/[locale]', import.meta.url))

const NEXT_INTL_IMPORT = /from\s+['"]next-intl(?:\/[^'"]+)?['"]/
const SET_REQUEST_LOCALE_CALL = /(?<![\w.$])setRequestLocale\s*\(/

/**
 * Quita comentarios (de bloque y de línea) para que una llamada comentada no cuente como llamada.
 * Un `//` precedido de `:` (una URL dentro de una cadena) no abre comentario.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** ¿El fichero pide traducciones y por tanto necesita saber en qué idioma está la petición? */
function usesNextIntl(source: string): boolean {
  return NEXT_INTL_IMPORT.test(withoutComments(source))
}

/** ¿El fichero fija el idioma de la petición antes de pedir traducciones? */
function declaresRequestLocale(source: string): boolean {
  return SET_REQUEST_LOCALE_CALL.test(withoutComments(source))
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

const FIX_HINT =
  'Añade `setRequestLocale(locale)` justo después de resolver `params` (ver docs/i18n.md). ' +
  'Sin la llamada next-intl lee `headers()`, la ruta pasa a dinámica y se pierde el SSG de /es y /en.'

describe('render estático del segmento [locale]', () => {
  const files = routeFiles()

  it('encuentra los ficheros de ruta del segmento', () => {
    expect(files.map((file) => file.path)).toEqual(
      expect.arrayContaining(['layout.tsx', 'page.tsx']),
    )
  })

  it('cada página o layout que renderiza traducciones fija el idioma de la petición', () => {
    const forgotten = files
      .filter((file) => usesNextIntl(file.source) && !declaresRequestLocale(file.source))
      .map((file) => file.path)

    expect(forgotten, FIX_HINT).toEqual([])
  })

  it('el layout raíz del segmento fija el idioma de la petición', () => {
    const rootLayout = files.find((file) => file.path === 'layout.tsx')

    expect(rootLayout && declaresRequestLocale(rootLayout.source), FIX_HINT).toBe(true)
  })

  it('ignora las llamadas comentadas', () => {
    expect(declaresRequestLocale('setRequestLocale(locale)')).toBe(true)
    expect(declaresRequestLocale('// setRequestLocale(locale)')).toBe(false)
    expect(declaresRequestLocale('/* setRequestLocale(locale) */')).toBe(false)
    expect(usesNextIntl("import { setRequestLocale } from 'next-intl/server'")).toBe(true)
    expect(usesNextIntl("// import { getTranslations } from 'next-intl/server'")).toBe(false)
  })
})
