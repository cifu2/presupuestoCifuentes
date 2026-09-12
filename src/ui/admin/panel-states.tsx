'use client'

import { useTranslations } from 'next-intl'

import { Alert, buttonClass, Card, EmptyState, TableSkeleton } from './panel-primitives'

/**
 * Estados obligatorios del panel (DoD §6 / `prototipos-y-flujos` §10): carga, vacío, error y sin
 * permiso. Son presentación pura: no piden datos, solo los pintan.
 */

export function PanelLoading() {
  const t = useTranslations('CatalogAdmin')

  return (
    <div className="flex flex-col gap-3">
      <TableSkeleton label={t('loading')} />
      <p className="text-sm text-ink-muted">{t('loading')}</p>
    </div>
  )
}

export function PanelError() {
  const t = useTranslations('CatalogAdmin')

  return (
    <Card className="flex flex-col items-start gap-4">
      <div className="w-full">
        <Alert tone="danger" role="alert">
          {t('error.title')}
        </Alert>
      </div>
      <button
        type="button"
        className={buttonClass('secondary')}
        onClick={() => {
          // Reintentar = volver a pedir la página; la fase 2 podrá recargar solo la sección.
          window.location.reload()
        }}
      >
        {t('error.retry')}
      </button>
    </Card>
  )
}

export function PanelForbidden() {
  const t = useTranslations('CatalogAdmin')

  return (
    <div role="alert">
      <EmptyState icon="🔒" title={t('sectionForbidden')} help={t('forbidden.help')} />
    </div>
  )
}
