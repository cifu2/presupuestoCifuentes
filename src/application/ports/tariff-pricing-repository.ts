/**
 * Puerto de tarifas con sus precios (ADR-0003).
 *
 * Una versión de tarifa sin tabla de precios cargada no da precio automático: el motor recibe
 * `null` y devuelve presupuesto manual (`no_tariff_in_force`).
 */

import type { TariffVersion } from '@/domain/catalog/tariff-version'
import type { PriceTable } from '@/domain/pricing/price-table'

export interface TariffPricing {
  readonly tariff: TariffVersion
  readonly priceTable: PriceTable
}

export interface TariffPricingRepository {
  /** Única versión publicada y vigente en `instant`, con su tabla de precios. */
  findInForce(seriesId: string, instant: Date): Promise<TariffPricing | null>
  listBySeriesId(seriesId: string): Promise<readonly TariffPricing[]>
}
