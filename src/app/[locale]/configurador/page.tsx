import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { buildLocaleAlternates } from '@/i18n/alternates'
import { routing } from '@/i18n/routing'
import { Preview2DConfigurator } from '@/ui/preview-2d/configurator'

type ConfiguratorPageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: ConfiguratorPageProps): Promise<Metadata> {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    return {}
  }

  return { alternates: buildLocaleAlternates('/configurador', locale) }
}

/**
 * Configurador público. CIF-6 entrega aquí la vista previa 2D en vivo; el catálogo publicado, el
 * precio en vivo y el paso a presupuesto manual llegan en CIF-7 sobre esta misma ruta.
 */
export default async function ConfiguratorPage({ params }: ConfiguratorPageProps) {
  const { locale } = await params

  setRequestLocale(locale)

  const t = await getTranslations('Preview2D')

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
        <p className="text-brand-700">{t('intro')}</p>
      </header>
      <Preview2DConfigurator />
    </main>
  )
}
