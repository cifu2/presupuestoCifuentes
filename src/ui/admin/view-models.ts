import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { Locale } from '@/domain/catalog/locale'

/**
 * Contrato de vista del panel (fase 1 de ADR-0023 §3).
 *
 * La presentación del panel solo conoce estos tipos: no importa Prisma, ni el catálogo de
 * demostración, ni casos de uso. La fase 2 (Backend, CIF-242) implementa `AdminCatalogReader`
 * devolviendo exactamente estas vistas, y el único punto que cambia es
 * `admin-catalog-reader.factory.ts`.
 */

/** Estados de pantalla del panel (`sistema-de-diseno` §6 y `prototipos-y-flujos` §10). */
export const ADMIN_PANEL_STATES = ['ready', 'loading', 'empty', 'error', 'forbidden'] as const

export type AdminPanelState = (typeof ADMIN_PANEL_STATES)[number]

/** Secciones del panel; el identificador es estable y el texto sale de `CatalogAdmin.nav.*`. */
export const PANEL_SECTIONS = [
  'series',
  'finishes',
  'colors',
  'accessories',
  'tariffs',
  'languages',
] as const

export type PanelSection = (typeof PANEL_SECTIONS)[number]

/** Pestañas del detalle de serie (`CatalogAdmin.tabs.*`). */
export const SERIES_TABS = ['general', 'measures', 'finishes', 'tariffs', 'translations'] as const

export type SeriesTab = (typeof SERIES_TABS)[number]

/** Medidas en milímetros enteros, como en el dominio (convenciones de código). */
export type MeasurementLimits = {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
}

export type SeriesSummary = {
  readonly id: string
  readonly slug: string
  /** Nombre ya resuelto en el idioma de la petición, con el mismo fallback que el configurador. */
  readonly name: string
  readonly status: CatalogStatus
  readonly limits: MeasurementLimits
  readonly finishCount: number
  /** Versión de tarifa vigente; `null` si la serie no tiene ninguna publicada. */
  readonly tariffVersionNumber: number | null
  /** Idiomas en los que aún falta nombre o descripción. */
  readonly missingLocales: readonly Locale[]
}

export type SeriesDetail = {
  readonly id: string
  readonly slug: string
  readonly status: CatalogStatus
  readonly names: Readonly<Record<Locale, string>>
  readonly translatedLocales: readonly Locale[]
  readonly limits: MeasurementLimits
  readonly finishCount: number
  readonly tariffVersionNumber: number | null
}

export type TariffVersionSummary = {
  readonly id: string
  readonly seriesId: string
  readonly seriesName: string
  readonly versionNumber: number
  readonly status: CatalogStatus
  /** Día de entrada en vigor (ISO `YYYY-MM-DD`); `null` mientras es borrador. */
  readonly effectiveFrom: string | null
  readonly priceCount: number
}

export type CatalogLanguageSummary = {
  readonly code: Locale
  readonly isActive: boolean
  /** Series a las que les falta el nombre o la descripción en este idioma. */
  readonly missingSeries: number
}
