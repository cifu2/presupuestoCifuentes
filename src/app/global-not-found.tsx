import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'

import {
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  resolveNotFoundLocale,
} from '@/i18n/not-found-locale'

import './globals.css'

/**
 * 404 global.
 *
 * El layout raíz vive en `src/app/[locale]/layout.tsx`, así que Next no puede componer el 404 a
 * partir de los layouts: este fichero devuelve el documento HTML completo, importa los estilos y
 * resuelve el idioma con lo que acompaña a la petición (`src/i18n/not-found-locale.ts`).
 * Requiere `experimental.globalNotFound` en `next.config.ts`; ver `docs/i18n.md`.
 */

async function resolveLocale() {
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()])

  return resolveNotFoundLocale({
    localeHeader: requestHeaders.get(LOCALE_HEADER_NAME),
    localeCookie: requestCookies.get(LOCALE_COOKIE_NAME)?.value ?? null,
    acceptLanguage: requestHeaders.get('accept-language'),
  })
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale()
  const t = await getTranslations({ locale, namespace: 'NotFound' })

  return { title: t('title') }
}

export default async function GlobalNotFound() {
  const locale = await resolveLocale()
  const t = await getTranslations({ locale, namespace: 'NotFound' })

  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">404</p>
          <h1 className="text-[2rem] leading-[2.375rem] font-bold text-brand-900 sm:text-[2.5rem] sm:leading-[2.75rem]">
            {t('title')}
          </h1>
          <p className="text-lg text-brand-700">{t('description')}</p>
          <p>
            <a
              href={`/${locale}`}
              className="inline-flex rounded-full border border-brand-500 px-4 py-2 font-medium text-brand-700 transition-colors hover:bg-brand-500/10"
            >
              {t('backHome')}
            </a>
          </p>
        </main>
      </body>
    </html>
  )
}
