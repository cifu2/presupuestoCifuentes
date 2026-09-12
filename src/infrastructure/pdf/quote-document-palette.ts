/**
 * Paleta del documento de presupuesto (`plantilla-presupuesto` §4, decisión D4).
 *
 * Cada rol se corresponde **1:1** con un token de `sistema-de-diseno` §2: el documento no inventa
 * color. Los valores están congelados como literales porque `@react-pdf` renderiza en servidor y no
 * puede leer custom properties de CSS; este módulo es la **allowlist declarada** de la paleta y el
 * único fichero de `src/infrastructure/pdf/**` que puede contener un `#RRGGBB`
 * (`quote-document-palette.test.ts` lo comprueba contra el bloque `@theme` de `globals.css`).
 *
 * El token de contorno de control de §2.1 rev 5 **no entra**: está reservado a los controles de la
 * interfaz y el documento es papel, sin controles. Los separadores (cabecera de tabla, filas y pie)
 * usan `rule` (`--color-border`), decorativo y por tanto exento de WCAG 1.4.11.
 */

/** Roles de color del documento, con el hex congelado de §2. */
export const QUOTE_DOCUMENT_PALETTE = {
  /** Texto principal: cuerpo, valores, cifras, nombre del emisor y total. */
  ink: '#17202a',
  /** Texto secundario: rótulos de fila, fechas, condiciones, pie y cabecera del emisor. */
  inkMuted: '#5b6773',
  /** Rótulos y título: título del documento, rótulos de sección y regla del total. */
  brand: '#22303f',
  /** Regla interna: cabecera de tabla, separadores de fila y regla del pie. */
  rule: '#e3e1dc',
  /** Fondo: el papel. */
  surface: '#ffffff',
  /** Aviso provisional: tinta del texto y del borde. */
  warningInk: '#8a5a00',
  /** Aviso provisional: fondo de la banda. */
  warningBackground: '#fdf3e3',
} as const

export type QuoteDocumentPalette = typeof QUOTE_DOCUMENT_PALETTE

export type QuoteDocumentColorRole = keyof QuoteDocumentPalette

/** Token de §2 del que deriva cada rol; el test de deriva lo exige 1:1. */
export const QUOTE_DOCUMENT_PALETTE_TOKENS: Readonly<Record<QuoteDocumentColorRole, string>> = {
  ink: '--color-brand-900',
  inkMuted: '--color-ink-muted',
  brand: '--color-brand-800',
  rule: '--color-border',
  surface: '--color-surface',
  warningInk: '--color-warning-600',
  warningBackground: '--color-warning-100',
}
