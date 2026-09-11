'use client'

import { useLocale, useTranslations } from 'next-intl'

import { Link, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/**
 * Selector de idioma accesible: enlaces reales por idioma (compartibles y rastreables) que
 * mantienen la página actual y marcan el idioma activo con `aria-current`.
 */
export function LocaleSwitcher() {
  const t = useTranslations('LanguageSwitcher')
  const activeLocale = useLocale()
  const pathname = usePathname()

  return (
    <nav aria-label={t('label')} className="flex items-center gap-2 text-sm">
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale

        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            lang={locale}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              isActive
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-brand-500/40 text-brand-700 hover:bg-brand-500/10'
            }`}
          >
            {t(`options.${locale}`)}
          </Link>
        )
      })}
    </nav>
  )
}
