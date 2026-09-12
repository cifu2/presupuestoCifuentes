'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import type { Locale } from '@/domain/catalog/locale'

import { Link, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { NAV_ITEMS, localeSwitchHref, resolveActiveSection } from './panel-navigation'
import { Badge } from './panel-primitives'

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500'

export type Breadcrumb = { readonly key: string; readonly href: string | null }

/**
 * Selector de idioma del topbar. Conserva la query de la pantalla (H3 de CIF-281): la ruta la pone el
 * `Link` de next-intl y la query, `localeSwitchHref`.
 */
function LocaleSwitch({ pathname, searchParams }: { pathname: string; searchParams: string }) {
  const t = useTranslations('CatalogAdmin')
  const activeLocale = useLocale() as Locale
  const href = localeSwitchHref(pathname, searchParams)

  return (
    <nav aria-label={t('a11y.locale')} className="flex items-center gap-1">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={href}
          locale={locale}
          lang={locale}
          aria-current={locale === activeLocale ? 'true' : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold uppercase ${FOCUS} ${
            locale === activeLocale
              ? 'border-brand-800 bg-brand-800 text-ink-inverse'
              : 'border-border-strong text-brand-700 hover:bg-surface-sunken'
          }`}
        >
          {locale}
        </Link>
      ))}
    </nav>
  )
}

/**
 * La query de la URL vive en el cliente. Las rutas del panel son `force-dynamic` (ADR-0023 §5), así
 * que `useSearchParams` no suspende y no hace falta un límite de `Suspense` a su alrededor.
 */
function LocaleSwitchFromUrl({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams()

  return <LocaleSwitch pathname={pathname} searchParams={searchParams.toString()} />
}

function NavigationLink({
  href,
  isActive,
  children,
  onNavigate,
}: {
  href: string
  isActive: boolean
  children: ReactNode
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold ${FOCUS} ${
        isActive ? 'bg-brand-100 text-brand-800' : 'text-brand-700 hover:bg-surface-sunken'
      }`}
    >
      {children}
    </Link>
  )
}

/**
 * Shell de aplicación del panel (ADR-0023 §1): `skip link`, topbar con selector de idioma, sidebar
 * que se convierte en menú desplegable en móvil y migas. No lee datos: los pone cada página.
 */
export function PanelShell({
  breadcrumbs,
  children,
}: {
  breadcrumbs: readonly Breadcrumb[]
  children: ReactNode
}) {
  const t = useTranslations('CatalogAdmin')
  const pathname = usePathname()
  const activeSection = resolveActiveSection(pathname)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const closeMenu = () => {
    setIsMenuOpen(false)
  }

  const sections = NAV_ITEMS.map((item) => (
    <NavigationLink
      key={item.section}
      href={item.href}
      isActive={item.section === activeSection}
      onNavigate={closeMenu}
    >
      {t(item.labelKey)}
    </NavigationLink>
  ))

  return (
    <div className="admin-panel min-h-screen bg-surface-muted">
      <a className="admin-skip" href="#main">
        {t('a11y.skip')}
      </a>

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`inline-flex size-11 items-center justify-center rounded-control border border-border-strong text-brand-800 md:hidden ${FOCUS}`}
              aria-label={isMenuOpen ? t('a11y.closeMenu') : t('a11y.openMenu')}
              aria-expanded={isMenuOpen}
              aria-controls="nav-mobile"
              onClick={() => {
                setIsMenuOpen((open) => !open)
              }}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span className="font-bold text-brand-900">
              Cifuentes <span className="text-sm font-semibold text-brand-500">{t('appTag')}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LocaleSwitchFromUrl pathname={pathname} />
            <Badge tone="info">{t('session.owner')}</Badge>
          </div>
        </div>
      </header>

      {isMenuOpen ? (
        <nav
          id="nav-mobile"
          aria-label={t('a11y.sidebarSections')}
          className="border-b border-border bg-surface md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">{sections}</div>
        </nav>
      ) : null}

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block" aria-label={t('a11y.sidebarSections')}>
          <nav className="flex flex-col gap-1">{sections}</nav>
          <p className="mt-4 border-t border-border pt-4">
            <Link href="/" className={`text-sm font-semibold text-brand-700 ${FOCUS}`}>
              {t('nav.viewSite')}
            </Link>
          </p>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          {breadcrumbs.length > 0 ? (
            <p className="mb-3 flex flex-wrap items-center gap-1 text-sm text-ink-muted">
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.key}-${String(index)}`} className="flex items-center gap-1">
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  {crumb.href === null ? (
                    t(crumb.key)
                  ) : (
                    <Link href={crumb.href} className={`text-brand-700 ${FOCUS}`}>
                      {t(crumb.key)}
                    </Link>
                  )}
                </span>
              ))}
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}
