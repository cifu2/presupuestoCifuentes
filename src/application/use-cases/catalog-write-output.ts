/**
 * Traducción de las entidades escritas a datos serializables para el borde HTTP.
 *
 * Los textos viajan como el mapa de traducciones que hay que editar (idioma → valor), no resueltos
 * al idioma de quien pide: el panel de escritura muestra todos los idiomas a la vez. El dinero, como
 * cadena decimal exacta con su moneda, igual que en el resto de la API.
 */

import type { Accessory, AccessoryCategory } from '@/domain/catalog/accessory'
import type { LocalizedText, LocalizedTextTranslations } from '@/domain/catalog/catalog-text'
import { localizedTextTranslations } from '@/domain/catalog/catalog-text'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'
import type { DoorSeries } from '@/domain/catalog/series'
import type { ModifierKind, ModifierTarget, PriceTable } from '@/domain/pricing/price-table'
import type { PricingStrategy } from '@/domain/catalog/tariff-version'

import { toMoneyOutput, type MoneyOutput } from './price-output'

export interface MeasurementLimitsOutput {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
}

export interface SeriesWriteOutput {
  readonly id: string
  readonly code: string
  readonly slug: string
  readonly status: CatalogStatus
  readonly name: LocalizedTextTranslations
  readonly description: LocalizedTextTranslations | null
  readonly limits: MeasurementLimitsOutput
  readonly allowedFinishIds: readonly string[]
  readonly allowedAccessoryIds: readonly string[]
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface FinishWriteOutput {
  readonly id: string
  readonly code: string
  readonly status: CatalogStatus
  readonly name: LocalizedTextTranslations
  readonly description: LocalizedTextTranslations | null
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ColorWriteOutput {
  readonly id: string
  readonly finishId: string
  readonly code: string
  readonly status: CatalogStatus
  readonly name: LocalizedTextTranslations
  readonly hex: string | null
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AccessoryWriteOutput {
  readonly id: string
  readonly code: string
  readonly category: AccessoryCategory
  readonly status: CatalogStatus
  readonly name: LocalizedTextTranslations
  readonly description: LocalizedTextTranslations | null
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PriceBandOutput {
  readonly id: string
  readonly label: LocalizedTextTranslations | null
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
  readonly price: MoneyOutput
}

export interface PriceModifierOutput {
  readonly id: string
  readonly code: string
  readonly label: LocalizedTextTranslations | null
  readonly kind: ModifierKind
  readonly target: ModifierTarget
  readonly targetId: string | null
  readonly amount: MoneyOutput | null
  readonly percentage: string | null
}

export interface PriceTableOutput {
  readonly tariffVersionId: string
  readonly strategy: PricingStrategy
  readonly perSquareMetre: MoneyOutput | null
  readonly fixedPrice: MoneyOutput | null
  readonly bands: readonly PriceBandOutput[]
  readonly modifiers: readonly PriceModifierOutput[]
}

function translationsOf(text: LocalizedText | null): LocalizedTextTranslations | null {
  return text === null ? null : localizedTextTranslations(text)
}

export function toSeriesWriteOutput(series: DoorSeries): SeriesWriteOutput {
  return {
    id: series.id,
    code: series.code,
    slug: series.slug,
    status: series.status,
    name: localizedTextTranslations(series.name),
    description: translationsOf(series.description),
    limits: {
      minWidthMm: series.sizeRange.minWidthMm,
      maxWidthMm: series.sizeRange.maxWidthMm,
      minHeightMm: series.sizeRange.minHeightMm,
      maxHeightMm: series.sizeRange.maxHeightMm,
    },
    allowedFinishIds: series.allowedFinishIds,
    allowedAccessoryIds: series.allowedAccessoryIds,
    sortOrder: series.sortOrder,
    createdAt: series.createdAt.toISOString(),
    updatedAt: series.updatedAt.toISOString(),
  }
}

export function toFinishWriteOutput(finish: Finish): FinishWriteOutput {
  return {
    id: finish.id,
    code: finish.code,
    status: finish.status,
    name: localizedTextTranslations(finish.name),
    description: translationsOf(finish.description),
    sortOrder: finish.sortOrder,
    createdAt: finish.createdAt.toISOString(),
    updatedAt: finish.updatedAt.toISOString(),
  }
}

export function toColorWriteOutput(color: Color): ColorWriteOutput {
  return {
    id: color.id,
    finishId: color.finishId,
    code: color.code,
    status: color.status,
    name: localizedTextTranslations(color.name),
    hex: color.hex,
    sortOrder: color.sortOrder,
    createdAt: color.createdAt.toISOString(),
    updatedAt: color.updatedAt.toISOString(),
  }
}

export function toAccessoryWriteOutput(accessory: Accessory): AccessoryWriteOutput {
  return {
    id: accessory.id,
    code: accessory.code,
    category: accessory.category,
    status: accessory.status,
    name: localizedTextTranslations(accessory.name),
    description: translationsOf(accessory.description),
    sortOrder: accessory.sortOrder,
    createdAt: accessory.createdAt.toISOString(),
    updatedAt: accessory.updatedAt.toISOString(),
  }
}

export function toPriceTableOutput(table: PriceTable, currency: string): PriceTableOutput {
  return {
    tariffVersionId: table.tariffVersionId,
    strategy: table.strategy,
    perSquareMetre:
      table.perSquareMetre === null ? null : toMoneyOutput(table.perSquareMetre, currency),
    fixedPrice: table.fixedPrice === null ? null : toMoneyOutput(table.fixedPrice, currency),
    bands: table.bands.map((band) => ({
      id: band.id,
      label: translationsOf(band.label),
      minWidthMm: band.minWidthMm,
      maxWidthMm: band.maxWidthMm,
      minHeightMm: band.minHeightMm,
      maxHeightMm: band.maxHeightMm,
      price: toMoneyOutput(band.price, currency),
    })),
    modifiers: table.modifiers.map((modifier) => ({
      id: modifier.id,
      code: modifier.code,
      label: translationsOf(modifier.label),
      kind: modifier.kind,
      target: modifier.target,
      targetId: modifier.targetId,
      amount: modifier.amount === null ? null : toMoneyOutput(modifier.amount, currency),
      percentage: modifier.percentage,
    })),
  }
}
