'use client'

import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'

import {
  adminApiErrorMessageKey,
  publishTariffVersionRequest,
  sendAdminApi,
  updateTariffPriceRequest,
  type AdminApiRequest,
  type AdminApiResult,
} from './admin-api-client'
import { Alert, buttonClass, Card, HelpText } from './panel-primitives'
import {
  diffPriceQuickEdit,
  isEmptyPriceTable,
  priceEditLockReason,
  toPriceQuickEditForm,
  type PriceQuickEditField,
  type PriceQuickEditForm,
  type PriceTableView,
} from './price-quick-edit-model'
import type { TariffVersionSummary } from './view-models'

export type PriceQuickEditWrite = (
  request: AdminApiRequest,
) => Promise<AdminApiResult<PriceTableView>>

const defaultWrite: PriceQuickEditWrite = (request) => sendAdminApi<PriceTableView>(fetch, request)

/**
 * Edición rápida de la tarifa de una versión en borrador (CIF-243, ADR-0023 §7).
 *
 * El propietario ve los dos importes del precio base y guarda; solo viaja lo que ha cambiado. Si la
 * versión está publicada o archivada el formulario queda cerrado y lo explica con el mismo mensaje
 * que devuelve el API (`TARIFF_NOT_EDITABLE`), para que la UI y el borde no cuenten dos historias.
 *
 * El aviso de tabla vacía se pinta **antes** del clic de publicar, con el texto de
 * `EMPTY_PRICE_TABLE`: el dominio responde 409 y la UI no debe esperar al error para decirlo.
 */
export function PriceQuickEdit({
  version,
  initialTable,
  write = defaultWrite,
}: {
  version: TariffVersionSummary
  initialTable: PriceTableView | null
  write?: PriceQuickEditWrite
}) {
  const t = useTranslations('CatalogAdmin')
  const domainErrors = useTranslations('DomainErrors')
  const [initial, setInitial] = useState<PriceQuickEditForm>(() =>
    toPriceQuickEditForm(initialTable),
  )
  const [form, setForm] = useState<PriceQuickEditForm>(() => toPriceQuickEditForm(initialTable))
  const [invalidField, setInvalidField] = useState<PriceQuickEditField | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  const locked = priceEditLockReason(version.status)
  const emptyTable = isEmptyPriceTable(initialTable)
  const fieldId = (field: PriceQuickEditField) => `tariff-price-${version.id}-${field}`
  // El `title` se resuelve fuera del JSX: la guarda del panel (M2 de CIF-101) prohíbe literales de
  // texto en los atributos, y un ternario con el código entre comillas dentro de la etiqueta se lee
  // como literal aunque venga de `t(…)`.
  const publishTitle = emptyTable ? domainErrors('EMPTY_PRICE_TABLE') : undefined

  const setField = (field: PriceQuickEditField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setInvalidField(null)
    setSaved(false)
  }

  const applyResult = (result: AdminApiResult<PriceTableView>) => {
    if (!result.ok) {
      setErrorCode(result.code)

      return
    }

    const next = toPriceQuickEditForm(result.data)
    setInitial(next)
    setForm(next)
    setErrorCode(null)
    setSaved(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const diff = diffPriceQuickEdit(initial, form)

    if (!diff.ok) {
      setInvalidField(diff.field)

      return
    }

    if (!diff.changed) {
      return
    }

    setPending(true)
    setSaved(false)
    applyResult(await write(updateTariffPriceRequest(version.id, diff.patch)))
    setPending(false)
  }

  const handlePublish = async () => {
    setPending(true)
    setSaved(false)
    applyResult(await write(publishTariffVersionRequest(version.id)))
    setPending(false)
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-brand-900">{t('editPrice')}</p>

      {locked === null ? null : (
        <Alert tone="info">
          {locked === 'published' ? domainErrors('TARIFF_NOT_EDITABLE') : t('price.archivedLocked')}
        </Alert>
      )}

      {emptyTable && locked === null ? (
        <Alert tone="warning">{domainErrors('EMPTY_PRICE_TABLE')}</Alert>
      ) : null}

      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        {(['perSquareMetre', 'fixedPrice'] as const).map((field) => (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor={fieldId(field)} className="text-sm font-medium text-brand-900">
              {t(`price.${field}`)}
            </label>
            <input
              id={fieldId(field)}
              name={field}
              type="text"
              inputMode="decimal"
              className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
              value={form[field]}
              disabled={locked !== null || pending}
              aria-invalid={invalidField === field}
              aria-describedby={invalidField === field ? `${fieldId(field)}-error` : undefined}
              onChange={(event) => {
                setField(field, event.target.value)
              }}
            />
            {invalidField === field ? (
              <p id={`${fieldId(field)}-error`} className="text-sm text-danger-600" role="alert">
                {t('price.invalidAmount')}
              </p>
            ) : null}
          </div>
        ))}

        <HelpText>{t('price.quickEditHelp')}</HelpText>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className={buttonClass('primary')}
            disabled={locked !== null || pending}
          >
            {t('save')}
          </button>
          <button
            type="button"
            className={buttonClass('secondary')}
            disabled={locked !== null || pending || emptyTable}
            title={publishTitle}
            onClick={() => {
              void handlePublish()
            }}
          >
            {t('publish')}
          </button>
        </div>
      </form>

      {saved ? <Alert tone="success">{t('price.saved')}</Alert> : null}
      {errorCode === null ? null : (
        <Alert tone="danger" role="alert">
          {t(adminApiErrorMessageKey(errorCode))}
        </Alert>
      )}
    </Card>
  )
}
