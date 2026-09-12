import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { routing } from '@/i18n/routing'
import { SectionPlaceholder } from '@/ui/admin/panel-primitives'
import { PanelShell, type Breadcrumb } from '@/ui/admin/panel-shell'

type AdminSectionPageProps = {
  params: Promise<{ locale: string }>
}

const BREADCRUMBS: readonly Breadcrumb[] = [
  { key: 'nav.section', href: null },
  { key: 'nav.finishes', href: null },
]

export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const t = await getTranslations('CatalogAdmin')

  return (
    <PanelShell breadcrumbs={BREADCRUMBS}>
      <SectionPlaceholder title={t('nav.finishes')} help={t('placeholder')} />
    </PanelShell>
  )
}
