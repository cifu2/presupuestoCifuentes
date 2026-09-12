import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const globalsCss = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8')

/**
 * Tokens de `sistema-de-diseno` §2 (CIF-5). La tabla es la fuente de verdad de este test: si el
 * diseño amplía §2, se amplía aquí en el mismo PR. Nombres y valores **exactos**, sin renombrar ni
 * inventar (CIF-117).
 */
const DESIGN_TOKENS: readonly (readonly [string, string])[] = [
  // Marca
  ['--color-brand-900', '#17202a'],
  ['--color-brand-800', '#22303f'],
  ['--color-brand-700', '#2c3e50'],
  ['--color-brand-600', '#3b5670'],
  ['--color-brand-500', '#4a6785'],
  ['--color-brand-400', '#6b8baa'],
  ['--color-brand-300', '#a8bccf'],
  ['--color-brand-100', '#e4eaf0'],
  // Acento
  ['--color-accent-700', '#7a5a08'],
  ['--color-accent-600', '#9a7409'],
  ['--color-accent-500', '#b8860b'],
  ['--color-accent-100', '#f7eed2'],
  // Neutros y superficies
  ['--color-surface', '#ffffff'],
  ['--color-surface-muted', '#f7f7f5'],
  ['--color-surface-sunken', '#efeee9'],
  ['--color-border', '#e3e1dc'],
  ['--color-border-strong', '#857f75'],
  ['--color-ink-muted', '#5b6773'],
  ['--color-ink-inverse', '#ffffff'],
  ['--color-scrim', 'rgb(23 32 42 / 0.45)'],
  // Semánticos
  ['--color-success-600', '#1f7a4d'],
  ['--color-success-100', '#eaf6ef'],
  ['--color-warning-600', '#8a5a00'],
  ['--color-warning-100', '#fdf3e3'],
  ['--color-danger-600', '#b3261e'],
  ['--color-danger-700', '#8c1d18'],
  ['--color-danger-100', '#fdecea'],
  ['--color-info-600', '#1b5e8c'],
  ['--color-info-100', '#eaf2f9'],
  // Radios, sombras y movimiento
  ['--radius-control', '6px'],
  ['--radius-card', '16px'],
  ['--radius-sm', '6px'],
  ['--radius-md', '10px'],
  ['--radius-lg', '16px'],
  ['--radius-full', '9999px'],
  ['--shadow-sm', '0 1px 2px rgb(23 32 42 / 0.06)'],
  ['--shadow-md', '0 4px 12px rgb(23 32 42 / 0.08)'],
  ['--shadow-lg', '0 12px 32px rgb(23 32 42 / 0.12)'],
  ['--ease-standard', 'cubic-bezier(0.2, 0, 0, 1)'],
  ['--transition-duration-fast', '120ms'],
  ['--transition-duration-base', '180ms'],
  ['--transition-duration-slow', '280ms'],
]

/** Devuelve el contenido del bloque `@theme`, sin las llaves exteriores. */
function themeBlock(css: string): string {
  const start = css.indexOf('@theme')
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)

  if (start === -1 || open === -1 || close === -1) return ''

  return css.slice(open + 1, close)
}

/** Pares `--token: valor` declarados en el bloque, ignorando comentarios. */
function declaredTokens(css: string): Map<string, string> {
  const block = themeBlock(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = new Map<string, string>()

  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name && value) tokens.set(name, value.trim())
  }

  return tokens
}

const declared = declaredTokens(globalsCss)

/** Linealiza un canal sRGB (definición de luminancia relativa de WCAG 2.1). */
function channelToLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa de un color `#rrggbb` según WCAG 2.1. */
function relativeLuminance(hex: string): number {
  const digits = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) =>
    channelToLinear(Number.parseInt(digits.slice(offset, offset + 2), 16) / 255),
  )

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

/** Ratio de contraste WCAG 2.1 entre dos colores opacos. */
function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))

  return (lighter + 0.05) / (darker + 0.05)
}

describe('tokens de diseño en globals.css', () => {
  it('declara exactamente los tokens de `sistema-de-diseno` §2, sin duplicados ni sobrantes', () => {
    const expected = DESIGN_TOKENS.map(([name]) => name).sort()

    expect([...declared.keys()].sort()).toEqual(expected)
  })

  it.each(DESIGN_TOKENS)('declara %s con el valor de §2 (%s)', (name, value) => {
    expect(declared.get(name)).toBe(value)
  })

  it('no declara tokens duplicados en el bloque @theme', () => {
    const block = themeBlock(globalsCss).replace(/\/\*[\s\S]*?\*\//g, '')
    const names = [...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])

    expect(names).toHaveLength(new Set(names).size)
  })

  it('mantiene el token de scrim y su comentario de justificación (M1 de CIF-101)', () => {
    // El scrim es `brand-900` al 45 %: si se pierde el comentario, se pierde la trazabilidad de la
    // decisión del modal/sheet (CIF-101) y alguien "arreglará" el valor a ciegas. El comentario va
    // en la línea anterior porque Prettier partiría el `rgb()` si compartieran línea.
    expect(globalsCss).toContain('--color-scrim: rgb(23 32 42 / 0.45);')
    expect(globalsCss).toMatch(
      /\/\*\s*backdrop de Modal\/Sheet[^*]*M1\/CIF-102[^*]*\*\/\s*--color-scrim:/,
    )
  })
})

/**
 * §2.1 de `sistema-de-diseno` rev 5 fija la regla de contraste no textual (WCAG 2.1 1.4.11):
 * cuando el contorno identifica o delimita un control, el borde da ≥3:1 contra **todas** las
 * superficies adyacentes. El `it.each` de arriba fija el valor exacto; esto fija la regla, para que
 * `--color-border-strong` no pueda volver a un gris claro sin romper la suite.
 */
describe('contraste no textual de `--color-border-strong` (§2.1 / WCAG 2.1 1.4.11)', () => {
  it.each(['--color-surface', '--color-surface-muted', '--color-surface-sunken'] as const)(
    'da ≥3:1 sobre %s',
    (surface) => {
      const border = declared.get('--color-border-strong') ?? ''
      const background = declared.get(surface) ?? ''

      expect(border).not.toBe('')
      expect(background).not.toBe('')
      expect(contrastRatio(border, background)).toBeGreaterThanOrEqual(3)
    },
  )

  it('conserva el comentario que cita §2.1 y el ratio (trazabilidad del contrato)', () => {
    expect(globalsCss).toMatch(/\/\*[^*]*§2\.1[^*]*\*\/\s*--color-border-strong:/)
  })
})

/**
 * §2.1 rev 8: en la interfaz ningún separador usa `border-strong`; en el documento (papel, sin
 * controles) solo lo usa la regla estructural de la cabecera de tabla, declarada en la allowlist.
 * La guarda es estática a propósito: si reaparece un uso decorativo en cualquier fichero de
 * `src/**` (fuera de tests), la lista de apariciones deja de cuadrar con los cuatro usos de control,
 * la declaración del token y la regla estructural del documento, aunque el uso nuevo no cambie
 * ningún ratio.
 *
 * La guarda cuenta el **token** (`border-strong`), no una grafía: `divide-border-strong`,
 * `border-t-border-strong`, `border-[var(--color-border-strong)]` o un
 * `border-color: var(--color-border-strong)` en CSS cuentan igual que `border-border-strong`. El
 * `\b` final evita falsos positivos (`border-stronger`).
 *
 * Control de mutación: el `it.each` de grafías cubre la regresión que se coló (un separador con
 * otra utilidad de Tailwind v4); devolver `border-strong` al marco de `EmptyState` pone en rojo
 * esta guarda y la de «los dos usos decorativos»; un `divide-border-strong` decorativo en un
 * fichero nuevo pone en rojo solo esta.
 */
describe('guarda estática de `border-strong` decorativo (§2.1 rev 8, CIF-365)', () => {
  /**
   * Apariciones del token `border-strong` en un fuente, sea cual sea la utilidad de Tailwind v4 que
   * lo consume: clase (`border-border-strong`), variante de eje (`border-t-*`, `divide-*`), valor
   * arbitrario (`border-[var(--color-border-strong)]`), `var(--color-border-strong)` en un
   * `style`/CSS o la declaración del `@theme`.
   */
  function cuentaBorderStrong(fuente: string): number {
    return (fuente.match(/border-strong\b/g) ?? []).length
  }

  const USOS_PERMITIDOS = new Map([
    ['ui/admin/panel-primitives.tsx', 1], // Button secundario
    ['ui/admin/panel-shell.tsx', 2], // chips ES|EN + IconButton del menú
    ['app/globals.css', 1], // declaración del token en el @theme
    ['infrastructure/pdf/quote-document-palette.ts', 1], // regla estructural del documento (papel), §2.1 rev 8
  ])

  const srcRoot = fileURLToPath(new URL('..', import.meta.url))

  function fuentesDeSrc(): string[] {
    return readdirSync(srcRoot, { recursive: true, encoding: 'utf8' }).filter(
      (relative) => /\.(ts|tsx|css)$/.test(relative) && !relative.includes('.test.'),
    )
  }

  function fuente(relative: string): string {
    return readFileSync(join(srcRoot, relative), 'utf8')
  }

  it.each([
    'border-border-strong',
    'divide-y divide-border-strong',
    'border-t-border-strong',
    'border-x-border-strong',
    'border-l-border-strong',
    'border-[var(--color-border-strong)]',
    'ring-1 ring-border-strong',
    'outline-border-strong',
    'style={{ borderColor: "var(--color-border-strong)" }}',
    '--color-border-strong: #857f75;',
  ])('cuenta la grafía `%s` del token', (grafia) => {
    expect(cuentaBorderStrong(`<div className="${grafia}" />`)).toBe(1)
  })

  it('no cuenta una utilidad distinta que solo empieza igual (`border-stronger`)', () => {
    expect(cuentaBorderStrong('border-stronger')).toBe(0)
  })

  it('solo los usos de control y la declaración del @theme citan `border-strong` en src/**', () => {
    const apariciones = new Map<string, number>()

    for (const relative of fuentesDeSrc()) {
      const count = cuentaBorderStrong(fuente(relative))
      if (count > 0) apariciones.set(relative, count)
    }

    const comoLineas = (entries: Iterable<[string, number]>) =>
      [...entries].map(([file, count]) => `${file}:${count}`).sort()

    expect(comoLineas(apariciones)).toEqual(comoLineas(USOS_PERMITIDOS))
  })

  it('los dos usos decorativos reasignados usan `--color-border`', () => {
    // `EmptyState`: marco discontinuo de una región pasiva, no de un control.
    expect(fuente('ui/admin/panel-primitives.tsx')).toContain(
      'border border-dashed border-border bg-surface',
    )
    // Barra de precio fija en móvil: separador; ya se separa con `bg-surface` + `shadow-lg`.
    expect(fuente('ui/configurator/configurator-app.tsx')).toContain(
      'border-t border-border bg-surface',
    )
  })
})

/**
 * Hallazgos de conformidad de CIF-211: E1 (foco), E4 (movimiento), E5 (táctil) y A2 (hex sueltos).
 * Se comprueban sobre la hoja y los componentes cargados, no sobre una captura.
 */
describe('conformidad visual y de accesibilidad (CIF-211)', () => {
  it('define el foco visible con el token de acento (E1)', () => {
    expect(globalsCss).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent-500\);[^}]*outline-offset:\s*2px;/,
    )
  })

  it('desactiva el movimiento no esencial con prefers-reduced-motion (E4)', () => {
    expect(globalsCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(globalsCss).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
  })

  it('sube los objetivos táctiles del configurador a 44 px en móvil/tablet (E5)', () => {
    expect(globalsCss).toContain('.configurator-touch')
    expect(globalsCss).toMatch(/min-height:\s*44px/)
  })

  it('el fondo de página usa el token de superficie, no un hex suelto (A2)', () => {
    expect(globalsCss).toContain('background-color: var(--color-surface-muted);')
    expect(globalsCss).not.toMatch(/background-color:\s*#f7f7f5/)
  })

  it('ningún componente de src/ui lleva un color suelto (A2, hallazgo 7 de CIF-240)', () => {
    const root = fileURLToPath(new URL('../ui', import.meta.url))
    // Única excepción: la pintura normativa del modelo 2D (`modelo-visual-2d` rev 5 §4).
    const allowlist = new Set(['preview-2d/model.ts'])
    const offenders: string[] = []

    for (const relative of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
      if (!/\.(ts|tsx)$/.test(relative) || relative.includes('.test.') || allowlist.has(relative)) {
        continue
      }

      const source = readFileSync(join(root, relative), 'utf8')

      for (const [hex] of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        offenders.push(`${relative}: ${hex}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
