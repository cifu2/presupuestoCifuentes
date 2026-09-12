/**
 * Adaptador en memoria del puerto de lectura de administración.
 *
 * Lo usan el modo demostración (sin `DATABASE_URL`, y el E2E hermético) y los tests: lee del mismo
 * `InMemoryCatalogStore` que sirve el configurador, así que el panel y el configurador ven el mismo
 * catálogo. No filtra por estado editorial: el panel administra también borradores y archivados.
 */

import type {
  AdminAccessoryRecord,
  AdminCatalogReadPort,
  AdminCatalogSnapshot,
  AdminColorRecord,
  AdminFinishRecord,
  AdminSeriesRecord,
  AdminTariffVersionRecord,
} from '@/application/ports/admin-catalog-reader'
import type { TariffPricing } from '@/application/ports/tariff-pricing-repository'

import type { InMemoryCatalogStore } from './catalog-store'

/**
 * Filas de precio de la tabla: bandas de talla + modificadores. Un borrador sin tabla cuenta `0`,
 * que es lo que el panel pinta como «sin precios todavía».
 */
function priceCountOf(pricing: TariffPricing | undefined): number {
  if (pricing === undefined) {
    return 0
  }

  return pricing.priceTable.bands.length + pricing.priceTable.modifiers.length
}

export class InMemoryAdminCatalogReader implements AdminCatalogReadPort {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async loadAdminCatalog(): Promise<AdminCatalogSnapshot> {
    const pricingByTariffId = new Map(
      this.store.pricing.map((entry) => [entry.tariff.id, entry] as const),
    )

    const series: readonly AdminSeriesRecord[] = this.store.series.map((item) => ({
      id: item.id,
      code: item.code,
      slug: item.slug,
      status: item.status,
      name: item.name,
      description: item.description,
      limits: {
        minWidthMm: item.sizeRange.minWidthMm,
        maxWidthMm: item.sizeRange.maxWidthMm,
        minHeightMm: item.sizeRange.minHeightMm,
        maxHeightMm: item.sizeRange.maxHeightMm,
      },
      allowedFinishIds: item.allowedFinishIds,
      allowedAccessoryIds: item.allowedAccessoryIds,
      sortOrder: item.sortOrder,
    }))

    const finishes: readonly AdminFinishRecord[] = this.store.finishes.map((item) => ({
      id: item.id,
      code: item.code,
      status: item.status,
      name: item.name,
      description: item.description,
      sortOrder: item.sortOrder,
    }))

    const colors: readonly AdminColorRecord[] = this.store.colors.map((item) => ({
      id: item.id,
      finishId: item.finishId,
      code: item.code,
      status: item.status,
      name: item.name,
      hex: item.hex,
      sortOrder: item.sortOrder,
    }))

    const accessories: readonly AdminAccessoryRecord[] = this.store.accessories.map((item) => ({
      id: item.id,
      code: item.code,
      category: item.category,
      status: item.status,
      name: item.name,
      description: item.description,
      sortOrder: item.sortOrder,
    }))

    const tariffVersions: readonly AdminTariffVersionRecord[] = this.store
      .listTariffVersions()
      .map((version) => ({
        id: version.id,
        seriesId: version.seriesId,
        versionNumber: version.versionNumber,
        status: version.status,
        strategy: version.strategy,
        validFrom: version.validity.validFrom,
        validUntil: version.validity.validUntil,
        priceCount: priceCountOf(pricingByTariffId.get(version.id)),
      }))

    return { series, finishes, colors, accessories, tariffVersions }
  }
}
