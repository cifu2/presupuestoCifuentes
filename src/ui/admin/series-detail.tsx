'use client'

import { useLocale, useTranslations } from 'next-intl'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import { Link } from '@/i18n/navigation'
import {
  FINISH_LABEL_KEYS,
  SERIES_TAB_ITEMS,
  formatMillimetres,
  statusLabelKey,
} from './panel-navigation'
import {
  Alert,
  Badge,
  buttonClass,
  Card,
  HelpText,
  PageHeader,
  type BadgeTone,
} from './panel-primitives'
import { TariffVersions } from './tariff-versions'
import type { SeriesDetail, SeriesTab, TariffVersionSummary } from './view-models'

const STATUS_TONES: Readonly<Record<SeriesDetail['status'], BadgeTone>> = {
  draft: 'neutral',
  published: 'success',
  archived: 'warning',
}

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-brand-900">{value}</dd>
    </div>
  )
}

/**
 * Detalle de serie (`prototipos-y-flujos` §10): pestañas General / Medidas / Acabados / Tarifas /
 * ES|EN. Las pestañas son enlaces reales (`?tab=`), así que cada una es compartible y rastreable.
 * Son navegación, no un patrón `tabs` (no hay flechas ni *roving tabindex*): el enlace activo se
 * marca con `aria-current="page"` y el contenedor lleva `CatalogAdmin.a11y.tabs` como nombre
 * accesible (M2 de CIF-101; D5 de CIF-361).
 */
export function SeriesDetailView({
  detail,
  tab,
  tariffVersions,
}: {
  detail: SeriesDetail
  tab: SeriesTab
  tariffVersions: readonly TariffVersionSummary[]
}) {
  const t = useTranslations('CatalogAdmin')
  const locale = useLocale() as Locale
  const name = detail.names[locale] ?? detail.names[DEFAULT_LOCALE]
  // Fase 1 (presentación): la escritura llega en CIF-243 y los botones lo dicen con `title` + pista
  // visible en vez de quedarse muertos (D4 de CIF-361, mismo remedio que CIF-296).
  const phaseOneHint = t('newSeriesHint')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={name}>
        <Badge tone={STATUS_TONES[detail.status]}>{t(statusLabelKey(detail.status))}</Badge>
      </PageHeader>

      <nav aria-label={t('a11y.tabs')} className="flex flex-wrap gap-2 border-b border-border">
        {SERIES_TAB_ITEMS.map((item) => {
          const isActive = item.tab === tab

          return (
            <Link
              key={item.tab}
              href={`/admin/series/${detail.slug}?tab=${item.tab}`}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-t-control px-3 text-sm font-semibold ${
                isActive ? 'bg-brand-100 text-brand-800' : 'text-brand-700 hover:bg-surface-sunken'
              } ${FOCUS}`}
            >
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>

      <section className="rounded-card border border-border bg-surface p-4 sm:p-6">
        {tab === 'general' ? (
          <div className="flex flex-col gap-4">
            <Alert tone="info">{t('detail.draftNotice')}</Alert>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label={t('detail.nameEs')} value={detail.names.es} />
              <Field label={t('detail.nameEn')} value={detail.names.en} />
              <Field
                label={t('detail.translated')}
                value={
                  detail.translatedLocales.length === SUPPORTED_LOCALES.length
                    ? t('i18n.complete')
                    : t('missingTranslation')
                }
              />
              <Field label={t('detail.status')} value={t(statusLabelKey(detail.status))} />
              <Field label={t('detail.slug')} value={detail.slug} />
            </dl>
            <HelpText>{t('detail.slugHelp')}</HelpText>
          </div>
        ) : null}

        {tab === 'measures' ? (
          <div className="flex flex-col gap-4">
            <HelpText>{t('measures.help')}</HelpText>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('measures.minWidth')}
                value={formatMillimetres(detail.limits.minWidthMm, locale)}
              />
              <Field
                label={t('measures.maxWidth')}
                value={formatMillimetres(detail.limits.maxWidthMm, locale)}
              />
              <Field
                label={t('measures.minHeight')}
                value={formatMillimetres(detail.limits.minHeightMm, locale)}
              />
              <Field
                label={t('measures.maxHeight')}
                value={formatMillimetres(detail.limits.maxHeightMm, locale)}
              />
            </dl>
          </div>
        ) : null}

        {tab === 'finishes' ? (
          <div className="flex flex-col gap-4">
            <HelpText>{t('finishes.help')}</HelpText>
            <ul className="flex flex-wrap gap-2">
              {FINISH_LABEL_KEYS.slice(0, detail.finishCount).map((key) => (
                <li
                  key={key}
                  className="rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-800"
                >
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === 'tariffs' ? <TariffVersions state="ready" versions={tariffVersions} /> : null}

        {tab === 'translations' ? (
          <div className="flex flex-col gap-4">
            <HelpText>{t('i18n.help')}</HelpText>
            <ul className="flex flex-col gap-2">
              {SUPPORTED_LOCALES.map((candidate) => (
                <li key={candidate} className="flex items-center justify-between gap-3">
                  <span className="text-brand-900">{t(`i18n.${candidate}`)}</span>
                  {detail.translatedLocales.includes(candidate) ? (
                    <Badge tone="success">{t('i18n.complete')}</Badge>
                  ) : (
                    <Badge tone="danger">{t('missingTranslation')}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass('secondary')} disabled title={phaseOneHint}>
            {t('saveDraft')}
          </button>
          <button type="button" className={buttonClass('primary')} disabled title={phaseOneHint}>
            {t('publish')}
          </button>
        </div>
        <HelpText>{phaseOneHint}</HelpText>
      </Card>
    </div>
  )
}
