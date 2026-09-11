import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LocaleSwitcher } from '@/ui/locale-switcher'

const SCOPE_KEYS = ['configurator', 'tariffs', 'quote', 'admin'] as const

type HomePageProps = {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params

  setRequestLocale(locale)

  const t = await getTranslations('Home')

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">
            {t('eyebrow')}
          </p>
          <LocaleSwitcher />
        </div>
        <h1 className="text-4xl font-bold text-brand-900">{t('title')}</h1>
        <p className="text-lg text-brand-700">{t('intro')}</p>
      </header>

      <section aria-labelledby="alcance-mvp" className="flex flex-col gap-3">
        <h2 id="alcance-mvp" className="text-xl font-semibold text-brand-900">
          {t('scopeTitle')}
        </h2>
        <ul className="flex flex-col gap-2 text-brand-700">
          {SCOPE_KEYS.map((key) => (
            <li key={key} className="rounded-lg border border-brand-500/20 bg-white px-4 py-3">
              {t(`scope.${key}`)}
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-brand-500">{t('footer')}</footer>
    </main>
  )
}
