'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { CatalogSeriesSummary } from '@/application/use-cases/get-published-series'
import type { CatalogSeriesDetail } from '@/application/use-cases/get-series-detail'
import type { Locale } from '@/domain/catalog/locale'
import { QUOTE_EXTRAS, type QuoteExtra } from '@/domain/pricing/quote-configuration'
import { DoorPreview } from '@/ui/preview-2d/door-preview'
import { TIPOS_2D_MVP, buildPreviewGeometry } from '@/ui/preview-2d/model'

import {
  manualQuoteCreatedSchema,
  parseResponse,
  parseWrappedData,
  priceResultSchema,
  quoteIssuedSchema,
  readApiErrorCode,
  seriesDetailSchema,
  type ManualQuoteCreatedDto,
  type PriceBreakdownDto,
  type PriceResultDto,
  type QuoteIssuedDto,
} from './api-contract'
import { formatDate, formatMoney, formatNumber } from './format'
import {
  HINGE_MESSAGE_KEYS,
  HINGE_SIDES,
  PLANKINGS,
  PLANKING_MESSAGE_KEYS,
  TYPE_MESSAGE_KEYS,
  assessSelectionSize,
  buildConfigurationRequestBody,
  buildManualQuoteRequestBody,
  clearDraft,
  colorsForFinish,
  defaultSelection,
  findSeries,
  finishKindForCode,
  firstColorId,
  isMvpDoorType,
  isPlanking,
  parseMeasurementInput,
  readDraft,
  reconcileSelection,
  saveDraft,
  validateContact,
  type ConfiguratorContact,
  type ConfiguratorSelection,
} from './selection'

/** Espera entre el último cambio y la llamada al precio: evita una petición por pulsación. */
const PRICE_DEBOUNCE_MS = 250

const PRICE_ERROR_KEYS: Record<string, string> = {
  NETWORK_ERROR: 'network',
  INVALID_RESPONSE: 'invalid',
  NOT_FOUND: 'notFound',
  VALIDATION_ERROR: 'validation',
  INVALID_MEASUREMENT: 'validation',
}

const EMPTY_CONTACT: ConfiguratorContact = { name: '', email: '', phone: null, message: null }

interface ApiFailure {
  readonly ok: false
  readonly code: string
}

type ApiResult<T> = { readonly ok: true; readonly data: T } | ApiFailure

async function requestJson<T>(
  url: string,
  init: RequestInit,
  parse: (payload: unknown) => T | null,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, init)
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      return { ok: false, code: readApiErrorCode(payload) }
    }

    const data = parse(payload)

    return data === null ? { ok: false, code: 'INVALID_RESPONSE' } : { ok: true, data }
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' }
  }
}

type PriceState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'priced'; readonly result: Extract<PriceResultDto, { status: 'priced' }> }
  | {
      readonly status: 'manual'
      readonly result: Extract<PriceResultDto, { status: 'manual_quote_required' }>
    }
  | { readonly status: 'error'; readonly code: string }

type QuoteState =
  | { readonly status: 'idle' }
  | { readonly status: 'sending' }
  | { readonly status: 'issued'; readonly result: QuoteIssuedDto }
  | { readonly status: 'manual_created'; readonly result: ManualQuoteCreatedDto }
  | { readonly status: 'error'; readonly code: string }

export interface ConfiguratorAppProps {
  readonly locale: Locale
  readonly series: readonly CatalogSeriesSummary[]
  readonly initialDetail: CatalogSeriesDetail | null
}

/**
 * Configurador público (CIF-7).
 *
 * Todo el catálogo (series, acabados, colores, accesorios) y todo precio vienen de la API; la vista
 * solo orquesta estado y dibuja. El precio lo decide siempre el servidor: aquí solo se anticipa la
 * validación de medidas para dar un error inmediato.
 *
 * El borrador guarda únicamente la configuración, nunca datos de contacto (minimización, RGPD).
 */
export function ConfiguratorApp({ locale, series, initialDetail }: ConfiguratorAppProps) {
  const t = useTranslations('Configurator')
  const firstSeries = series[0]

  if (firstSeries === undefined) {
    return (
      <p
        data-testid="catalog-empty"
        className="rounded-lg border border-brand-500/20 bg-white px-4 py-3 text-brand-700"
      >
        {t('catalog.empty')}
      </p>
    )
  }

  return (
    <ConfiguratorPanel
      locale={locale}
      firstSeries={firstSeries}
      series={series}
      initialDetail={initialDetail}
    />
  )
}

interface ConfiguratorPanelProps {
  readonly locale: Locale
  readonly firstSeries: CatalogSeriesSummary
  readonly series: readonly CatalogSeriesSummary[]
  readonly initialDetail: CatalogSeriesDetail | null
}

function ConfiguratorPanel({ locale, firstSeries, series, initialDetail }: ConfiguratorPanelProps) {
  const t = useTranslations('Configurator')
  const tPreview = useTranslations('Preview2D')

  const usableInitialDetail =
    initialDetail !== null && initialDetail.series.slug === firstSeries.slug ? initialDetail : null

  const [rawSelection, setRawSelection] = useState<ConfiguratorSelection>(() =>
    defaultSelection(firstSeries, usableInitialDetail),
  )
  const [widthText, setWidthText] = useState(() => String(rawSelection.widthMm))
  const [heightText, setHeightText] = useState(() => String(rawSelection.heightMm))
  const [details, setDetails] = useState<Record<string, CatalogSeriesDetail>>(() =>
    usableInitialDetail === null ? {} : { [usableInitialDetail.series.slug]: usableInitialDetail },
  )
  const [detailFailed, setDetailFailed] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [contact, setContact] = useState<ConfiguratorContact>(EMPTY_CONTACT)
  const [contactErrors, setContactErrors] = useState<ReturnType<typeof validateContact>>({})
  const [contactKey, setContactKey] = useState<string | null>(null)
  const [storedPrice, setPrice] = useState<PriceState>({ status: 'idle' })
  const [quoteEntry, setQuoteEntry] = useState<{ key: string; state: QuoteState }>({
    key: '',
    state: { status: 'idle' },
  })
  const draftReady = useRef(false)
  const requestedSlugs = useRef(
    new Set<string>(usableInitialDetail === null ? [] : [usableInitialDetail.series.slug]),
  )

  const activeSeries = findSeries(series, rawSelection.seriesSlug) ?? firstSeries
  const detail = details[activeSeries.slug] ?? null

  /**
   * La configuración efectiva se **deriva** del catálogo publicado: si un acabado, color o accesorio
   * del borrador ya no existe, desaparece sin necesidad de sincronizar estado en un efecto.
   */
  const selection = useMemo(
    () => (detail === null ? rawSelection : reconcileSelection(rawSelection, activeSeries, detail)),
    [activeSeries, detail, rawSelection],
  )

  const applySelection = useCallback((next: ConfiguratorSelection) => {
    setRawSelection(next)
    setWidthText(String(next.widthMm))
    setHeightText(String(next.heightMm))
  }, [])

  // Ficha de la serie desde la API pública: acabados, colores y accesorios publicados.
  useEffect(() => {
    const slug = activeSeries.slug

    if (requestedSlugs.current.has(slug)) {
      return
    }

    requestedSlugs.current.add(slug)
    const controller = new AbortController()

    void requestJson(
      `/api/catalog/series/${encodeURIComponent(slug)}?locale=${locale}`,
      { signal: controller.signal },
      (payload) => parseWrappedData(seriesDetailSchema, payload),
    ).then((result) => {
      if (controller.signal.aborted) {
        return
      }

      if (!result.ok) {
        setDetailFailed(true)
        return
      }

      setDetails((previous) => ({ ...previous, [slug]: result.data }))
      setDetailFailed(false)
    })

    return () => controller.abort()
  }, [activeSeries.slug, locale])

  // Borrador recuperable: se lee al montar (nunca en el servidor) y se guarda en cada cambio.
  useEffect(() => {
    let cancelled = false

    // La lectura de `localStorage` es una operación externa al render: se aplica cuando termina.
    void Promise.resolve().then(() => {
      if (cancelled) {
        return
      }

      const restored = readDraft(window.localStorage, locale)
      const target = restored === null ? null : findSeries(series, restored.seriesSlug)

      if (restored !== null && target !== null) {
        applySelection(reconcileSelection(restored, target, details[restored.seriesSlug] ?? null))
        setDraftRestored(true)
      }

      // Hasta aquí no se escribe: guardar antes de leer machacaría el borrador del cliente.
      draftReady.current = true
    })

    return () => {
      cancelled = true
    }
    // Solo al montar: después manda lo que el cliente elige.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!draftReady.current) {
      return
    }

    saveDraft(window.localStorage, locale, selection)
  }, [locale, selection])

  const priceRequestBody = useMemo(
    () => buildConfigurationRequestBody(selection, locale),
    [locale, selection],
  )
  const priceKey = JSON.stringify(priceRequestBody)

  const widthParsed = parseMeasurementInput(widthText)
  const heightParsed = parseMeasurementInput(heightText)
  const measurementsValid = widthParsed.ok && heightParsed.ok

  const price: PriceState = measurementsValid ? storedPrice : { status: 'idle' }
  // Un presupuesto emitido deja de valer en cuanto cambia la configuración que representaba.
  const quote: QuoteState = quoteEntry.key === priceKey ? quoteEntry.state : { status: 'idle' }
  const setQuote = (state: QuoteState) => setQuoteEntry({ key: priceKey, state })
  const showContact = price.status === 'priced' && contactKey === priceKey

  const sizeAssessment = useMemo(
    () => assessSelectionSize(selection, activeSeries.sizeRange),
    [activeSeries.sizeRange, selection],
  )
  const outOfRange = sizeAssessment?.status === 'out_of_range'
  const requiresManualQuote = outOfRange && sizeAssessment.requiresManualQuote

  // Precio en vivo: el servidor decide; el cliente solo debounce-a y cancela lo obsoleto.
  useEffect(() => {
    if (!measurementsValid) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPrice({ status: 'loading' })

      void requestJson<PriceResultDto>(
        '/api/quotes/price',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: priceKey,
          signal: controller.signal,
        },
        (payload) => parseResponse(priceResultSchema, payload),
      ).then((result) => {
        if (controller.signal.aborted) {
          return
        }

        if (!result.ok) {
          setPrice({ status: 'error', code: result.code })
          return
        }

        setPrice(
          result.data.status === 'priced'
            ? { status: 'priced', result: result.data }
            : { status: 'manual', result: result.data },
        )
      })
    }, PRICE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [measurementsValid, priceKey])

  const update = useCallback((patch: Partial<ConfiguratorSelection>) => {
    setRawSelection((previous) => ({ ...previous, ...patch }))
  }, [])

  const handleSeriesChange = (slug: string) => {
    const target = findSeries(series, slug)

    if (target !== null) {
      applySelection(defaultSelection(target, details[slug] ?? null))
    }
  }

  const handleMeasurementChange = (field: 'width' | 'height', raw: string) => {
    if (field === 'width') {
      setWidthText(raw)
    } else {
      setHeightText(raw)
    }

    const parsed = parseMeasurementInput(raw)

    if (parsed.ok) {
      update(field === 'width' ? { widthMm: parsed.value } : { heightMm: parsed.value })
    }
  }

  const handleFinishChange = (finishId: string) => {
    update({ finishId, colorId: firstColorId(detail, finishId) })
  }

  const toggleAccessory = (accessoryId: string) => {
    setRawSelection((previous) => ({
      ...previous,
      accessoryIds: previous.accessoryIds.includes(accessoryId)
        ? previous.accessoryIds.filter((id) => id !== accessoryId)
        : [...previous.accessoryIds, accessoryId],
    }))
  }

  const toggleExtra = (extra: QuoteExtra) => {
    setRawSelection((previous) => ({
      ...previous,
      extras: previous.extras.includes(extra)
        ? previous.extras.filter((value) => value !== extra)
        : [...previous.extras, extra],
    }))
  }

  const discardDraft = () => {
    clearDraft(window.localStorage, locale)
    applySelection(defaultSelection(activeSeries, detail))
    setDraftRestored(false)
  }

  const submitContact = async (target: 'quote' | 'manual') => {
    const errors = validateContact(contact)
    setContactErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    setQuote({ status: 'sending' })

    if (target === 'manual') {
      const result = await requestJson<
        ManualQuoteCreatedDto | Extract<PriceResultDto, { status: 'priced' }>
      >(
        '/api/manual-quote-requests',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildManualQuoteRequestBody(selection, contact, locale)),
        },
        (payload) => {
          const created = parseResponse(manualQuoteCreatedSchema, payload)

          if (created !== null) {
            return created
          }

          const priced = parseResponse(priceResultSchema, payload)

          return priced !== null && priced.status === 'priced' ? priced : null
        },
      )

      if (!result.ok) {
        setQuote({ status: 'error', code: result.code })
        return
      }

      if ('status' in result.data && result.data.status === 'priced') {
        setPrice({ status: 'priced', result: result.data })
        setQuote({ status: 'idle' })
        return
      }

      if ('request' in result.data) {
        setQuote({ status: 'manual_created', result: result.data })
        clearDraft(window.localStorage, locale)
      }

      return
    }

    const result = await requestJson<
      QuoteIssuedDto | Extract<PriceResultDto, { status: 'manual_quote_required' }>
    >(
      '/api/quotes',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: priceKey,
      },
      (payload) => {
        const issued = parseResponse(quoteIssuedSchema, payload)

        if (issued !== null) {
          return issued
        }

        const manual = parseResponse(priceResultSchema, payload)

        return manual !== null && manual.status === 'manual_quote_required' ? manual : null
      },
    )

    if (!result.ok) {
      setQuote({ status: 'error', code: result.code })
      return
    }

    if ('status' in result.data && result.data.status === 'manual_quote_required') {
      setPrice({ status: 'manual', result: result.data })
      setQuote({ status: 'idle' })
      return
    }

    if ('quote' in result.data) {
      setQuote({ status: 'issued', result: result.data })
      clearDraft(window.localStorage, locale)
    }
  }

  const accessories = detail?.accessories ?? []
  const colors = colorsForFinish(detail, selection.finishId)
  const finishes = detail?.finishes ?? []
  const selectedFinish = finishes.find((finish) => finish.id === selection.finishId) ?? null
  const selectedColor = colors.find((color) => color.id === selection.colorId) ?? null

  const geometry = buildPreviewGeometry({
    type: selection.doorType,
    widthMm: selection.widthMm,
    heightMm: selection.heightMm,
    hingeSide: selection.hingeSide,
    glazing: 'ninguno',
    ventilation: 'ninguno',
    finishKind: selectedFinish === null ? 'sin-acabado' : finishKindForCode(selectedFinish.code),
    colorCode: selectedColor?.code ?? '',
    colorHex: selectedColor?.hex ?? null,
    withinSeriesRange: !outOfRange,
    planking: selection.planking,
    aperturas: selection.glazing
      ? [
          { x: 0.4, y: 0.08, w: 0.2, h: 0.18, forma: 'rect' },
          { x: 0.4, y: 0.42, w: 0.2, h: 0.18, forma: 'rect' },
        ]
      : [],
    moulding: selection.moulding,
    twoToneFrame: selection.twoToneFrame,
    secondColorHex: selection.twoToneFrame ? '#9AA2A9' : null,
  })

  const previewLabel = tPreview('regionDetail', {
    type: tPreview(`types.${TYPE_MESSAGE_KEYS[selection.doorType]}`),
    width: selection.widthMm,
    height: selection.heightMm,
    finish: selectedFinish?.name ?? tPreview('finishes.sinAcabado'),
    color: selectedColor?.name ?? tPreview('colors.ninguno'),
  })

  const priceErrorKey =
    price.status === 'error' ? (PRICE_ERROR_KEYS[price.code] ?? 'generic') : null
  const contactOpen = quote.status === 'idle' || quote.status === 'sending'
  const sending = quote.status === 'sending'

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="serie">
        {t('catalog.series')}
        <select
          id="serie"
          name="serie"
          data-testid="configurator-series"
          className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
          value={activeSeries.slug}
          onChange={(event) => handleSeriesChange(event.target.value)}
        >
          {series.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {activeSeries.description === null ? null : (
        <p className="-mt-3 text-sm text-brand-500">{activeSeries.description}</p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-labelledby="vista-previa"
          className="lg:order-2 lg:sticky lg:top-6 lg:self-start"
        >
          <h2 id="vista-previa" className="text-xl font-semibold text-brand-900">
            {tPreview('previewTitle')}
          </h2>
          <div className="mt-3 flex aspect-[3/4] max-h-[30vh] items-center justify-center overflow-hidden rounded-lg bg-[#f7f7f5] lg:max-h-none">
            <DoorPreview
              geometry={geometry}
              className="h-full w-full"
              labels={{ region: previewLabel, colorUndefined: tPreview('colorUndefined') }}
            />
          </div>
          <p
            className="mt-3 text-sm font-medium text-brand-700"
            role="status"
            aria-live="polite"
            data-testid="preview-measurement"
          >
            {tPreview('summary.measurement', {
              width: selection.widthMm,
              height: selection.heightMm,
            })}
          </p>
          <p id="preview-range" className="mt-1 text-sm text-brand-500" data-testid="preview-range">
            {tPreview('summary.range', {
              minWidth: activeSeries.sizeRange.minWidthMm,
              maxWidth: activeSeries.sizeRange.maxWidthMm,
              minHeight: activeSeries.sizeRange.minHeightMm,
              maxHeight: activeSeries.sizeRange.maxHeightMm,
            })}
          </p>
          {outOfRange ? (
            <p
              className="mt-2 rounded-md bg-accent-100 px-3 py-2 text-sm font-medium text-accent-700"
              role="alert"
              data-testid="preview-out-of-range"
            >
              {tPreview('summary.outOfRange')}
            </p>
          ) : null}
        </section>

        <div className="flex flex-col gap-8 lg:order-1">
          {draftRestored ? (
            <div
              role="status"
              data-testid="draft-restored"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-500/20 bg-white px-4 py-3 text-sm text-brand-700"
            >
              <p>{t('draft.restored')}</p>
              <button
                type="button"
                data-testid="discard-draft"
                onClick={discardDraft}
                className="rounded-md border border-brand-500/40 px-3 py-1 font-medium text-brand-700"
              >
                {t('draft.discard')}
              </button>
            </div>
          ) : null}

          <form aria-labelledby="opciones-configurador" className="flex flex-col gap-6">
            <div>
              <h2 id="opciones-configurador" className="text-xl font-semibold text-brand-900">
                {tPreview('panelTitle')}
              </h2>
              <p className="mt-2 text-sm text-brand-700">{t('intro')}</p>
            </div>

            <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="tipo">
              {tPreview('form.type')}
              <select
                id="tipo"
                name="tipo"
                data-testid="preview-type"
                className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                value={selection.doorType}
                onChange={(event) => {
                  const value = event.target.value

                  if (isMvpDoorType(value)) {
                    update({ doorType: value })
                  }
                }}
              >
                {TIPOS_2D_MVP.map((option) => (
                  <option key={option} value={option}>
                    {tPreview(`types.${TYPE_MESSAGE_KEYS[option]}`)}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold text-brand-900">
                {tPreview('form.measurements')}
              </legend>
              <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="ancho">
                {tPreview('form.width')}
                <input
                  id="ancho"
                  name="ancho"
                  data-testid="preview-width"
                  aria-describedby="preview-range"
                  aria-invalid={widthParsed.ok ? undefined : true}
                  className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10_000}
                  step={10}
                  value={widthText}
                  onChange={(event) => handleMeasurementChange('width', event.target.value)}
                />
              </label>
              {widthParsed.ok ? null : (
                <p role="alert" data-testid="width-error" className="text-sm text-accent-700">
                  {t(`measurements.errors.${widthParsed.error}`)}
                </p>
              )}
              <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="alto">
                {tPreview('form.height')}
                <input
                  id="alto"
                  name="alto"
                  data-testid="preview-height"
                  aria-describedby="preview-range"
                  aria-invalid={heightParsed.ok ? undefined : true}
                  className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10_000}
                  step={10}
                  value={heightText}
                  onChange={(event) => handleMeasurementChange('height', event.target.value)}
                />
              </label>
              {heightParsed.ok ? null : (
                <p role="alert" data-testid="height-error" className="text-sm text-accent-700">
                  {t(`measurements.errors.${heightParsed.error}`)}
                </p>
              )}
              {requiresManualQuote ? (
                <p className="text-sm text-brand-700" data-testid="manual-size-notice">
                  {t('measurements.manualNotice')}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold text-brand-900">
                {tPreview('form.finish')}
              </legend>
              <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="acabado">
                {tPreview('form.finishKind')}
                <select
                  id="acabado"
                  name="acabado"
                  data-testid="preview-finish"
                  className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                  value={selection.finishId ?? ''}
                  disabled={finishes.length === 0}
                  onChange={(event) => handleFinishChange(event.target.value)}
                >
                  {finishes.length === 0 ? (
                    <option value="">{t('catalog.noFinishes')}</option>
                  ) : null}
                  {finishes.map((finish) => (
                    <option key={finish.id} value={finish.id}>
                      {finish.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="color">
                {tPreview('form.color')}
                <select
                  id="color"
                  name="color"
                  data-testid="preview-color"
                  className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                  value={selection.colorId ?? ''}
                  disabled={colors.length === 0}
                  onChange={(event) =>
                    update({ colorId: event.target.value === '' ? null : event.target.value })
                  }
                >
                  <option value="">{tPreview('colors.ninguno')}</option>
                  {colors.map((color) => (
                    <option key={color.id} value={color.id}>
                      {color.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-brand-900">
                {tPreview('form.hingeSide')}
              </legend>
              <div className="flex gap-4">
                {HINGE_SIDES.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-brand-700">
                    <input
                      type="radio"
                      name="mano"
                      value={option}
                      data-testid={`preview-hinge-side-${option}`}
                      checked={selection.hingeSide === option}
                      onChange={() => update({ hingeSide: option })}
                    />
                    {tPreview(`hingeSides.${HINGE_MESSAGE_KEYS[option]}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-brand-900">
                {t('accessories.title')}
              </legend>
              {accessories.length === 0 ? (
                <p className="text-sm text-brand-500" data-testid="accessories-empty">
                  {t('accessories.empty')}
                </p>
              ) : (
                accessories.map((accessory) => (
                  <label
                    key={accessory.id}
                    className="flex items-center gap-2 text-sm text-brand-700"
                  >
                    <input
                      type="checkbox"
                      name="accesorio"
                      data-testid={`accessory-${accessory.id}`}
                      checked={selection.accessoryIds.includes(accessory.id)}
                      onChange={() => toggleAccessory(accessory.id)}
                    />
                    {accessory.name}
                  </label>
                ))
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-brand-900">{t('extras.title')}</legend>
              {QUOTE_EXTRAS.map((extra) => (
                <label key={extra} className="flex items-center gap-2 text-sm text-brand-700">
                  <input
                    type="checkbox"
                    name="extra"
                    data-testid={`extra-${extra}`}
                    checked={selection.extras.includes(extra)}
                    onChange={() => toggleExtra(extra)}
                  />
                  {t(`extras.${extra}`)}
                </label>
              ))}
              <label
                className="mt-2 flex flex-col gap-1 text-sm text-brand-700"
                htmlFor="descuento"
              >
                {t('discount.label')}
                <input
                  id="descuento"
                  name="descuento"
                  data-testid="configurator-discount"
                  className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                  type="text"
                  maxLength={32}
                  placeholder={t('discount.placeholder')}
                  value={selection.discountCode ?? ''}
                  onChange={(event) =>
                    update({ discountCode: event.target.value === '' ? null : event.target.value })
                  }
                />
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-brand-900">
                {tPreview('form.surface')}
              </legend>
              <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="superficie">
                {tPreview('form.planking')}
                <select
                  id="superficie"
                  name="superficie"
                  data-testid="preview-planking"
                  className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                  value={selection.planking ?? 'ninguna'}
                  onChange={(event) => {
                    const value = event.target.value

                    update({
                      planking: value === 'ninguna' ? null : isPlanking(value) ? value : null,
                    })
                  }}
                >
                  {(['ninguna', ...PLANKINGS] as const).map((option) => (
                    <option key={option} value={option}>
                      {tPreview(`plankings.${PLANKING_MESSAGE_KEYS[option]}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-brand-700">
                <input
                  type="checkbox"
                  name="enmarcado"
                  data-testid="preview-moulding"
                  checked={selection.moulding}
                  onChange={(event) => update({ moulding: event.target.checked })}
                />
                {tPreview('form.moulding')}
              </label>
              <label className="flex items-center gap-2 text-sm text-brand-700">
                <input
                  type="checkbox"
                  name="bicolor"
                  data-testid="preview-two-tone-frame"
                  checked={selection.twoToneFrame}
                  onChange={(event) => update({ twoToneFrame: event.target.checked })}
                />
                {tPreview('form.twoToneFrame')}
              </label>
              <label className="flex items-center gap-2 text-sm text-brand-700">
                <input
                  type="checkbox"
                  name="huecos"
                  data-testid="preview-glazing"
                  checked={selection.glazing}
                  onChange={(event) => update({ glazing: event.target.checked })}
                />
                {tPreview('form.glazing')}
              </label>
            </fieldset>
          </form>

          <PricePanel
            locale={locale}
            price={price}
            errorKey={priceErrorKey}
            onRetry={() => setPrice({ status: 'idle' })}
          />

          <section aria-labelledby="presupuesto" className="flex flex-col gap-3">
            <h2 id="presupuesto" className="text-xl font-semibold text-brand-900">
              {quote.status === 'manual_created' ? t('quote.manualCreatedTitle') : t('quote.title')}
            </h2>

            {quote.status === 'issued' ? (
              <div
                role="status"
                data-testid="quote-issued"
                className="flex flex-col gap-2 rounded-lg border border-brand-500/20 bg-white px-4 py-4 text-brand-700"
              >
                <p className="font-medium text-brand-900">{t('quote.issuedTitle')}</p>
                <p>
                  {t('quote.reference')}:{' '}
                  <strong data-testid="quote-reference">{quote.result.quote.reference}</strong>
                </p>
                <p>
                  {t('quote.total')}:{' '}
                  {formatMoney(
                    quote.result.quote.totals.total.amount,
                    quote.result.quote.totals.total.currency,
                    locale,
                  )}
                </p>
                {quote.result.quote.validUntil === null ? null : (
                  <p>
                    {t('quote.validUntil', {
                      date:
                        formatDate(quote.result.quote.validUntil, locale) ??
                        quote.result.quote.validUntil,
                    })}
                  </p>
                )}
                <p>{t('quote.contactPrompt')}</p>
              </div>
            ) : null}

            {quote.status === 'manual_created' ? (
              <div
                role="status"
                data-testid="manual-quote-created"
                className="flex flex-col gap-2 rounded-lg border border-brand-500/20 bg-white px-4 py-4 text-brand-700"
              >
                <p className="font-medium text-brand-900">{t('quote.manualCreatedTitle')}</p>
                <p>{t('quote.manualCreatedBody')}</p>
              </div>
            ) : null}

            {contactOpen && price.status === 'manual' ? (
              <div className="flex flex-col gap-4">
                <p
                  role="alert"
                  data-testid="manual-quote-reason"
                  className="rounded-md bg-accent-100 px-3 py-2 text-sm font-medium text-accent-700"
                >
                  {t('quote.manualReason', { reason: price.result.detail })}
                </p>
                <ContactForm
                  contact={contact}
                  errors={contactErrors}
                  sending={sending}
                  submitLabel={t('quote.manualSubmit')}
                  onChange={setContact}
                  onSubmit={() => void submitContact('manual')}
                />
              </div>
            ) : null}

            {contactOpen && price.status === 'priced' ? (
              showContact ? (
                <ContactForm
                  contact={contact}
                  errors={contactErrors}
                  sending={sending}
                  submitLabel={t('quote.submit')}
                  onChange={setContact}
                  onSubmit={() => void submitContact('quote')}
                />
              ) : (
                <button
                  type="button"
                  data-testid="request-quote"
                  onClick={() => setContactKey(priceKey)}
                  className="self-start rounded-md bg-brand-900 px-4 py-2 font-medium text-white"
                >
                  {t('quote.cta')}
                </button>
              )
            ) : null}

            {quote.status === 'error' ? (
              <p role="alert" data-testid="quote-error" className="text-sm text-accent-700">
                {t(`quote.errors.${PRICE_ERROR_KEYS[quote.code] ?? 'generic'}`)}
              </p>
            ) : null}

            {price.status === 'idle' ? (
              <p className="text-sm text-brand-500" data-testid="quote-unavailable">
                {t('quote.unavailable')}
              </p>
            ) : null}
          </section>

          {detailFailed ? (
            <p role="alert" data-testid="catalog-error" className="text-sm text-accent-700">
              {t('catalog.error')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface PricePanelProps {
  readonly locale: Locale
  readonly price: PriceState
  readonly errorKey: string | null
  readonly onRetry: () => void
}

function PricePanel({ locale, price, errorKey, onRetry }: PricePanelProps) {
  const t = useTranslations('Configurator')
  const tPreview = useTranslations('Preview2D')

  return (
    <section aria-labelledby="precio" className="flex flex-col gap-3">
      <h2 id="precio" className="text-xl font-semibold text-brand-900">
        {t('price.title')}
      </h2>
      <div
        role="status"
        aria-live="polite"
        data-testid="price-status"
        className="rounded-lg border border-brand-500/20 bg-white px-4 py-4"
      >
        {price.status === 'idle' ? (
          <p className="text-sm text-brand-500" data-testid="price-idle">
            {t('price.idle')}
          </p>
        ) : null}

        {price.status === 'loading' ? (
          <p className="text-sm text-brand-500" data-testid="price-loading">
            {t('price.loading')}
          </p>
        ) : null}

        {price.status === 'error' ? (
          <div className="flex flex-col gap-2">
            <p role="alert" data-testid="price-error" className="text-sm text-accent-700">
              {t(`price.errors.${errorKey ?? 'generic'}`)}
            </p>
            <button
              type="button"
              data-testid="price-retry"
              onClick={onRetry}
              className="self-start rounded-md border border-brand-500/40 px-3 py-1 text-sm font-medium text-brand-700"
            >
              {t('price.retry')}
            </button>
          </div>
        ) : null}

        {price.status === 'priced' ? <Breakdown locale={locale} result={price.result} /> : null}

        {price.status === 'manual' ? (
          <p data-testid="price-manual" className="text-sm text-brand-700">
            {t('price.manual')}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-brand-500">{tPreview('summary.live')}</p>
      </div>
    </section>
  )
}

interface BreakdownProps {
  readonly locale: Locale
  readonly result: Extract<PriceResultDto, { status: 'priced' }>
}

function Breakdown({ locale, result }: BreakdownProps) {
  const t = useTranslations('Configurator')
  const breakdown: PriceBreakdownDto = result.breakdown
  const money = (amount: string) => formatMoney(amount, breakdown.currency, locale)

  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col gap-1 text-sm text-brand-700">
        <div className="flex justify-between gap-3">
          <dt>{t('price.basePrice')}</dt>
          <dd data-testid="price-base">{money(breakdown.basePrice.amount)}</dd>
        </div>
        {breakdown.lines.map((line) => (
          <div key={line.code} className="flex justify-between gap-3">
            <dt>
              {line.label ?? line.code}
              {line.units > 1 ? ` × ${formatNumber(line.units, locale)}` : ''}
            </dt>
            <dd>{money(line.amount.amount)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-3 border-t border-brand-500/20 pt-1">
          <dt>{t('price.subtotal')}</dt>
          <dd data-testid="price-subtotal">{money(breakdown.subtotal.amount)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{t('price.tax', { rate: formatNumber(breakdown.taxRatePercent, locale) })}</dt>
          <dd data-testid="price-tax">{money(breakdown.taxAmount.amount)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-base font-semibold text-brand-900">
          <dt>{t('price.total')}</dt>
          <dd data-testid="price-total">{money(breakdown.total.amount)}</dd>
        </div>
      </dl>
      <p className="text-xs text-brand-500" data-testid="price-tariff">
        {t('price.tariff', { version: formatNumber(result.tariff.versionNumber, locale) })}
      </p>
    </div>
  )
}

interface ContactFormProps {
  readonly contact: ConfiguratorContact
  readonly errors: ReturnType<typeof validateContact>
  readonly sending: boolean
  readonly submitLabel: string
  readonly onChange: (contact: ConfiguratorContact) => void
  readonly onSubmit: () => void
}

function ContactForm({
  contact,
  errors,
  sending,
  submitLabel,
  onChange,
  onSubmit,
}: ContactFormProps) {
  const t = useTranslations('Configurator')

  return (
    <form
      data-testid="contact-form"
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-brand-500/20 bg-white px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <p className="text-sm text-brand-700">{t('contact.intro')}</p>

      <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="contacto-nombre">
        {t('contact.name')}
        <input
          id="contacto-nombre"
          name="nombre"
          data-testid="contact-name"
          maxLength={120}
          aria-invalid={errors.name === undefined ? undefined : true}
          aria-describedby={errors.name === undefined ? undefined : 'contacto-nombre-error'}
          className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
          value={contact.name}
          onChange={(event) => onChange({ ...contact, name: event.target.value })}
        />
      </label>
      {errors.name === undefined ? null : (
        <p id="contacto-nombre-error" role="alert" className="text-sm text-accent-700">
          {t(`contact.errors.name.${errors.name}`)}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="contacto-email">
        {t('contact.email')}
        <input
          id="contacto-email"
          name="email"
          type="email"
          data-testid="contact-email"
          maxLength={254}
          aria-invalid={errors.email === undefined ? undefined : true}
          aria-describedby={errors.email === undefined ? undefined : 'contacto-email-error'}
          className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
          value={contact.email}
          onChange={(event) => onChange({ ...contact, email: event.target.value })}
        />
      </label>
      {errors.email === undefined ? null : (
        <p id="contacto-email-error" role="alert" className="text-sm text-accent-700">
          {t(`contact.errors.email.${errors.email}`)}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="contacto-telefono">
        {t('contact.phone')}
        <input
          id="contacto-telefono"
          name="telefono"
          type="tel"
          data-testid="contact-phone"
          maxLength={40}
          aria-invalid={errors.phone === undefined ? undefined : true}
          className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
          value={contact.phone ?? ''}
          onChange={(event) =>
            onChange({ ...contact, phone: event.target.value === '' ? null : event.target.value })
          }
        />
      </label>
      {errors.phone === undefined ? null : (
        <p role="alert" className="text-sm text-accent-700">
          {t(`contact.errors.phone.${errors.phone}`)}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="contacto-mensaje">
        {t('contact.message')}
        <textarea
          id="contacto-mensaje"
          name="mensaje"
          data-testid="contact-message"
          rows={3}
          maxLength={2000}
          className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
          value={contact.message ?? ''}
          onChange={(event) =>
            onChange({ ...contact, message: event.target.value === '' ? null : event.target.value })
          }
        />
      </label>

      <button
        type="submit"
        data-testid="contact-submit"
        disabled={sending}
        className="self-start rounded-md bg-brand-900 px-4 py-2 font-medium text-white"
      >
        {submitLabel}
      </button>
      <p className="text-xs text-brand-500">{t('contact.privacy')}</p>
    </form>
  )
}
