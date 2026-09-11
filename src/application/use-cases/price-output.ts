/**
 * Traducción de objetos de dominio a datos serializables para el borde HTTP.
 *
 * El dinero viaja como cadena decimal exacta (`"1234.56"`) con su moneda, nunca como `number`:
 * `bigint` no es serializable en JSON y el frontend no debe re-derivar redondeos. Los textos se
 * resuelven al idioma pedido con el fallback del catálogo (ADR-0005).
 */

import type { LocalizedText } from '@/domain/catalog/catalog-text'
import type { Locale } from '@/domain/catalog/locale'
import type { PriceBreakdown, PriceLine, PriceLineKind } from '@/domain/pricing/price-breakdown'
import type { Money } from '@/domain/shared/money'

export interface MoneyOutput {
  readonly amount: string
  readonly currency: string
}

export interface PriceLineOutput {
  readonly code: string
  readonly label: string | null
  readonly kind: PriceLineKind
  readonly units: number
  readonly unitAmount: MoneyOutput
  readonly amount: MoneyOutput
}

export interface PriceBreakdownOutput {
  readonly currency: string
  readonly lines: readonly PriceLineOutput[]
  readonly basePrice: MoneyOutput
  readonly subtotal: MoneyOutput
  readonly taxRatePercent: string
  readonly taxAmount: MoneyOutput
  readonly total: MoneyOutput
}

export function resolveText(text: LocalizedText | null, locale: Locale): string | null {
  return text === null ? null : text.resolve(locale)
}

export function toMoneyOutput(money: Money, currency: string): MoneyOutput {
  return { amount: money.toString(), currency }
}

export function toPriceLineOutput(
  line: PriceLine,
  locale: Locale,
  currency: string,
): PriceLineOutput {
  return {
    code: line.code,
    label: resolveText(line.label, locale),
    kind: line.kind,
    units: line.units,
    unitAmount: toMoneyOutput(line.unitAmount, currency),
    amount: toMoneyOutput(line.amount, currency),
  }
}

export function toPriceBreakdownOutput(
  breakdown: PriceBreakdown,
  locale: Locale,
): PriceBreakdownOutput {
  return {
    currency: breakdown.currency,
    lines: breakdown.lines.map((line) => toPriceLineOutput(line, locale, breakdown.currency)),
    basePrice: toMoneyOutput(breakdown.basePrice, breakdown.currency),
    subtotal: toMoneyOutput(breakdown.subtotal, breakdown.currency),
    taxRatePercent: breakdown.taxRatePercent,
    taxAmount: toMoneyOutput(breakdown.taxAmount, breakdown.currency),
    total: toMoneyOutput(breakdown.total, breakdown.currency),
  }
}
