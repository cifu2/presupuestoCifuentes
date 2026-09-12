'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Locale } from '@/domain/catalog/locale'

import { AdminDialog } from './admin-dialog'
import { WarningIcon } from './panel-icons'
import { formatDay, formatVersionNumber, statusLabelKey } from './panel-navigation'
import { Alert, Badge, buttonClass, Card, type BadgeTone } from './panel-primitives'
import { PanelError, PanelForbidden, PanelLoading } from './panel-states'
import type { AdminPanelState, TariffVersionSummary } from './view-models'

const STATUS_TONES: Readonly<Record<TariffVersionSummary['status'], BadgeTone>> = {
  draft: 'neutral',
  published: 'success',
  archived: 'warning',
}

/**
 * Versiones de tarifa (`prototipos-y-flujos` §10): solo una está vigente por serie y el precio de
 * un presupuesto emitido queda congelado (ADR-0003). El botón `Ver` abre el `Modal`/`Sheet` con el
 * scrim tokenizado (M1 de CIF-101). En la fase 1 no hay escritura: la publicación llega en CIF-243.
 *
 * Honra los cuatro estados por pantalla del DoD §6, como la lista de series y los idiomas: mientras
 * el estado no sea `ready`/`empty` el contenido no se pinta, y `empty` usa el vacío propio de
 * tarifas («Sin tarifas para esta serie.») aunque el lector haya devuelto versiones.
 */
export function TariffVersions({
  state,
  versions,
  captionKey = 'tariffs.caption',
}: {
  state: AdminPanelState
  versions: readonly TariffVersionSummary[]
  captionKey?: 'tariffs.caption' | 'tariffs.allCaption'
}) {
  const t = useTranslations('CatalogAdmin')
  const locale = useLocale() as Locale
  const [openVersionId, setOpenVersionId] = useState<string | null>(null)

  const openVersion = versions.find((version) => version.id === openVersionId) ?? null

  if (state === 'loading' || state === 'error' || state === 'forbidden') {
    return (
      <div className="flex flex-col gap-4">
        {state === 'loading' ? <PanelLoading /> : null}
        {state === 'error' ? <PanelError /> : null}
        {state === 'forbidden' ? <PanelForbidden /> : null}
      </div>
    )
  }

  const isEmpty = state === 'empty' || versions.length === 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{t(captionKey)}</p>
      <Alert tone="warning">
        <span className="flex items-center gap-2">
          <WarningIcon className="size-4 shrink-0" />
          <span>{t('tariffs.frozen')}</span>
        </span>
      </Alert>
      {isEmpty ? (
        <p className="text-sm text-ink-muted">{t('tariffsEmpty')}</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="admin-table w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t(captionKey)}</caption>
            <thead>
              <tr className="text-brand-700">
                <th scope="col" className="border-b border-border px-3 py-2">
                  {t('tariffs.col.series')}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2">
                  {t('tariffs.col.version')}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2">
                  {t('tariffs.col.status')}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2">
                  {t('tariffs.col.from')}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2">
                  <span className="sr-only">{t('series.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-b border-border">
                  <td data-label={t('tariffs.col.series')} className="px-3 py-3">
                    {version.seriesName}
                  </td>
                  <td data-label={t('tariffs.col.version')} className="px-3 py-3 tabular-nums">
                    {formatVersionNumber(version.versionNumber)}
                    {version.status === 'published' ? (
                      <>
                        {' '}
                        <Badge tone="brand">{t('tariffs.current')}</Badge>
                      </>
                    ) : null}
                  </td>
                  <td data-label={t('tariffs.col.status')} className="px-3 py-3">
                    <Badge tone={STATUS_TONES[version.status]}>
                      {t(statusLabelKey(version.status))}
                    </Badge>
                  </td>
                  <td data-label={t('tariffs.col.from')} className="px-3 py-3 tabular-nums">
                    {version.effectiveFrom === null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">{t('status.draft')}</span>
                      </>
                    ) : (
                      formatDay(version.effectiveFrom, locale)
                    )}
                  </td>
                  <td data-label={t('series.col.actions')} className="px-3 py-3">
                    <button
                      type="button"
                      className={buttonClass('ghost')}
                      onClick={() => {
                        setOpenVersionId(version.id)
                      }}
                    >
                      {t('tariffs.view')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AdminDialog
        dialogId="tariff-dialog"
        title={t('tariffs.col.version')}
        isOpen={openVersion !== null}
        onClose={() => {
          setOpenVersionId(null)
        }}
      >
        {openVersion === null ? null : (
          <>
            <p className="text-sm text-brand-900">
              {openVersion.seriesName} · {formatVersionNumber(openVersion.versionNumber)} ·{' '}
              {t(statusLabelKey(openVersion.status))}
            </p>
            <p className="text-sm text-ink-muted">
              {t('tariffs.col.from')}:{' '}
              {openVersion.effectiveFrom === null
                ? t('status.draft')
                : formatDay(openVersion.effectiveFrom, locale)}{' '}
              · {t('tariffs.col.prices')}: {openVersion.priceCount}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className={buttonClass('secondary')}
                onClick={() => {
                  setOpenVersionId(null)
                }}
              >
                {t('confirm.cancel')}
              </button>
            </div>
          </>
        )}
      </AdminDialog>
    </div>
  )
}
