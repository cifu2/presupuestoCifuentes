import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { routing } from '@/i18n/routing'
import { createAdminCatalogReader } from '@/ui/admin/admin-catalog-reader.factory'
import { buttonClass, PageHeader } from '@/ui/admin/panel-primitives'
import { loadSection, requestedState } from '@/ui/admin/panel-loading'
import { PanelShell, type Breadcrumb } from '@/ui/admin/panel-shell'
import { TariffVersions } from '@/ui/admin/tariff-versions'

type AdminTariffsPageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const BREADCRUMBS: readonly Breadcrumb[] = [
  { key: 'nav.section', href: null },
  { key: 'nav.tariffs', href: null },
]

export default async function AdminTariffsPage({ params, searchParams }: AdminTariffsPageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const t = await getTranslations('CatalogAdmin')
  const reader = createAdminCatalogReader(locale)
  const { state, data } = await loadSection({
    requested: requestedState(await searchParams),
    load: () => reader.listTariffVersions(),
    isEmpty: (versions) => versions.length === 0,
  })

  return (
    <PanelShell breadcrumbs={BREADCRUMBS}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('nav.tariffs')}>
          <button type="button" className={buttonClass('primary')} disabled>
            {t('newTariffVersion')}
          </button>
        </PageHeader>
        <TariffVersions state={state} versions={data ?? []} captionKey="tariffs.allCaption" />
      </div>
    </PanelShell>
  )
}
