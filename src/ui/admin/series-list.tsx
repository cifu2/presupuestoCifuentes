'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Locale } from '@/domain/catalog/locale'

import { Link } from '@/i18n/navigation'
import {
  formatMeasurementPair,
  formatVersionNumber,
  sortSeries,
  statusLabelKey,
  type SortDirection,
  type SeriesSortKey,
} from './panel-navigation'
import { Badge, buttonClass, EmptyState, PageHeader, type BadgeTone } from './panel-primitives'
import { PanelError, PanelForbidden, PanelLoading } from './panel-states'
import type { AdminPanelState, SeriesSummary } from './view-models'

const STATUS_TONES: Readonly<Record<SeriesSummary['status'], BadgeTone>> = {
  draft: 'neutral',
  published: 'success',
  archived: 'warning',
}

const COLUMNS = [
  { key: 'status', labelKey: 'series.col.status' },
  { key: 'name', labelKey: 'series.col.name' },
  { key: 'max', labelKey: 'series.col.max' },
  { key: 'finishes', labelKey: 'series.col.finishes' },
  { key: 'tariff', labelKey: 'series.col.tariff' },
] as const satisfies readonly { readonly key: SeriesSortKey; readonly labelKey: string }[]

/**
 * Lista de series (`prototipos-y-flujos` §10): tabla ordenable en escritorio y tarjetas con
 * etiqueta por celda en móvil (el CSS de `admin.css` usa `data-label`).
 */
export function SeriesList({
  state,
  series,
}: {
  state: AdminPanelState
  series: readonly SeriesSummary[]
}) {
  const t = useTranslations('CatalogAdmin')
  const locale = useLocale() as Locale
  const [sort, setSort] = useState<{ key: SeriesSortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'ascending',
  })

  const toggleSort = (key: SeriesSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: 'ascending' },
    )
  }

  const header = (
    <PageHeader title={t('series.title')}>
      <button type="button" className={buttonClass('primary')} disabled>
        {t('newSeries')}
      </button>
    </PageHeader>
  )

  if (state === 'loading') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PanelLoading />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PanelError />
      </div>
    )
  }

  if (state === 'forbidden') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PanelForbidden />
      </div>
    )
  }

  if (state === 'empty' || series.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState icon="🚪" title={t('seriesEmpty')} help={t('seriesEmptyHelp')}>
          <button type="button" className={buttonClass('primary')} disabled>
            {t('newSeries')}
          </button>
        </EmptyState>
      </div>
    )
  }

  const rows = sortSeries(series, sort.key, sort.direction)

  return (
    <div className="flex flex-col gap-6">
      {header}
      <p className="text-sm text-ink-muted">{t('series.caption')}</p>
      <div className="overflow-x-auto">
        <table className="admin-table w-full border-collapse text-left text-sm">
          <caption className="sr-only">{t('series.title')}</caption>
          <thead>
            <tr className="text-brand-700">
              {COLUMNS.map(({ key, labelKey }) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={sort.key === key ? sort.direction : 'none'}
                  className="border-b border-border px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    aria-label={t('a11y.sortBy', { column: t(labelKey) })}
                    className="inline-flex min-h-11 items-center gap-1 rounded-control font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                  >
                    {t(labelKey)}
                    <span aria-hidden="true">
                      {sort.key === key ? (sort.direction === 'ascending' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="border-b border-border px-3 py-2">
                <span className="sr-only">{t('series.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((series) => (
              <tr key={series.id} className="border-b border-border">
                <td data-label={t('series.col.status')} className="px-3 py-3">
                  <Badge tone={STATUS_TONES[series.status]}>
                    {t(statusLabelKey(series.status))}
                  </Badge>
                </td>
                <td
                  data-label={t('series.col.name')}
                  className="px-3 py-3 font-semibold text-brand-900"
                >
                  {series.name}
                  {series.missingLocales.length > 0 ? (
                    <>
                      {' '}
                      <Badge tone="danger">{t('missingTranslation')}</Badge>
                    </>
                  ) : null}
                </td>
                <td data-label={t('series.col.max')} className="px-3 py-3 tabular-nums">
                  {formatMeasurementPair(series.limits, locale)}
                </td>
                <td data-label={t('series.col.finishes')} className="px-3 py-3 tabular-nums">
                  {series.finishCount}
                </td>
                <td data-label={t('series.col.tariff')} className="px-3 py-3 tabular-nums">
                  {series.tariffVersionNumber === null ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">{t('tariffsEmpty')}</span>
                    </>
                  ) : (
                    formatVersionNumber(series.tariffVersionNumber)
                  )}
                </td>
                <td data-label={t('series.col.actions')} className="px-3 py-3">
                  <Link
                    href={`/admin/series/${series.slug}`}
                    className={buttonClass('ghost')}
                    aria-label={t('a11y.editSeries', { name: series.name })}
                  >
                    {t('series.edit')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
