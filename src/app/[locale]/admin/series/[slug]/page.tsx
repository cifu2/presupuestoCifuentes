import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { routing } from '@/i18n/routing'
import { createAdminCatalogReader } from '@/ui/admin/admin-catalog-reader.factory'
import { isSeriesTab } from '@/ui/admin/panel-navigation'
import { firstParam, loadSection, requestedState } from '@/ui/admin/panel-loading'
import { PanelShell, type Breadcrumb } from '@/ui/admin/panel-shell'
import { SeriesDetailView } from '@/ui/admin/series-detail'
import type { SeriesTab } from '@/ui/admin/view-models'

type AdminSeriesDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const BREADCRUMBS: readonly Breadcrumb[] = [
  { key: 'nav.section', href: null },
  { key: 'nav.series', href: '/admin' },
]

function resolveTab(value: string | undefined): SeriesTab {
  return value !== undefined && isSeriesTab(value) ? value : 'general'
}

export default async function AdminSeriesDetailPage({
  params,
  searchParams,
}: AdminSeriesDetailPageProps) {
  const { locale, slug } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const query = await searchParams
  const reader = createAdminCatalogReader(locale)
  const { data: detail } = await loadSection({
    requested: requestedState(query),
    load: () => reader.getSeries(slug),
    isEmpty: (series) => series === null,
  })

  if (detail === null) {
    notFound()
  }

  const tab = resolveTab(firstParam(query.tab))
  // Las tarifas solo se piden cuando la pestaña las muestra: la fase 2 podrá paginar por sección.
  const tariffVersions = tab === 'tariffs' ? await reader.listTariffVersions().catch(() => []) : []
  const versionsOfSeries = tariffVersions.filter((version) => version.seriesId === detail.id)

  return (
    <PanelShell breadcrumbs={BREADCRUMBS}>
      <SeriesDetailView detail={detail} tab={tab} tariffVersions={versionsOfSeries} />
    </PanelShell>
  )
}
