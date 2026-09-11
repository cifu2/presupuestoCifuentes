/**
 * Motor de precios: función pura del dominio (ADR-0003).
 *
 * Recibe la serie, la configuración, la versión de tarifa vigente y su tabla de precios, y
 * devuelve un desglose de líneas con subtotal, IVA y total, o el paso a presupuesto manual con su
 * motivo. No toca base de datos, red ni framework: se testea con tabla de casos.
 *
 * Orden de cálculo (determinista y documentado en docs/api.md):
 *   1. Se resuelve el precio base (por m², fijo o por banda de medida).
 *   2. Se suman los modificadores de adición (acabado, color, accesorios, instalación, portes,
 *      urgencia). Los porcentuales se aplican sobre el precio base.
 *   3. Los descuentos se aplican en orden y nunca dejan el subtotal por debajo de cero.
 *   4. El IVA se calcula sobre el subtotal; el total es subtotal + IVA.
 */

import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'
import type { DoorSeries } from '@/domain/catalog/series'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import { Money } from '@/domain/shared/money'

import { assessConfigurationCompatibility } from './compatibility'
import type { PriceBreakdown, PriceLine, PriceResult } from './price-breakdown'
import type { PriceModifier, PriceTable } from './price-table'
import type { QuoteConfiguration } from './quote-configuration'

export interface CalculateQuotePriceInput {
  readonly series: DoorSeries
  readonly configuration: QuoteConfiguration
  /** Tarifa vigente en `instant`, o `null` si no hay ninguna publicada. */
  readonly tariff: TariffVersion | null
  readonly priceTable: PriceTable | null
  /** Colores publicados del acabado elegido; `null` para no comprobarlo. */
  readonly allowedColorIds: readonly string[] | null
  readonly instant: Date
}

export function calculateQuotePrice(input: CalculateQuotePriceInput): PriceResult {
  const { series, configuration, tariff, priceTable } = input

  const sizeFailure = assessSize(series, configuration)

  if (sizeFailure !== null) {
    return sizeFailure
  }

  const compatibilityFailure = assessConfigurationCompatibility({
    series,
    configuration,
    allowedColorIds: input.allowedColorIds,
  })

  if (compatibilityFailure !== null) {
    return {
      status: 'manual_quote_required',
      reason: compatibilityFailure.reason,
      detail: compatibilityFailure.detail,
    }
  }

  if (tariff === null || !tariff.isInForceAt(input.instant)) {
    return manualQuote('no_tariff_in_force', `La serie "${series.code}" no tiene tarifa vigente`)
  }

  if (priceTable === null || priceTable.tariffVersionId !== tariff.id) {
    return manualQuote(
      'no_tariff_in_force',
      `La tarifa vigente de la serie "${series.code}" todavía no tiene precios cargados`,
    )
  }

  const basePrice = priceTable.basePriceFor(configuration.dimensions)

  if (basePrice === null) {
    return manualQuote(
      'uncovered_configuration',
      `Ninguna banda de medida de la tarifa cubre ${configuration.dimensions.widthMm}×${configuration.dimensions.heightMm} mm`,
    )
  }

  return {
    status: 'priced',
    breakdown: buildBreakdown({ basePrice, configuration, tariff, priceTable }),
  }
}

interface BuildBreakdownInput {
  readonly basePrice: Money
  readonly configuration: QuoteConfiguration
  readonly tariff: TariffVersion
  readonly priceTable: PriceTable
}

function buildBreakdown(input: BuildBreakdownInput): PriceBreakdown {
  const { basePrice, configuration, tariff, priceTable } = input

  const lines: PriceLine[] = [
    {
      code: 'base',
      label: null,
      kind: 'base',
      units: 1,
      unitAmount: basePrice,
      amount: basePrice,
    },
  ]

  const matched = priceTable.modifiers.filter((modifier) =>
    matchesConfiguration(modifier, configuration),
  )

  const additions = matched.filter((modifier) => !modifier.isDiscount)
  const discounts = matched.filter((modifier) => modifier.isDiscount)

  let running = basePrice

  for (const modifier of additions) {
    const amount = modifierAmount(modifier, basePrice, configuration)
    const units = modifierUnits(modifier, configuration)

    running = running.add(amount)

    lines.push({
      code: modifier.code,
      label: modifier.label,
      kind: 'addition',
      units,
      unitAmount: units === 0 ? amount : Money.fromCents(amount.cents / BigInt(units)),
      amount,
    })
  }

  for (const modifier of discounts) {
    const requested = modifierAmount(modifier, running, configuration)
    const amount = requested.cents > running.cents ? running : requested

    running = running.subtract(amount)

    lines.push({
      code: modifier.code,
      label: modifier.label,
      kind: 'discount',
      units: 1,
      unitAmount: amount,
      amount,
    })
  }

  const subtotal = running
  const taxAmount = subtotal.percentage(tariff.taxRatePercent)

  return {
    currency: tariff.currency,
    lines,
    basePrice,
    subtotal,
    taxRatePercent: tariff.taxRatePercent,
    taxAmount,
    total: subtotal.add(taxAmount),
  }
}

/** Modificadores que aplican a la configuración elegida. */
function matchesConfiguration(modifier: PriceModifier, configuration: QuoteConfiguration): boolean {
  switch (modifier.target) {
    case 'finish':
      return configuration.finishId !== null && modifier.targetId === configuration.finishId
    case 'color':
      return configuration.colorId !== null && modifier.targetId === configuration.colorId
    case 'accessory':
      return modifier.targetId !== null && configuration.usesAccessory(modifier.targetId)
    case 'installation':
      return configuration.hasExtra('installation')
    case 'shipping':
      return configuration.hasExtra('shipping')
    case 'urgency':
      return configuration.hasExtra('urgency')
    case 'discount':
      return modifier.targetId === null || configuration.usesDiscountCode(modifier.targetId)
  }
}

function modifierUnits(modifier: PriceModifier, configuration: QuoteConfiguration): number {
  if (modifier.target !== 'accessory' || modifier.targetId === null) {
    return 1
  }

  return configuration.accessoryIds.filter((accessoryId) => accessoryId === modifier.targetId)
    .length
}

function modifierAmount(
  modifier: PriceModifier,
  baseForPercentage: Money,
  configuration: QuoteConfiguration,
): Money {
  if (modifier.kind === 'percentage') {
    return baseForPercentage.percentage(modifier.percentage ?? '0')
  }

  const amount = modifier.amount ?? Money.zero()

  if (modifier.kind === 'per_unit') {
    return amount.multiplyByRatio(BigInt(modifierUnits(modifier, configuration)), 1n)
  }

  return amount
}

function assessSize(series: DoorSeries, configuration: QuoteConfiguration): PriceResult | null {
  const assessment = series.assessSize(configuration.dimensions)

  if (assessment.status === 'within_range') {
    return null
  }

  if (assessment.requiresManualQuote) {
    return manualQuote(
      'size_exceeds_series_max',
      `La medida ${configuration.dimensions.widthMm}×${configuration.dimensions.heightMm} mm supera el máximo de la serie "${series.code}" (${series.maxWidthMm}×${series.maxHeightMm} mm)`,
    )
  }

  return manualQuote(
    'uncovered_configuration',
    `La medida ${configuration.dimensions.widthMm}×${configuration.dimensions.heightMm} mm está por debajo del mínimo de la serie "${series.code}" (${series.sizeRange.minWidthMm}×${series.sizeRange.minHeightMm} mm)`,
  )
}

function manualQuote(reason: ManualQuoteReason, detail: string): PriceResult {
  return { status: 'manual_quote_required', reason, detail }
}
