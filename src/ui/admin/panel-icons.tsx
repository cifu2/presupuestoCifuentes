import type { ReactNode } from 'react'

/**
 * Iconos SVG del panel (`sistema-de-diseno` §2 y §5). Sustituyen a los emoji de la fase 1, que
 * pintaba la plataforma y quedaban fuera del lenguaje de tokens (hallazgo 1 de CIF-277 → CIF-296).
 *
 * Son **decorativos**: el nombre accesible lo pone el texto que los acompaña, así que van
 * `aria-hidden` y fuera del orden de tabulación (`focusable="false"`). El color entra siempre por
 * `currentColor` desde una utilidad de token (`text-brand-400`, `text-warning-600`…), nunca por un
 * literal.
 */

function Glyph({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

/** Puerta: vacío de series (`seriesEmpty`). */
export function DoorIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M4 21h16" />
      <path d="M14.5 12h.01" />
    </Glyph>
  )
}

/** Candado: sin permiso para la sección (`sectionForbidden`). */
export function LockIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2.5" />
    </Glyph>
  )
}

/** Triángulo de aviso: congelado del precio en tarifas (`tariffs.frozen`). */
export function WarningIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M12 4.25 21.25 19.75H2.75Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.25h.01" />
    </Glyph>
  )
}

/** Hamburguesa: abre la navegación por debajo de 768 px. */
export function MenuIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Glyph>
  )
}

/** Aspa: cierra la navegación móvil. */
export function CloseIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Glyph>
  )
}

/**
 * Indicadores de ordenación de la tabla de series (D2 de CIF-361): chevrones del lenguaje SVG, en
 * lugar de los glifos `▲`/`▼`, que los pinta la fuente de la plataforma. Van `aria-hidden` como el
 * resto; el sentido lo anuncia `aria-sort` y el nombre accesible del botón.
 */
export function SortAscIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="m6 14 6-6 6 6" />
    </Glyph>
  )
}

/** Indicador de orden descendente (D2 de CIF-361). */
export function SortDescIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="m6 10 6 6 6-6" />
    </Glyph>
  )
}

/** Etiqueta de precio: vacío de tarifas (`tariffsEmpty`, D3 de CIF-361). */
export function TagIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M12.5 4H5.5A1.5 1.5 0 0 0 4 5.5v7a1.5 1.5 0 0 0 .44 1.06l6 6a1.5 1.5 0 0 0 2.12 0l7-7a1.5 1.5 0 0 0 0-2.12l-6-6A1.5 1.5 0 0 0 12.5 4Z" />
      <path d="M8.5 8.5h.01" />
    </Glyph>
  )
}

/**
 * Flecha de enlace saliente: acompaña a «Ver web» sin volver a pintar un glifo de plataforma (H1 de
 * CIF-300 → CIF-311). Es decorativa: el nombre accesible del enlace lo pone su texto.
 */
export function ExternalIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M13.5 5.5h5v5" />
      <path d="M18.5 5.5 11 13" />
      <path d="M15.5 13.5V17a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 17V9.5A1.5 1.5 0 0 1 6.5 8H10" />
    </Glyph>
  )
}
