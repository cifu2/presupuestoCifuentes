/**
 * Caso de uso: cálculo de precio en vivo del configurador.
 *
 * Orquesta los puertos (serie publicada, tarifa vigente con su tabla de precios, colores del
 * acabado) y delega la decisión en el dominio. `priceConfiguration` devuelve el desglose de
 * dominio; `calculatePrice` lo serializa para el borde HTTP.
 */

import type { Locale } from '@/domain/catalog/locale'
import { Dimensions } from '@/domain/catalog/measurement'
import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'
import type { DoorSeries } from '@/domain/catalog/series'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import { calculateQuotePrice } from '@/domain/pricing/calculate-quote-price'
import type { ManualQuoteDetail } from '@/domain/pricing/manual-quote-detail'
import type { PriceBreakdown } from '@/domain/pricing/price-breakdown'
import { QuoteConfiguration, type QuoteExtra } from '@/domain/pricing/quote-configuration'
import { ResourceNotFoundError } from '@/domain/shared/errors'

import type { Clock } from '@/application/ports/clock'
import type { ColorRepository } from '@/application/ports/catalog-item-repositories'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type { TariffPricingRepository } from '@/application/ports/tariff-pricing-repository'
import { toCatalogSeriesSummary, type CatalogSeriesSummary } from './get-published-series'
import { toPriceBreakdownOutput, type PriceBreakdownOutput } from './price-output'

export interface CalculatePriceDeps {
  readonly seriesRepository: SeriesRepository
  readonly tariffPricingRepository: TariffPricingRepository
  readonly colorRepository: ColorRepository
  readonly clock: Clock
}

export interface CalculatePriceInput {
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

export interface AppliedTariffOutput {
  readonly id: string
  readonly versionNumber: number
  readonly validFrom: string
  readonly validUntil: string | null
}

export type CalculatePriceOutput =
  | {
      readonly status: 'priced'
      readonly series: CatalogSeriesSummary
      readonly tariff: AppliedTariffOutput
      readonly breakdown: PriceBreakdownOutput
    }
  | ManualQuoteRequiredResult

export interface ManualQuoteRequiredResult {
  readonly status: 'manual_quote_required'
  readonly seriesId: string
  readonly seriesCode: string
  readonly reason: ManualQuoteReason
  /** Hecho que provoca el paso a manual; el borde lo traduce con `ManualQuoteReasons.<kind>`. */
  readonly detail: ManualQuoteDetail
}

/** Precio calculado con objetos de dominio, listo para congelar en un presupuesto. */
export interface PricedConfigurationResult {
  readonly status: 'priced'
  readonly series: DoorSeries
  readonly tariff: TariffVersion
  readonly breakdown: PriceBreakdown
}

export type PriceConfigurationResult = PricedConfigurationResult | ManualQuoteRequiredResult

export async function calculatePrice(
  deps: CalculatePriceDeps,
  input: CalculatePriceInput,
): Promise<CalculatePriceOutput> {
  const { series, configuration } = await resolveConfiguration(deps, input)
  const result = await priceConfiguration(deps, {
    series,
    configuration,
    locale: input.locale,
  })

  if (result.status === 'manual_quote_required') {
    return result
  }

  return {
    status: 'priced',
    series: toCatalogSeriesSummary(result.series, input.locale),
    tariff: {
      id: result.tariff.id,
      versionNumber: result.tariff.versionNumber,
      validFrom: result.tariff.validity.validFrom.toISOString(),
      validUntil: result.tariff.validity.validUntil?.toISOString() ?? null,
    },
    breakdown: toPriceBreakdownOutput(result.breakdown, input.locale),
  }
}

export interface ResolveConfigurationDeps {
  readonly seriesRepository: SeriesRepository
}

export async function resolveConfiguration(
  deps: ResolveConfigurationDeps,
  input: Pick<
    CalculatePriceInput,
    | 'slug'
    | 'widthMm'
    | 'heightMm'
    | 'finishId'
    | 'colorId'
    | 'accessoryIds'
    | 'extras'
    | 'discountCode'
  >,
): Promise<{ series: DoorSeries; configuration: QuoteConfiguration }> {
  const series = await deps.seriesRepository.findPublishedBySlug(input.slug)

  if (series === null) {
    throw new ResourceNotFoundError(`No existe ninguna serie publicada con slug "${input.slug}"`)
  }

  const configuration = QuoteConfiguration.create({
    seriesId: series.id,
    dimensions: Dimensions.of(input.widthMm, input.heightMm),
    finishId: input.finishId,
    colorId: input.colorId,
    accessoryIds: input.accessoryIds,
    extras: input.extras,
    discountCode: input.discountCode,
  })

  return { series, configuration }
}

export interface PriceConfigurationDeps {
  readonly tariffPricingRepository: TariffPricingRepository
  readonly colorRepository: ColorRepository
  readonly clock: Clock
}

export interface PriceConfigurationInput {
  readonly series: DoorSeries
  readonly configuration: QuoteConfiguration
  readonly locale: Locale
}

/** Núcleo compartido por el cálculo en vivo y la emisión de presupuesto. */
export async function priceConfiguration(
  deps: PriceConfigurationDeps,
  input: PriceConfigurationInput,
): Promise<PriceConfigurationResult> {
  const { series, configuration } = input
  const instant = deps.clock.now()

  const [pricing, colors] = await Promise.all([
    deps.tariffPricingRepository.findInForce(series.id, instant),
    configuration.finishId === null
      ? Promise.resolve(null)
      : deps.colorRepository.listPublishedByFinishId(configuration.finishId),
  ])

  const result = calculateQuotePrice({
    series,
    configuration,
    tariff: pricing?.tariff ?? null,
    priceTable: pricing?.priceTable ?? null,
    allowedColorIds: colors === null ? null : colors.map((color) => color.id),
    instant,
  })

  if (result.status === 'manual_quote_required') {
    return {
      status: 'manual_quote_required',
      seriesId: series.id,
      seriesCode: series.code,
      reason: result.reason,
      detail: result.detail,
    }
  }

  if (pricing === null) {
    // Invariante: sin tarifa vigente el dominio devuelve presupuesto manual.
    throw new ResourceNotFoundError(`La serie "${series.code}" no tiene tarifa vigente`)
  }

  return {
    status: 'priced',
    series,
    tariff: pricing.tariff,
    breakdown: result.breakdown,
  }
}
