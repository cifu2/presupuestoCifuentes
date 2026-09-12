import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { Locale } from '@/domain/catalog/locale'

import {
  ADMIN_PANEL_STATES,
  PANEL_SECTIONS,
  SERIES_TABS,
  type AdminPanelState,
  type MeasurementLimits,
  type PanelSection,
  type SeriesTab,
  type SeriesSummary,
} from './view-models'

/** Secciones del sidebar, en el orden del prototipo v3.2 (`prototipos-y-flujos` §10). */
export const NAV_ITEMS: readonly {
  readonly section: PanelSection
  readonly href: string
  readonly labelKey: string
}[] = [
  { section: 'series', href: '/admin', labelKey: 'nav.series' },
  { section: 'finishes', href: '/admin/acabados', labelKey: 'nav.finishes' },
  { section: 'colors', href: '/admin/colores', labelKey: 'nav.colors' },
  { section: 'accessories', href: '/admin/accesorios', labelKey: 'nav.accessories' },
  { section: 'tariffs', href: '/admin/tarifas', labelKey: 'nav.tariffs' },
  { section: 'languages', href: '/admin/idiomas', labelKey: 'nav.languages' },
]

/** Pestañas del detalle de serie. */
export const SERIES_TAB_ITEMS: readonly { readonly tab: SeriesTab; readonly labelKey: string }[] = [
  { tab: 'general', labelKey: 'tabs.general' },
  { tab: 'measures', labelKey: 'tabs.measures' },
  { tab: 'finishes', labelKey: 'tabs.finishes' },
  { tab: 'tariffs', labelKey: 'tabs.tariffs' },
  { tab: 'translations', labelKey: 'tabs.translations' },
]

/** Columnas ordenables de la tabla de series. */
export const SERIES_SORT_KEYS = ['status', 'name', 'max', 'finishes', 'tariff'] as const

export type SeriesSortKey = (typeof SERIES_SORT_KEYS)[number]
export type SortDirection = 'ascending' | 'descending'

export function isPanelSection(value: string): value is PanelSection {
  return (PANEL_SECTIONS as readonly string[]).includes(value)
}

export function isSeriesTab(value: string): value is SeriesTab {
  return (SERIES_TABS as readonly string[]).includes(value)
}

export function isPanelState(value: string): value is AdminPanelState {
  return (ADMIN_PANEL_STATES as readonly string[]).includes(value)
}

export function isSeriesSortKey(value: string): value is SeriesSortKey {
  return (SERIES_SORT_KEYS as readonly string[]).includes(value)
}

/**
 * Estado de pantalla que se pinta. `?state=` fuerza los estados del DoD §6 para poder revisarlos
 * y probarlos (el prototipo usa `?vista=`); si no, el estado lo decide el contenido disponible.
 */
export function resolvePanelState(
  requested: string | undefined,
  hasData: boolean,
): AdminPanelState {
  if (requested !== undefined && isPanelState(requested) && requested !== 'ready') {
    return requested
  }

  return hasData ? 'ready' : 'empty'
}

/**
 * Sección activa a partir del pathname del panel, para `aria-current` y las migas. Acepta tanto la
 * ruta sin prefijo (la que devuelve el `usePathname` de next-intl) como con él.
 */
export function resolveActiveSection(pathname: string): PanelSection {
  const withoutPrefix = pathname.replace(/^\/(?:es|en)(?=\/|$)/, '')
  const item = NAV_ITEMS.find(
    (candidate) => candidate.href !== '/admin' && withoutPrefix.startsWith(candidate.href),
  )

  return item?.section ?? 'series'
}

const SORT_ACCESSORS: Record<SeriesSortKey, (series: SeriesSummary) => string | number> = {
  status: (series) => series.status,
  name: (series) => series.name,
  max: (series) => series.limits.maxWidthMm * 10000 + series.limits.maxHeightMm,
  finishes: (series) => series.finishCount,
  tariff: (series) => series.tariffVersionNumber ?? 0,
}

export function sortSeries(
  series: readonly SeriesSummary[],
  key: SeriesSortKey,
  direction: SortDirection,
): readonly SeriesSummary[] {
  const accessor = SORT_ACCESSORS[key]
  const factor = direction === 'ascending' ? 1 : -1

  return [...series].sort((left, right) => {
    const a = accessor(left)
    const b = accessor(right)
    const comparison =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'es', { numeric: true })

    return comparison * factor
  })
}

/** Etiqueta de estado del catálogo (`CatalogAdmin.status.*`). */
export function statusLabelKey(status: CatalogStatus): string {
  return `status.${status}`
}

export type PanelTranslator = (key: string, values?: Record<string, string | number>) => string

/** Medidas con separador de miles del idioma (diseño §7): `2.400 × 2.100 mm`. */
export function formatMeasurementPair(limits: MeasurementLimits, locale: Locale): string {
  const format = new Intl.NumberFormat(locale)

  return `${format.format(limits.maxWidthMm)} × ${format.format(limits.maxHeightMm)} mm`
}

/** Un día del calendario, sin hora: se formatea en UTC para que no baile según el huso. */
export function formatDay(isoDay: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${isoDay}T00:00:00.000Z`),
  )
}

/** Acabados del catálogo de demostración, con su clave de traducción (`CatalogAdmin.finish.*`). */
export const FINISH_LABEL_KEYS = [
  'finish.lacquered',
  'finish.naturalVeneer',
  'finish.aluminium',
  'finish.steel',
] as const

/** Etiqueta de versión de tarifa, como la pinta el prototipo (`v3`). */
export function formatVersionNumber(versionNumber: number): string {
  return `v${versionNumber}`
}

/** Una medida suelta en milímetros, con el separador de miles del idioma. */
export function formatMillimetres(valueMm: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale).format(valueMm)} mm`
}
