import { describe, expect, it } from 'vitest'

import { CATALOG_STATUSES } from '@/domain/catalog/catalog-status'

import {
  FINISH_LABEL_KEYS,
  NAV_ITEMS,
  SERIES_SORT_KEYS,
  SERIES_TAB_ITEMS,
  formatDay,
  formatMeasurementPair,
  formatMillimetres,
  formatVersionNumber,
  isSeriesTab,
  localeSwitchHref,
  resolveActiveSection,
  resolvePanelState,
  sortSeries,
  statusLabelKey,
} from './panel-navigation'
import type { SeriesSummary } from './view-models'

const series: readonly SeriesSummary[] = [
  {
    id: 'b',
    slug: 'serie-b',
    name: 'Serie B',
    status: 'published',
    limits: { minWidthMm: 400, maxWidthMm: 2100, minHeightMm: 500, maxHeightMm: 2100 },
    finishCount: 1,
    tariffVersionNumber: 3,
    missingLocales: ['en'],
  },
  {
    id: 'a',
    slug: 'serie-a',
    name: 'Serie A',
    status: 'draft',
    limits: { minWidthMm: 400, maxWidthMm: 2400, minHeightMm: 500, maxHeightMm: 2100 },
    finishCount: 3,
    tariffVersionNumber: null,
    missingLocales: [],
  },
]

describe('navegación del panel', () => {
  it('cubre todas las secciones del prototipo con una ruta propia', () => {
    expect(NAV_ITEMS.map((item) => item.section)).toEqual([
      'series',
      'finishes',
      'colors',
      'accessories',
      'tariffs',
      'languages',
    ])
    expect(NAV_ITEMS.filter((item) => item.href === '/admin')).toHaveLength(1)
  })

  it('resuelve la sección activa desde el pathname', () => {
    expect(resolveActiveSection('/admin')).toBe('series')
    expect(resolveActiveSection('/admin/series/serie-a')).toBe('series')
    expect(resolveActiveSection('/admin/tarifas')).toBe('tariffs')
    expect(resolveActiveSection('/en/admin/idiomas')).toBe('languages')
  })

  it('el estado forzado manda, y sin datos el estado es vacío', () => {
    expect(resolvePanelState(undefined, true)).toBe('ready')
    expect(resolvePanelState(undefined, false)).toBe('empty')
    expect(resolvePanelState('empty', true)).toBe('empty')
    expect(resolvePanelState('loading', true)).toBe('loading')
    expect(resolvePanelState('error', true)).toBe('error')
    expect(resolvePanelState('forbidden', true)).toBe('forbidden')
    expect(resolvePanelState('ready', false)).toBe('empty')
    expect(resolvePanelState('inventado', false)).toBe('empty')
  })

  it('ordena por las columnas del prototipo y en ambos sentidos', () => {
    expect(sortSeries(series, 'name', 'ascending').map((item) => item.slug)).toEqual([
      'serie-a',
      'serie-b',
    ])
    expect(sortSeries(series, 'name', 'descending').map((item) => item.slug)).toEqual([
      'serie-b',
      'serie-a',
    ])
    expect(sortSeries(series, 'max', 'ascending').map((item) => item.slug)).toEqual([
      'serie-b',
      'serie-a',
    ])
    expect(sortSeries(series, 'tariff', 'descending').map((item) => item.slug)).toEqual([
      'serie-b',
      'serie-a',
    ])
    expect(SERIES_SORT_KEYS).toHaveLength(5)
  })

  it('reconoce las pestañas del detalle y sus claves', () => {
    expect(isSeriesTab('measures')).toBe(true)
    expect(isSeriesTab('inventada')).toBe(false)
    expect(SERIES_TAB_ITEMS).toHaveLength(5)
  })

  it('conserva la query de la pantalla al cambiar de idioma (H3 de CIF-281)', () => {
    expect(localeSwitchHref('/admin/series/serie-a', 'tab=measures')).toBe(
      '/admin/series/serie-a?tab=measures',
    )
    expect(localeSwitchHref('/admin/series/serie-a', '?tab=measures&state=ready')).toBe(
      '/admin/series/serie-a?tab=measures&state=ready',
    )
    expect(localeSwitchHref('/admin/tarifas', '')).toBe('/admin/tarifas')
    expect(localeSwitchHref('/admin', '')).toBe('/admin')
  })

  it('formatea medidas, versiones y días según el idioma', () => {
    expect(formatMeasurementPair(series[1]!.limits, 'es')).toBe('2400 × 2100 mm')
    expect(formatMeasurementPair(series[1]!.limits, 'en')).toBe('2,400 × 2,100 mm')
    expect(formatMillimetres(2400, 'en')).toBe('2,400 mm')
    expect(formatVersionNumber(3)).toBe('v3')
    expect(formatDay('2026-01-01', 'es')).toContain('2026')
  })

  it('etiqueta estados y acabados con claves del namespace del panel', () => {
    expect(CATALOG_STATUSES.map(statusLabelKey)).toEqual([
      'status.draft',
      'status.published',
      'status.archived',
    ])
    expect(FINISH_LABEL_KEYS).toContain('finish.lacquered')
  })
})
