/**
 * Caso de uso: registrar una solicitud de presupuesto manual.
 *
 * El motivo lo deriva el servidor volviendo a calcular el precio: si el configurador no puede dar
 * precio, se guarda la solicitud con el motivo real. Solo la petición expresa del cliente
 * (`customer_requested`) se acepta sin recálculo.
 */

import { Dimensions } from '@/domain/catalog/measurement'
import type { Locale } from '@/domain/catalog/locale'
import { ManualQuoteRequest, type ManualQuoteContact } from '@/domain/catalog/manual-quote-request'
import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'
import type { QuoteExtra } from '@/domain/pricing/quote-configuration'
import { InvalidValueError } from '@/domain/shared/errors'

import type { Clock } from '@/application/ports/clock'
import type { ColorRepository } from '@/application/ports/catalog-item-repositories'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { ManualQuoteRequestRepository } from '@/application/ports/manual-quote-request-repository'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type { TariffPricingRepository } from '@/application/ports/tariff-pricing-repository'
import { priceConfiguration, resolveConfiguration } from './calculate-price'
import { toPriceBreakdownOutput, type PriceBreakdownOutput } from './price-output'

export interface RequestManualQuoteDeps {
  readonly seriesRepository: SeriesRepository
  readonly tariffPricingRepository: TariffPricingRepository
  readonly colorRepository: ColorRepository
  readonly manualQuoteRequestRepository: ManualQuoteRequestRepository
  readonly idGenerator: IdGenerator
  readonly clock: Clock
}

export interface RequestManualQuoteInput {
  /** Slug de la serie; obligatorio salvo cuando el cliente pide que le llamen sin configuración. */
  readonly slug: string | null
  readonly widthMm: number | null
  readonly heightMm: number | null
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null
  readonly locale: Locale
  /** `customer_requested` cuando el cliente pide expresamente que le contacten. */
  readonly requestedReason: 'customer_requested' | null
  readonly contact: ManualQuoteContact
}

export interface CreatedManualQuoteOutput {
  readonly id: string
  readonly reason: ManualQuoteReason
  readonly status: 'pending'
  readonly createdAt: string
}

export type RequestManualQuoteOutput =
  | { readonly status: 'created'; readonly request: CreatedManualQuoteOutput }
  | {
      readonly status: 'price_available'
      readonly seriesId: string
      readonly seriesCode: string
      readonly breakdown: PriceBreakdownOutput
    }

export async function requestManualQuote(
  deps: RequestManualQuoteDeps,
  input: RequestManualQuoteInput,
): Promise<RequestManualQuoteOutput> {
  const now = deps.clock.now()

  if (input.requestedReason === 'customer_requested') {
    return persist(deps, {
      reason: 'customer_requested',
      seriesId: null,
      dimensions: null,
      finishId: input.finishId,
      colorId: input.colorId,
      accessoryIds: input.accessoryIds,
      contact: input.contact,
      now,
    })
  }

  if (input.slug === null || input.widthMm === null || input.heightMm === null) {
    throw new InvalidValueError(
      'Para pedir presupuesto manual hace falta la serie y las medidas, o marcar customer_requested',
    )
  }

  const { series, configuration } = await resolveConfiguration(deps, {
    slug: input.slug,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    finishId: input.finishId,
    colorId: input.colorId,
    accessoryIds: input.accessoryIds,
    extras: input.extras,
    discountCode: input.discountCode,
  })

  const price = await priceConfiguration(deps, {
    series,
    configuration,
    locale: input.locale,
  })

  if (price.status === 'priced') {
    return {
      status: 'price_available',
      seriesId: series.id,
      seriesCode: series.code,
      breakdown: toPriceBreakdownOutput(price.breakdown, input.locale),
    }
  }

  return persist(deps, {
    reason: price.reason,
    seriesId: series.id,
    dimensions: configuration.dimensions,
    finishId: configuration.finishId,
    colorId: configuration.colorId,
    accessoryIds: configuration.accessoryIds,
    contact: input.contact,
    now,
  })
}

interface PersistInput {
  readonly reason: ManualQuoteReason
  readonly seriesId: string | null
  readonly dimensions: Dimensions | null
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly contact: ManualQuoteContact
  readonly now: Date
}

async function persist(
  deps: RequestManualQuoteDeps,
  input: PersistInput,
): Promise<RequestManualQuoteOutput> {
  const request = ManualQuoteRequest.create({
    id: deps.idGenerator.nextId(),
    reason: input.reason,
    status: 'pending',
    seriesId: input.seriesId,
    dimensions: input.dimensions,
    finishId: input.finishId,
    colorId: input.colorId,
    accessoryIds: input.accessoryIds,
    contact: input.contact,
    createdAt: input.now,
    updatedAt: input.now,
    handledAt: null,
  })

  await deps.manualQuoteRequestRepository.save(request)

  return {
    status: 'created',
    request: {
      id: request.id,
      reason: request.reason,
      status: 'pending',
      createdAt: request.createdAt.toISOString(),
    },
  }
}
