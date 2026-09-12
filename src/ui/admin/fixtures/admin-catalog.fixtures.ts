import { DEFAULT_LOCALE, type Locale } from '@/domain/catalog/locale'

import type { AdminCatalogReader } from '../admin-catalog-reader'
import type { SeriesDetail, SeriesSummary, TariffVersionSummary } from '../view-models'

/**
 * Adaptador de fixtures del panel (fase 1, ADR-0023 §3 y §10).
 *
 * Son **datos de demostración**, no catálogo real: nada de series, tarifas, colores ni precios de
 * negocio (ADR-0014 §1, ADR-0017 §2). Reproducen la forma del prototipo aprobado en CIF-55 para
 * poder construir y validar el shell mientras la lectura real llega en la fase 2.
 */

type LocalizedDemoName = Readonly<Record<Locale, string>>

type DemoSeries = {
  readonly id: string
  readonly slug: string
  readonly names: LocalizedDemoName
  readonly status: SeriesSummary['status']
  readonly limits: SeriesSummary['limits']
  readonly finishCount: number
  readonly tariffVersionNumber: number | null
  readonly missingLocales: readonly Locale[]
}

const DEMO_SERIES: readonly DemoSeries[] = [
  {
    id: 'demo-serie-a',
    slug: 'serie-a',
    names: { es: 'Serie A', en: 'Series A' },
    status: 'published',
    limits: { minWidthMm: 400, maxWidthMm: 2400, minHeightMm: 500, maxHeightMm: 2100 },
    finishCount: 3,
    tariffVersionNumber: 3,
    missingLocales: [],
  },
  {
    id: 'demo-serie-b',
    slug: 'serie-b',
    names: { es: 'Serie B', en: 'Series B' },
    status: 'published',
    limits: { minWidthMm: 400, maxWidthMm: 2100, minHeightMm: 500, maxHeightMm: 2100 },
    finishCount: 1,
    tariffVersionNumber: 3,
    missingLocales: ['en'],
  },
  {
    id: 'demo-serie-c',
    slug: 'serie-c',
    names: { es: 'Serie C', en: 'Serie C' },
    status: 'draft',
    limits: { minWidthMm: 400, maxWidthMm: 2100, minHeightMm: 500, maxHeightMm: 2100 },
    finishCount: 1,
    tariffVersionNumber: null,
    missingLocales: ['en'],
  },
  {
    id: 'demo-serie-d',
    slug: 'serie-d',
    names: { es: 'Serie D', en: 'Series D' },
    status: 'archived',
    limits: { minWidthMm: 400, maxWidthMm: 1800, minHeightMm: 500, maxHeightMm: 2100 },
    finishCount: 0,
    tariffVersionNumber: 2,
    missingLocales: [],
  },
]

const DEMO_TARIFF_VERSIONS: readonly Omit<TariffVersionSummary, 'seriesName'>[] = [
  {
    id: 'demo-tariff-a-v3',
    seriesId: 'demo-serie-a',
    versionNumber: 3,
    status: 'published',
    effectiveFrom: '2026-01-01',
    priceCount: 12,
  },
  {
    id: 'demo-tariff-a-v4',
    seriesId: 'demo-serie-a',
    versionNumber: 4,
    status: 'draft',
    effectiveFrom: null,
    priceCount: 0,
  },
  {
    id: 'demo-tariff-b-v3',
    seriesId: 'demo-serie-b',
    versionNumber: 3,
    status: 'published',
    effectiveFrom: '2026-01-01',
    priceCount: 8,
  },
  {
    id: 'demo-tariff-d-v2',
    seriesId: 'demo-serie-d',
    versionNumber: 2,
    status: 'archived',
    effectiveFrom: '2025-01-01',
    priceCount: 6,
  },
]

const DEMO_LANGUAGES: Readonly<Record<Locale, { readonly missingSeries: number }>> = {
  es: { missingSeries: 0 },
  en: { missingSeries: 2 },
}

function localizedName(names: LocalizedDemoName, locale: Locale): string {
  return names[locale] ?? names[DEFAULT_LOCALE]
}

export function createFixtureAdminCatalogReader(locale: Locale): AdminCatalogReader {
  const detailOf = (series: DemoSeries): SeriesDetail => ({
    id: series.id,
    slug: series.slug,
    status: series.status,
    names: series.names,
    translatedLocales: (['es', 'en'] as const).filter(
      (candidate) => !series.missingLocales.includes(candidate),
    ),
    limits: series.limits,
    finishCount: series.finishCount,
    tariffVersionNumber: series.tariffVersionNumber,
  })

  const tariffSeriesName = (seriesId: string): string => {
    const series = DEMO_SERIES.find((candidate) => candidate.id === seriesId)

    return series === undefined ? seriesId : localizedName(series.names, locale)
  }

  return {
    listSeries: async () =>
      DEMO_SERIES.map((series) => ({
        id: series.id,
        slug: series.slug,
        name: localizedName(series.names, locale),
        status: series.status,
        limits: series.limits,
        finishCount: series.finishCount,
        tariffVersionNumber: series.tariffVersionNumber,
        missingLocales: series.missingLocales,
      })),
    getSeries: async (slug) => {
      const series = DEMO_SERIES.find((candidate) => candidate.slug === slug)

      return series === undefined ? null : detailOf(series)
    },
    listTariffVersions: async () =>
      DEMO_TARIFF_VERSIONS.map((version) => ({
        ...version,
        seriesName: tariffSeriesName(version.seriesId),
      })),
    listLanguages: async () =>
      (['es', 'en'] as const).map((code) => ({
        code,
        isActive: true,
        missingSeries: DEMO_LANGUAGES[code].missingSeries,
      })),
  }
}
