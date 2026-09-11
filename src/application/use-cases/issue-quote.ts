/**
 * Caso de uso: emitir un presupuesto con el precio congelado (ADR-0003).
 *
 * El servidor recalcula siempre el precio (nunca se fía de lo que envía el cliente), le asigna
 * una referencia correlativa y guarda tarifa, configuración y desglose. Si la configuración no
 * tiene precio automático devuelve el motivo para pasar a presupuesto manual.
 */

import type { Locale } from '@/domain/catalog/locale'
import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'
import type { QuoteExtra } from '@/domain/pricing/quote-configuration'
import { Quote } from '@/domain/quote/quote'
import { formatQuoteReference } from '@/domain/quote/quote-reference'

import type { Clock } from '@/application/ports/clock'
import type { ColorRepository } from '@/application/ports/catalog-item-repositories'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { QuoteNumberSequence } from '@/application/ports/quote-number-sequence'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type { TariffPricingRepository } from '@/application/ports/tariff-pricing-repository'
import { priceConfiguration, resolveConfiguration } from './calculate-price'
import { toQuoteOutput, type QuoteOutput } from './quote-output'

const MILLISECONDS_PER_DAY = 86_400_000

export const DEFAULT_QUOTE_VALIDITY_DAYS = 30

export interface IssueQuoteDeps {
  readonly seriesRepository: SeriesRepository
  readonly tariffPricingRepository: TariffPricingRepository
  readonly colorRepository: ColorRepository
  readonly quoteRepository: QuoteRepository
  readonly quoteNumberSequence: QuoteNumberSequence
  readonly idGenerator: IdGenerator
  readonly clock: Clock
  readonly validityDays?: number
}

export interface IssueQuoteInput {
  readonly slug: string
  readonly widthMm: number
  readonly heightMm: number
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null
  readonly locale: Locale
}

export type IssueQuoteOutput =
  | { readonly status: 'issued'; readonly quote: QuoteOutput }
  | {
      readonly status: 'manual_quote_required'
      readonly seriesId: string
      readonly seriesCode: string
      readonly reason: ManualQuoteReason
      readonly detail: string
    }

export async function issueQuote(
  deps: IssueQuoteDeps,
  input: IssueQuoteInput,
): Promise<IssueQuoteOutput> {
  const { series, configuration } = await resolveConfiguration(deps, input)

  const price = await priceConfiguration(deps, {
    series,
    configuration,
    locale: input.locale,
  })

  if (price.status === 'manual_quote_required') {
    return price
  }

  const issuedAt = deps.clock.now()
  const reference = formatQuoteReference(
    issuedAt.getUTCFullYear(),
    await deps.quoteNumberSequence.next(issuedAt.getUTCFullYear()),
  )

  const validityDays = deps.validityDays ?? DEFAULT_QUOTE_VALIDITY_DAYS

  const quote = Quote.issue({
    id: deps.idGenerator.nextId(),
    reference,
    configuration,
    tariffVersionId: price.tariff.id,
    locale: input.locale,
    breakdown: price.breakdown,
    validUntil: new Date(issuedAt.getTime() + validityDays * MILLISECONDS_PER_DAY),
    createdAt: issuedAt,
  })

  await deps.quoteRepository.save(quote)

  return { status: 'issued', quote: toQuoteOutput(quote) }
}
