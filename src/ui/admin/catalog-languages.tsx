'use client'

import { useTranslations } from 'next-intl'

import { Badge, Card, HelpText, PageHeader } from './panel-primitives'
import { PanelError, PanelForbidden, PanelLoading } from './panel-states'
import type { AdminPanelState, CatalogLanguageSummary } from './view-models'

/**
 * Idiomas del catálogo (`prototipos-y-flujos` §10): una serie no se publica en un idioma hasta que
 * su nombre y su descripción están traducidos (ADR-0005).
 */
export function CatalogLanguages({
  state,
  languages,
}: {
  state: AdminPanelState
  languages: readonly CatalogLanguageSummary[]
}) {
  const t = useTranslations('CatalogAdmin')

  const header = <PageHeader title={t('languages.title')} />

  if (state === 'loading' || state === 'error' || state === 'forbidden') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {state === 'loading' ? <PanelLoading /> : null}
        {state === 'error' ? <PanelError /> : null}
        {state === 'forbidden' ? <PanelForbidden /> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <HelpText>{t('i18n.help')}</HelpText>
      <Card className="flex flex-col gap-3">
        {languages.map((language) => (
          <div
            key={language.code}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0"
          >
            <span className="font-semibold text-brand-900">{t(`i18n.${language.code}`)}</span>
            <span className="flex items-center gap-2">
              {language.isActive ? <Badge tone="info">{t('languages.active')}</Badge> : null}
              {language.missingSeries === 0 ? (
                <Badge tone="success">{t('i18n.complete')}</Badge>
              ) : (
                <Badge tone="danger">{t('missingTranslation')}</Badge>
              )}
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
