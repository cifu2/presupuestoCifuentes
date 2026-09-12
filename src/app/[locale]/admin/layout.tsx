import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { routing } from '@/i18n/routing'
import { isAdminPanelAvailable } from '@/ui/admin/admin-access'

import '@/ui/admin/admin.css'

/**
 * Layout del panel (ADR-0023).
 *
 * - Guarda de acceso (§5): en Production el panel está cerrado por defecto; solo lo abre
 *   `ADMIN_PANEL_ENABLED` o el catálogo de demostración del E2E.
 * - `noindex`: el panel no se indexa aunque la guarda esté abierta.
 * - `force-dynamic`: la decisión de la guarda se lee en cada petición, no se puede prerenderizar
 *   (si no, un build sin el interruptor congelaría el 404 para siempre).
 */

export const dynamic = 'force-dynamic'

type AdminLayoutProps = {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: AdminLayoutProps): Promise<Metadata> {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    return {}
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' })

  return {
    title: t('title'),
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  if (!isAdminPanelAvailable()) {
    notFound()
  }

  return children
}
