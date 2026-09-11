/**
 * Puente entre los hechos del motor de precios y los mensajes traducibles de usuario.
 *
 * El dominio declara el hecho (`ManualQuoteDetail.kind`) sin texto; aquí se compone el `detail`
 * que devuelve la API con las claves `ManualQuoteReasons.<kind>` de `messages/<locale>.json`
 * (ADR-0005). La tabla de parámetros se comprueba contra el tipo `ManualQuoteDetailKind`: si el
 * dominio añade un hecho y no se traduce, no compila (mismo patrón que `domain-errors.ts`).
 */

import { createTranslator } from 'next-intl'

import type { Locale } from '@/domain/catalog/locale'
import type { ManualQuoteDetail, ManualQuoteDetailKind } from '@/domain/pricing/manual-quote-detail'

import en from '../../messages/en.json'
import es from '../../messages/es.json'

export const MANUAL_QUOTE_REASONS_NAMESPACE = 'ManualQuoteReasons'

/** Hechos que la API sabe traducir; el `satisfies` obliga a cubrir todo `ManualQuoteDetailKind`. */
export const TRANSLATED_MANUAL_QUOTE_DETAIL_KINDS = [
  'size_above_series_max',
  'size_below_series_min',
  'finish_not_allowed',
  'color_not_allowed',
  'accessory_not_allowed',
  'no_tariff_in_force',
  'tariff_without_prices',
  'no_size_band_covers_measurement',
  'customer_requested',
] as const satisfies readonly ManualQuoteDetailKind[]

type MissingDetailKind = Exclude<
  ManualQuoteDetailKind,
  (typeof TRANSLATED_MANUAL_QUOTE_DETAIL_KINDS)[number]
>

/** `true` solo si todos los hechos del dominio tienen mensaje. */
export const ALL_MANUAL_QUOTE_DETAILS_TRANSLATED: MissingDetailKind extends never ? true : false =
  true

type Messages = typeof es

const DICTIONARIES: Record<Locale, Messages> = { es, en }

export function manualQuoteDetailMessageKey(kind: ManualQuoteDetailKind): string {
  return `${MANUAL_QUOTE_REASONS_NAMESPACE}.${kind}`
}

/** Parámetros ICU de cada hecho; nunca incluye datos personales. */
export function manualQuoteDetailParams(
  detail: ManualQuoteDetail,
): Record<string, string | number> {
  switch (detail.kind) {
    case 'size_above_series_max':
      return {
        width: detail.widthMm,
        height: detail.heightMm,
        series: detail.seriesCode,
        maxWidth: detail.maxWidthMm,
        maxHeight: detail.maxHeightMm,
      }
    case 'size_below_series_min':
      return {
        width: detail.widthMm,
        height: detail.heightMm,
        series: detail.seriesCode,
        minWidth: detail.minWidthMm,
        minHeight: detail.minHeightMm,
      }
    case 'finish_not_allowed':
      return { finish: detail.finishId, series: detail.seriesCode }
    case 'color_not_allowed':
      return { color: detail.colorId }
    case 'accessory_not_allowed':
      return { accessory: detail.accessoryId, series: detail.seriesCode }
    case 'no_tariff_in_force':
    case 'tariff_without_prices':
      return { series: detail.seriesCode }
    case 'no_size_band_covers_measurement':
      return { width: detail.widthMm, height: detail.heightMm }
    case 'customer_requested':
      return {}
  }
}

/** Compone el `detail` traducido que devuelve la API para un hecho de presupuesto manual. */
export function formatManualQuoteDetail(detail: ManualQuoteDetail, locale: Locale): string {
  const translate = createTranslator({
    locale,
    messages: DICTIONARIES[locale],
    namespace: MANUAL_QUOTE_REASONS_NAMESPACE,
  })

  return translate(detail.kind, manualQuoteDetailParams(detail))
}
