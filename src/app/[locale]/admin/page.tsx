import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { routing } from '@/i18n/routing'
import { createAdminCatalogReader } from '@/ui/admin/admin-catalog-reader.factory'
import { PanelShell, type Breadcrumb } from '@/ui/admin/panel-shell'
import { loadSection, requestedState } from '@/ui/admin/panel-loading'
import { SeriesList } from '@/ui/admin/series-list'

type AdminSeriesPageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const BREADCRUMBS: readonly Breadcrumb[] = [
  { key: 'nav.section', href: null },
  { key: 'nav.series', href: null },
]

export default async function AdminSeriesPage({ params, searchParams }: AdminSeriesPageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const reader = createAdminCatalogReader(locale)
  const { state, data } = await loadSection({
    requested: requestedState(await searchParams),
    load: () => reader.listSeries(),
    isEmpty: (series) => series.length === 0,
  })

  return (
    <PanelShell breadcrumbs={BREADCRUMBS}>
      <SeriesList state={state} series={data ?? []} />
    </PanelShell>
  )
}
