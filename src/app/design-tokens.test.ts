import { readFileSync } from 'node:fs'
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
  ['--color-border-strong', '#c9c6bf'],
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

  it('los componentes del configurador no llevan colores sueltos en clases (A2)', () => {
    for (const file of [
      '../ui/configurator/configurator-app.tsx',
      '../ui/preview-2d/configurator.tsx',
    ]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')

      expect(source, file).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/)
    }
  })
})
