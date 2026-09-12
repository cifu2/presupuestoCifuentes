/**
 * Puerto de lectura de administración (ADR-0023 §6, fase 2 del panel).
 *
 * El panel necesita ver el catálogo **tal como está**, no solo lo publicado: series en borrador o
 * archivadas, acabados y colores retirados, complementos y todas las versiones de tarifa con su
 * estado y vigencia. Por eso este puerto devuelve las entidades de lectura completas y no filtra
 * por estado (a diferencia de los puertos publicados del configurador).
 *
 * Devuelve `LocalizedText` y no cadenas ya resueltas: la resolución de idioma y el aviso de
 * traducciones que faltan son decisión del caso de uso, que es quien conoce el idioma de la
 * petición. El adaptador (memoria o Prisma) solo lee y mapea.
 */

import type { AccessoryCategory } from '@/domain/catalog/accessory'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { LocalizedText } from '@/domain/catalog/catalog-text'
import type { PricingStrategy, TariffStatus } from '@/domain/catalog/tariff-version'

/** Rango de medidas de la serie, con el máximo que dispara el paso a presupuesto manual. */
export interface AdminMeasurementLimits {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
}

export interface AdminSeriesRecord {
  readonly id: string
  readonly code: string
  readonly slug: string
  readonly status: CatalogStatus
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly limits: AdminMeasurementLimits
  readonly allowedFinishIds: readonly string[]
  readonly allowedAccessoryIds: readonly string[]
  readonly sortOrder: number
}

export interface AdminFinishRecord {
  readonly id: string
  readonly code: string
  readonly status: CatalogStatus
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly sortOrder: number
}

export interface AdminColorRecord {
  readonly id: string
  readonly finishId: string
  readonly code: string
  readonly status: CatalogStatus
  readonly name: LocalizedText
  readonly hex: string | null
  readonly sortOrder: number
}

export interface AdminAccessoryRecord {
  readonly id: string
  readonly code: string
  readonly category: AccessoryCategory
  readonly status: CatalogStatus
  readonly name: LocalizedText
  readonly description: LocalizedText | null
  readonly sortOrder: number
}

export interface AdminTariffVersionRecord {
  readonly id: string
  readonly seriesId: string
  readonly versionNumber: number
  readonly status: TariffStatus
  readonly strategy: PricingStrategy
  readonly validFrom: Date
  readonly validUntil: Date | null
  /** Filas de precio de la tabla (bandas + modificadores); `0` si es un borrador sin tabla. */
  readonly priceCount: number
}

/** Foto completa del catálogo editable. El panel tiene pocos cientos de filas: una sola lectura. */
export interface AdminCatalogSnapshot {
  readonly series: readonly AdminSeriesRecord[]
  readonly finishes: readonly AdminFinishRecord[]
  readonly colors: readonly AdminColorRecord[]
  readonly accessories: readonly AdminAccessoryRecord[]
  readonly tariffVersions: readonly AdminTariffVersionRecord[]
}

export interface AdminCatalogReadPort {
  /** Serie, acabados, colores, complementos y versiones de tarifa, en cualquier estado editorial. */
  loadAdminCatalog(): Promise<AdminCatalogSnapshot>
}
