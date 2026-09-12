import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { routing } from '@/i18n/routing'
import { createAdminCatalogReader } from '@/ui/admin/admin-catalog-reader.factory'
import { CatalogLanguages } from '@/ui/admin/catalog-languages'
import { loadSection, requestedState } from '@/ui/admin/panel-loading'
import { PanelShell, type Breadcrumb } from '@/ui/admin/panel-shell'

type AdminLanguagesPageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const BREADCRUMBS: readonly Breadcrumb[] = [
  { key: 'nav.section', href: null },
  { key: 'nav.languages', href: null },
]

export default async function AdminLanguagesPage({
  params,
  searchParams,
}: AdminLanguagesPageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const reader = createAdminCatalogReader(locale)
  const { state, data } = await loadSection({
    requested: requestedState(await searchParams),
    load: () => reader.listLanguages(),
    isEmpty: (languages) => languages.length === 0,
  })

  return (
    <PanelShell breadcrumbs={BREADCRUMBS}>
      <CatalogLanguages state={state} languages={data ?? []} />
    </PanelShell>
  )
}
