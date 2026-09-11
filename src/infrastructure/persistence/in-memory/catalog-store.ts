/**
 * Adaptadores en memoria del catálogo.
 *
 * Se usan en tests y en el modo demostración (sin base de datos configurada) para que el
 * configurador y las pruebas E2E funcionen sin PostgreSQL. Implementan los mismos puertos que los
 * adaptadores Prisma, así que el resto de la aplicación no nota la diferencia.
 */

import type { Accessory } from '@/domain/catalog/accessory'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'
import type { DoorSeries } from '@/domain/catalog/series'
import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type {
  TariffPricing,
  TariffPricingRepository,
} from '@/application/ports/tariff-pricing-repository'

export interface CatalogStoreSnapshot {
  readonly series: readonly DoorSeries[]
  readonly finishes: readonly Finish[]
  readonly colors: readonly Color[]
  readonly accessories: readonly Accessory[]
  readonly pricing: readonly TariffPricing[]
}

export class InMemoryCatalogStore {
  readonly series: readonly DoorSeries[]
  readonly finishes: readonly Finish[]
  readonly colors: readonly Color[]
  readonly accessories: readonly Accessory[]
  readonly pricing: readonly TariffPricing[]

  constructor(snapshot: CatalogStoreSnapshot) {
    this.series = [...snapshot.series]
    this.finishes = [...snapshot.finishes]
    this.colors = [...snapshot.colors]
    this.accessories = [...snapshot.accessories]
    this.pricing = [...snapshot.pricing]
  }
}

export class InMemorySeriesRepository implements SeriesRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findPublishedBySlug(slug: string): Promise<DoorSeries | null> {
    return this.store.series.find((series) => series.slug === slug && series.isPublished()) ?? null
  }

  async findById(id: string): Promise<DoorSeries | null> {
    return this.store.series.find((series) => series.id === id) ?? null
  }

  async listPublished(): Promise<readonly DoorSeries[]> {
    return this.store.series
      .filter((series) => series.isPublished())
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
  }
}

export class InMemoryFinishRepository implements FinishRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findById(id: string): Promise<Finish | null> {
    return this.store.finishes.find((finish) => finish.id === id) ?? null
  }

  async listPublished(): Promise<readonly Finish[]> {
    return this.store.finishes.filter((finish) => finish.isPublished())
  }

  async listPublishedByIds(ids: readonly string[]): Promise<readonly Finish[]> {
    const wanted = new Set(ids)

    return this.store.finishes.filter((finish) => finish.isPublished() && wanted.has(finish.id))
  }
}

export class InMemoryColorRepository implements ColorRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findById(id: string): Promise<Color | null> {
    return this.store.colors.find((color) => color.id === id) ?? null
  }

  async listPublishedByFinishId(finishId: string): Promise<readonly Color[]> {
    return this.store.colors
      .filter((color) => color.finishId === finishId && color.isPublished())
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
  }
}

export class InMemoryAccessoryRepository implements AccessoryRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findById(id: string): Promise<Accessory | null> {
    return this.store.accessories.find((accessory) => accessory.id === id) ?? null
  }

  async listPublished(): Promise<readonly Accessory[]> {
    return this.store.accessories.filter((accessory) => accessory.isPublished())
  }

  async listPublishedByIds(ids: readonly string[]): Promise<readonly Accessory[]> {
    const wanted = new Set(ids)

    return this.store.accessories.filter(
      (accessory) => accessory.isPublished() && wanted.has(accessory.id),
    )
  }
}

export class InMemoryTariffPricingRepository implements TariffPricingRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findInForce(seriesId: string, instant: Date): Promise<TariffPricing | null> {
    const fromSeries = this.store.pricing.filter((entry) => entry.tariff.seriesId === seriesId)

    return fromSeries.find((entry) => entry.tariff.isInForceAt(instant)) ?? null
  }

  async listBySeriesId(seriesId: string): Promise<readonly TariffPricing[]> {
    return this.store.pricing.filter((entry) => entry.tariff.seriesId === seriesId)
  }
}
