/**
 * Deriva de la paleta del documento (`plantilla-presupuesto` §4, T9 y T10).
 *
 * La fuente es el bloque `@theme` de `src/app/globals.css` (`sistema-de-diseno` §2): cada rol del
 * documento debe ser el hex exacto de su token. Cambiar un token sin actualizar la paleta, o
 * inventar un color en cualquier otro fichero de `src/infrastructure/pdf/**`, rompe esta suite.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  QUOTE_DOCUMENT_PALETTE,
  QUOTE_DOCUMENT_PALETTE_TOKENS,
  type QuoteDocumentColorRole,
} from './quote-document-palette'

const globalsCss = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8',
)

const pdfRoot = fileURLToPath(new URL('.', import.meta.url))

/** Fichero que declara la allowlist; ningún otro de `src/infrastructure/pdf/**` puede llevar hex. */
const PALETTE_MODULE = 'quote-document-palette.ts'

/** Contenido del bloque `@theme`, sin las llaves exteriores. */
function themeBlock(css: string): string {
  const start = css.indexOf('@theme')
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)

  if (start === -1 || open === -1 || close === -1) return ''

  return css.slice(open + 1, close)
}

/** Pares `--token: valor` del bloque, ignorando comentarios. */
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
const roles = Object.keys(QUOTE_DOCUMENT_PALETTE) as QuoteDocumentColorRole[]

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

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))

  return (lighter + 0.05) / (darker + 0.05)
}

describe('paleta del documento de presupuesto', () => {
  it('declara los 8 roles de §4.1, sin sobrantes ni duplicados', () => {
    expect(roles).toHaveLength(8)
    expect([...roles].sort()).toEqual(Object.keys(QUOTE_DOCUMENT_PALETTE_TOKENS).sort())
    expect(new Set(roles).size).toBe(roles.length)
  })

  it.each(roles)('el rol %s es el hex exacto de su token de §2', (role) => {
    const token = QUOTE_DOCUMENT_PALETTE_TOKENS[role]

    expect(declared.get(token), `token ${token} declarado en el @theme`).toBeTruthy()
    expect(QUOTE_DOCUMENT_PALETTE[role]).toBe(declared.get(token))
  })

  it('no cuela `#000000` ni tokens de acento (D5)', () => {
    const hexes = Object.values(QUOTE_DOCUMENT_PALETTE).map((hex) => hex.toLowerCase())
    const tokens = Object.values(QUOTE_DOCUMENT_PALETTE_TOKENS)

    expect(hexes).not.toContain('#000000')
    expect(tokens.filter((token) => token.startsWith('--color-accent'))).toEqual([])
  })

  it('mantiene el contraste de texto ≥ 4,5:1 medido (§4.2)', () => {
    const surface = QUOTE_DOCUMENT_PALETTE.surface

    for (const role of ['ink', 'inkMuted', 'brand'] as const) {
      expect(contrastRatio(QUOTE_DOCUMENT_PALETTE[role], surface), role).toBeGreaterThanOrEqual(4.5)
    }

    expect(
      contrastRatio(QUOTE_DOCUMENT_PALETTE.warningInk, QUOTE_DOCUMENT_PALETTE.warningBackground),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('la regla estructural de la cabecera da ≥3:1 sobre `surface` (§2.1 rev 8)', () => {
    expect(
      contrastRatio(QUOTE_DOCUMENT_PALETTE.ruleStrong, QUOTE_DOCUMENT_PALETTE.surface),
    ).toBeGreaterThanOrEqual(3)
  })
})

describe('guarda de color de `src/infrastructure/pdf/**` (T9)', () => {
  it('ningún fichero que no sea la paleta lleva un `#RRGGBB`', () => {
    const offenders: string[] = []

    for (const relative of readdirSync(pdfRoot, { recursive: true, encoding: 'utf8' })) {
      if (
        !/\.(ts|tsx)$/.test(relative) ||
        relative.includes('.test.') ||
        relative === PALETTE_MODULE
      ) {
        continue
      }

      const source = readFileSync(join(pdfRoot, relative), 'utf8')

      for (const [hex] of source.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        offenders.push(`${relative}: ${hex}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
