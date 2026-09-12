/**
 * Paleta del documento de presupuesto (`plantilla-presupuesto` §4, decisión D4).
 *
 * Cada rol se corresponde **1:1** con un token de `sistema-de-diseno` §2: el documento no inventa
 * color. Los valores están congelados como literales porque `@react-pdf` renderiza en servidor y no
 * puede leer custom properties de CSS; este módulo es la **allowlist declarada** de la paleta y el
 * único fichero de `src/infrastructure/pdf/**` que puede contener un `#RRGGBB`
 * (`quote-document-palette.test.ts` lo comprueba contra el bloque `@theme` de `globals.css`).
 *
 * Declara los **8 roles de §4.1**. Seis son tinta, papel y avisos; `rule` es el separador decorativo
 * (filas y pie) y `ruleStrong` es la **regla estructural de documento (§2.1 rev 8)**: la de 0,75 pt
 * que cierra la cabecera de tabla, con ≥3:1 sobre `surface` (WCAG 2.1 1.4.11, contraste no textual
 * medido en el test de deriva). §2.1 rev 8 sigue reservando el contorno de control a los controles
 * de la interfaz, pero admite esta categoría para el papel, que no tiene controles.
 */

/** Roles de color del documento, con el hex congelado de §2. */
export const QUOTE_DOCUMENT_PALETTE = {
  /** Texto principal: cuerpo, valores, cifras, nombre del emisor y total. */
  ink: '#17202a',
  /** Texto secundario: rótulos de fila, fechas, condiciones, pie y cabecera del emisor. */
  inkMuted: '#5b6773',
  /** Rótulos y título: título del documento, rótulos de sección y regla del total. */
  brand: '#22303f',
  /** Regla interna: separadores de fila y regla del pie. */
  rule: '#e3e1dc',
  /** Regla estructural de documento (§2.1 rev 8): cierra la cabecera de tabla. */
  ruleStrong: '#857f75',
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
  ruleStrong: '--color-border-strong',
  surface: '--color-surface',
  warningInk: '--color-warning-600',
  warningBackground: '--color-warning-100',
}
