/**
 * Hechos que explican por qué una configuración no tiene precio automático (ADR-0003).
 *
 * El dominio declara **el hecho y sus parámetros**, nunca el texto de usuario: el mensaje se
 * compone en el borde con las claves `ManualQuoteReasons.<kind>` de `messages/<locale>.json`
 * (ADR-0005). Así el mismo cálculo sirve en cualquier idioma y el dominio queda libre de i18n.
 */

import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'

interface ManualQuoteDetailByKind {
  /** La medida supera el tamaño máximo de la serie: paso a presupuesto manual. */
  readonly size_above_series_max: {
    readonly widthMm: number
    readonly heightMm: number
    readonly seriesCode: string
    readonly maxWidthMm: number
    readonly maxHeightMm: number
  }
  /** La medida no llega al mínimo de la serie: la configuración queda sin cubrir. */
  readonly size_below_series_min: {
    readonly widthMm: number
    readonly heightMm: number
    readonly seriesCode: string
    readonly minWidthMm: number
    readonly minHeightMm: number
  }
  readonly finish_not_allowed: {
    readonly finishId: string
    readonly seriesCode: string
  }
  readonly color_not_allowed: {
    readonly colorId: string
  }
  readonly accessory_not_allowed: {
    readonly accessoryId: string
    readonly seriesCode: string
  }
  readonly no_tariff_in_force: {
    readonly seriesCode: string
  }
  readonly tariff_without_prices: {
    readonly seriesCode: string
  }
  readonly no_size_band_covers_measurement: {
    readonly widthMm: number
    readonly heightMm: number
  }
  readonly customer_requested: Record<never, never>
}

export type ManualQuoteDetailKind = keyof ManualQuoteDetailByKind

/** Unión discriminada por `kind`: cada caso lleva solo datos, sin literales de interfaz. */
export type ManualQuoteDetail = {
  [Kind in ManualQuoteDetailKind]: { readonly kind: Kind } & ManualQuoteDetailByKind[Kind]
}[ManualQuoteDetailKind]

export const MANUAL_QUOTE_DETAIL_KINDS = [
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

const REASON_BY_KIND = {
  size_above_series_max: 'size_exceeds_series_max',
  size_below_series_min: 'uncovered_configuration',
  finish_not_allowed: 'uncovered_configuration',
  color_not_allowed: 'uncovered_configuration',
  accessory_not_allowed: 'uncovered_configuration',
  no_tariff_in_force: 'no_tariff_in_force',
  tariff_without_prices: 'no_tariff_in_force',
  no_size_band_covers_measurement: 'uncovered_configuration',
  customer_requested: 'customer_requested',
} as const satisfies Record<ManualQuoteDetailKind, ManualQuoteReason>

/** Motivo estable de la API derivado del hecho; la tabla `satisfies` obliga a mapear cada caso. */
export function manualQuoteReasonOf(detail: ManualQuoteDetail): ManualQuoteReason {
  return REASON_BY_KIND[detail.kind]
}
