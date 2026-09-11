/**
 * Factorías de datos de prueba del motor de precios (fuera de la cobertura: son andamiaje).
 */

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { Dimensions } from '@/domain/catalog/measurement'
import { Money } from '@/domain/shared/money'

import type { PriceBreakdown } from '../price-breakdown'
import { PriceModifier, PriceTable, SizeBand } from '../price-table'
import { QuoteConfiguration } from '../quote-configuration'

type ConfigurationOverrides = Partial<
  Omit<Parameters<typeof QuoteConfiguration.create>[0], 'dimensions'>
> & {
  readonly dimensions?: Parameters<typeof QuoteConfiguration.create>[0]['dimensions']
  readonly widthMm?: number
  readonly heightMm?: number
}

export function makeConfiguration(overrides: ConfigurationOverrides = {}): QuoteConfiguration {
  return QuoteConfiguration.create({
    seriesId: overrides.seriesId ?? 'series-ci-100',
    dimensions:
      overrides.dimensions ?? Dimensions.of(overrides.widthMm ?? 900, overrides.heightMm ?? 2100),
    finishId: overrides.finishId ?? null,
    colorId: overrides.colorId ?? null,
    accessoryIds: overrides.accessoryIds ?? [],
    extras: overrides.extras ?? [],
    discountCode: overrides.discountCode ?? null,
  })
}

export function makeModifier(
  overrides: Partial<Parameters<typeof PriceModifier.create>[0]> = {},
): PriceModifier {
  return PriceModifier.create({
    id: overrides.id ?? 'modifier-1',
    code: overrides.code ?? 'EXTRA',
    label: overrides.label ?? LocalizedText.single('Extra'),
    kind: overrides.kind ?? 'fixed',
    target: overrides.target ?? 'installation',
    targetId: overrides.targetId ?? null,
    amount: overrides.amount === undefined ? Money.fromDecimalString('10') : overrides.amount,
    percentage: overrides.percentage ?? null,
  })
}

export function makeBand(overrides: Partial<Parameters<typeof SizeBand.create>[0]> = {}): SizeBand {
  return SizeBand.create({
    id: overrides.id ?? 'band-1',
    label: overrides.label ?? null,
    minWidthMm: overrides.minWidthMm ?? 600,
    maxWidthMm: overrides.maxWidthMm ?? 1000,
    minHeightMm: overrides.minHeightMm ?? 1800,
    maxHeightMm: overrides.maxHeightMm ?? 2200,
    price: overrides.price ?? Money.fromDecimalString('500'),
  })
}

export function makePriceTable(
  overrides: Partial<Parameters<typeof PriceTable.create>[0]> = {},
): PriceTable {
  const strategy = overrides.strategy ?? 'per_square_metre'
  const perSquareMetre =
    overrides.perSquareMetre !== undefined
      ? overrides.perSquareMetre
      : strategy === 'per_square_metre'
        ? Money.fromDecimalString('400')
        : null

  return PriceTable.create({
    tariffVersionId: overrides.tariffVersionId ?? 'tariff-ci-100-v1',
    strategy,
    perSquareMetre,
    fixedPrice: overrides.fixedPrice ?? null,
    bands: overrides.bands ?? [],
    modifiers: overrides.modifiers ?? [],
  })
}

export function makeBreakdown(overrides: Partial<PriceBreakdown> = {}): PriceBreakdown {
  const basePrice = overrides.basePrice ?? Money.fromDecimalString('400')
  const taxAmount = overrides.taxAmount ?? basePrice.percentage('21')

  return {
    currency: overrides.currency ?? 'EUR',
    lines: overrides.lines ?? [
      {
        code: 'base',
        label: null,
        kind: 'base',
        units: 1,
        unitAmount: basePrice,
        amount: basePrice,
      },
    ],
    basePrice,
    subtotal: overrides.subtotal ?? basePrice,
    taxRatePercent: overrides.taxRatePercent ?? '21',
    taxAmount,
    total: overrides.total ?? basePrice.add(taxAmount),
  }
}
