import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { sanitizeNextPath } from '@/app/api/_lib/admin-guard'
import { isAdminSessionConfigured } from '@/app/api/_lib/admin-session'
import { env } from '@/config/env'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { AccessForm } from '@/ui/admin-access/access-form'

type AccessPageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ next?: string | string[] }>
}

export async function generateMetadata({ params }: AccessPageProps): Promise<Metadata> {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    return {}
  }

  const t = await getTranslations({ locale, namespace: 'AdminAccess' })

  return {
    title: t('metadataTitle'),
    description: t('metadataDescription'),
    robots: { index: false, follow: false },
  }
}

/**
 * Página de acceso del panel (CIF-241, ADR-0024): emite la cookie de sesión firmada. Vive fuera de
 * `/[locale]/admin/**` para poder mostrarse sin sesión; el resto del panel queda detrás de la
 * guarda del Proxy.
 */
export default async function AccessPage({ params, searchParams }: AccessPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams])

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const t = await getTranslations('AdminAccess')
  const requested = Array.isArray(query.next) ? query.next[0] : query.next
  const next = sanitizeNextPath(requested, locale)
  const disabled = !isAdminSessionConfigured({
    sessionSecret: env.ADMIN_SESSION_SECRET,
    password: env.ADMIN_PANEL_PASSWORD,
  })

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">
          {t('eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-900">{t('title')}</h1>
        <p className="text-brand-700">{t('intro')}</p>
      </header>

      <AccessForm
        next={next}
        disabled={disabled}
        labels={{
          password: t('passwordLabel'),
          submit: t('submit'),
          submitting: t('submitting'),
          invalid: t('invalid'),
          unavailable: t('unavailable'),
          disabled: t('disabled'),
        }}
      />

      <Link href="/" className="text-sm text-brand-500 underline">
        {t('backHome')}
      </Link>
    </main>
  )
}
