/**
 * Resultado del motor de precios (ADR-0003).
 *
 * El motor nunca inventa un precio: o devuelve un desglose completo (`priced`) o declara que hace
 * falta presupuesto manual (`manual_quote_required`) con el motivo y el hecho que lo provoca. El
 * desglose es inmutable y es lo que se congela en el presupuesto emitido.
 */

import type { LocalizedText } from '@/domain/catalog/catalog-text'
import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'
import type { Money } from '@/domain/shared/money'

import type { ManualQuoteDetail } from './manual-quote-detail'

export const PRICE_LINE_KINDS = ['base', 'addition', 'discount'] as const

export type PriceLineKind = (typeof PRICE_LINE_KINDS)[number]

export interface PriceLine {
  readonly code: string
  readonly label: LocalizedText | null
  readonly kind: PriceLineKind
  /** Número de elementos del objetivo presentes (1 salvo accesorios). */
  readonly units: number
  readonly unitAmount: Money
  readonly amount: Money
}

export interface PriceBreakdown {
  readonly currency: string
  readonly lines: readonly PriceLine[]
  readonly basePrice: Money
  readonly subtotal: Money
  readonly taxRatePercent: string
  readonly taxAmount: Money
  readonly total: Money
}

export type PriceResult =
  | { readonly status: 'priced'; readonly breakdown: PriceBreakdown }
  | {
      readonly status: 'manual_quote_required'
      readonly reason: ManualQuoteReason
      /** Hecho y parámetros del paso a manual; el texto traducido se compone en el borde. */
      readonly detail: ManualQuoteDetail
    }
