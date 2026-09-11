/**
 * Traducción de un presupuesto emitido a datos serializables.
 *
 * Los textos se resuelven con el **idioma guardado en el presupuesto**, no con el del que
 * consulta: el documento se emitió en un idioma y se renderiza igual siempre (ADR-0005).
 */

import type { Locale } from '@/domain/catalog/locale'
import type { QuoteConfigurationSnapshot } from '@/domain/pricing/quote-configuration'
import type { QuoteStatus, Quote } from '@/domain/quote/quote'

import {
  toMoneyOutput,
  toPriceBreakdownOutput,
  type MoneyOutput,
  type PriceBreakdownOutput,
} from './price-output'

export interface QuoteTotalsOutput {
  readonly subtotal: MoneyOutput
  readonly taxAmount: MoneyOutput
  readonly total: MoneyOutput
}

export interface QuoteOutput {
  readonly id: string
  readonly reference: string
  readonly status: QuoteStatus
  readonly locale: Locale
  readonly seriesId: string
  readonly tariffVersionId: string
  readonly validUntil: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly configuration: QuoteConfigurationSnapshot
  readonly totals: QuoteTotalsOutput
  readonly breakdown: PriceBreakdownOutput
}

export function toQuoteOutput(quote: Quote): QuoteOutput {
  const currency = quote.breakdown.currency

  return {
    id: quote.id,
    reference: quote.reference,
    status: quote.status,
    locale: quote.locale,
    seriesId: quote.seriesId,
    tariffVersionId: quote.tariffVersionId,
    validUntil: quote.validUntil?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    configuration: quote.configurationSnapshot,
    totals: {
      subtotal: toMoneyOutput(quote.breakdown.subtotal, currency),
      taxAmount: toMoneyOutput(quote.breakdown.taxAmount, currency),
      total: toMoneyOutput(quote.breakdown.total, currency),
    },
    breakdown: toPriceBreakdownOutput(quote.breakdown, quote.locale),
  }
}
