import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { getPublishedSeries } from '@/application/use-cases/get-published-series'
import {
  getSeriesDetail,
  type CatalogSeriesDetail,
} from '@/application/use-cases/get-series-detail'
import { createContainer } from '@/composition/container'
import type { Locale } from '@/domain/catalog/locale'
import { buildLocaleAlternates } from '@/i18n/alternates'
import { routing } from '@/i18n/routing'
import { ConfiguratorApp } from '@/ui/configurator/configurator-app'

/**
 * El catálogo y las tarifas los edita el propietario desde el panel: la página no puede
 * prerenderizarse con los datos del build o el precio quedaría congelado hasta el siguiente
 * despliegue (ADR-0020, configurador data-driven).
 */
export const dynamic = 'force-dynamic'

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

/** Primera serie publicada: su ficha viaja ya resuelta para que la primera pintada sea completa. */
async function loadInitialDetail(
  seriesSlug: string | undefined,
  locale: Locale,
): Promise<CatalogSeriesDetail | null> {
  if (seriesSlug === undefined) {
    return null
  }

  const container = createContainer()

  try {
    return await getSeriesDetail(
      {
        seriesRepository: container.seriesRepository,
        finishRepository: container.finishRepository,
        colorRepository: container.colorRepository,
        accessoryRepository: container.accessoryRepository,
      },
      { slug: seriesSlug, locale },
    )
  } catch {
    // La ficha se puede volver a pedir desde el cliente; la página sigue siendo usable.
    return null
  }
}

export default async function ConfiguratorPage({ params }: ConfiguratorPageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const t = await getTranslations('Preview2D')
  const container = createContainer()
  const series = await getPublishedSeries(
    { seriesRepository: container.seriesRepository },
    { locale },
  )
  const initialDetail = await loadInitialDetail(series[0]?.slug, locale)

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8 lg:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-[2rem] leading-[2.5rem] font-bold text-brand-900">{t('title')}</h1>
        <p className="text-brand-700">{t('intro')}</p>
      </header>
      <ConfiguratorApp locale={locale} series={series} initialDetail={initialDetail} />
    </main>
  )
}
