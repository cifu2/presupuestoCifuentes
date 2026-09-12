/**
 * Adaptadores en memoria del catálogo.
 *
 * Se usan en tests y en el modo demostración (sin base de datos configurada) para que el
 * configurador y las pruebas E2E funcionen sin PostgreSQL. Implementan los mismos puertos que los
 * adaptadores Prisma, así que el resto de la aplicación no nota la diferencia.
 *
 * El almacén guarda listas mutables por colección y expone vistas de solo lectura: la escritura
 * (upsert por `code`, archivar, editar la tabla de precios) pasa siempre por métodos del almacén, de
 * modo que los índices y los vínculos entre colecciones se mantengan coherentes.
 */

import type { Accessory } from '@/domain/catalog/accessory'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'
import type { DoorSeries } from '@/domain/catalog/series'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import type { PriceTable } from '@/domain/pricing/price-table'
import { ConflictError } from '@/domain/shared/errors'
import type {
  AccessoryWriteRepository,
  CatalogUsageReader,
  ColorWriteRepository,
  FinishWriteRepository,
  SeriesWriteRepository,
} from '@/application/ports/catalog-write-repositories'
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
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'

export interface CatalogStoreSnapshot {
  readonly series: readonly DoorSeries[]
  readonly finishes: readonly Finish[]
  readonly colors: readonly Color[]
  readonly accessories: readonly Accessory[]
  readonly pricing: readonly TariffPricing[]
  /** Versiones de tarifa sin tabla de precios (borradores del panel); por defecto, las de `pricing`. */
  readonly tariffVersions?: readonly TariffVersion[]
}

export class InMemoryCatalogStore {
  private readonly seriesItems: DoorSeries[]
  private readonly finishItems: Finish[]
  private readonly colorItems: Color[]
  private readonly accessoryItems: Accessory[]
  private readonly pricingItems: TariffPricing[]
  private readonly versions: TariffVersion[]

  constructor(snapshot: CatalogStoreSnapshot) {
    this.seriesItems = [...snapshot.series]
    this.finishItems = [...snapshot.finishes]
    this.colorItems = [...snapshot.colors]
    this.accessoryItems = [...snapshot.accessories]
    this.pricingItems = [...snapshot.pricing]
    this.versions =
      snapshot.tariffVersions === undefined
        ? this.pricingItems.map((entry) => entry.tariff)
        : [...snapshot.tariffVersions]
  }

  get series(): readonly DoorSeries[] {
    return this.seriesItems
  }

  get finishes(): readonly Finish[] {
    return this.finishItems
  }

  get colors(): readonly Color[] {
    return this.colorItems
  }

  get accessories(): readonly Accessory[] {
    return this.accessoryItems
  }

  get pricing(): readonly TariffPricing[] {
    return this.pricingItems
  }

  findTariffVersion(id: string): TariffVersion | null {
    return this.versions.find((version) => version.id === id) ?? null
  }

  listTariffVersions(): readonly TariffVersion[] {
    return this.versions
  }

  /** Alta o actualización de una versión; si tiene tabla de precios, la mantiene enlazada. */
  upsertTariffVersion(version: TariffVersion): void {
    const index = this.versions.findIndex((candidate) => candidate.id === version.id)

    if (index === -1) {
      this.versions.push(version)
    } else {
      this.versions[index] = version
    }

    const pricingIndex = this.pricingItems.findIndex((entry) => entry.tariff.id === version.id)
    const pricingEntry = this.pricingItems[pricingIndex]

    if (pricingIndex !== -1 && pricingEntry !== undefined) {
      this.pricingItems[pricingIndex] = { ...pricingEntry, tariff: version }
    }
  }

  upsertPriceTable(priceTable: PriceTable): void {
    const tariff = this.findTariffVersion(priceTable.tariffVersionId)

    if (tariff === null) {
      throw new Error(
        `No existe la versión de tarifa "${priceTable.tariffVersionId}" a la que pertenece la tabla`,
      )
    }

    const index = this.pricingItems.findIndex(
      (entry) => entry.tariff.id === priceTable.tariffVersionId,
    )

    if (index === -1) {
      this.pricingItems.push({ tariff, priceTable })
    } else {
      this.pricingItems[index] = { tariff, priceTable }
    }
  }

  upsertSeries(series: DoorSeries): void {
    upsertById(this.seriesItems, series)
  }

  upsertFinish(finish: Finish): void {
    upsertById(this.finishItems, finish)
  }

  upsertColor(color: Color): void {
    upsertById(this.colorItems, color)
  }

  upsertAccessory(accessory: Accessory): void {
    upsertById(this.accessoryItems, accessory)
  }

  /** Una serie tiene precio vivo si alguna de sus versiones está publicada y vigente. */
  seriesHasTariffInForce(seriesId: string, instant: Date): boolean {
    return this.versions.some(
      (version) => version.seriesId === seriesId && version.isInForceAt(instant),
    )
  }

  isFinishAllowedByLiveSeries(finishId: string): boolean {
    return this.seriesItems.some(
      (series) => series.status !== 'archived' && series.allowsFinish(finishId),
    )
  }

  isAccessoryAllowedByLiveSeries(accessoryId: string): boolean {
    return this.seriesItems.some(
      (series) => series.status !== 'archived' && series.allowsAccessory(accessoryId),
    )
  }

  finishHasLiveColors(finishId: string): boolean {
    return this.colorItems.some(
      (color) => color.finishId === finishId && color.status !== 'archived',
    )
  }
}

function upsertById<T extends { readonly id: string }>(items: T[], item: T): void {
  const index = items.findIndex((candidate) => candidate.id === item.id)

  if (index === -1) {
    items.push(item)
  } else {
    items[index] = item
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

export class InMemorySeriesWriteRepository implements SeriesWriteRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findByCode(code: string): Promise<DoorSeries | null> {
    return this.store.series.find((series) => series.code === code) ?? null
  }

  async findBySlug(slug: string): Promise<DoorSeries | null> {
    return this.store.series.find((series) => series.slug === slug) ?? null
  }

  async save(series: DoorSeries): Promise<void> {
    this.store.upsertSeries(series)
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

export class InMemoryFinishWriteRepository implements FinishWriteRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findByCode(code: string): Promise<Finish | null> {
    return this.store.finishes.find((finish) => finish.code === code) ?? null
  }

  async save(finish: Finish): Promise<void> {
    this.store.upsertFinish(finish)
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

export class InMemoryColorWriteRepository implements ColorWriteRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findByFinishIdAndCode(finishId: string, code: string): Promise<Color | null> {
    return (
      this.store.colors.find((color) => color.finishId === finishId && color.code === code) ?? null
    )
  }

  async save(color: Color): Promise<void> {
    this.store.upsertColor(color)
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

export class InMemoryAccessoryWriteRepository implements AccessoryWriteRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findByCode(code: string): Promise<Accessory | null> {
    return this.store.accessories.find((accessory) => accessory.code === code) ?? null
  }

  async save(accessory: Accessory): Promise<void> {
    this.store.upsertAccessory(accessory)
  }
}

export class InMemoryCatalogUsageReader implements CatalogUsageReader {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async seriesHasTariffInForce(seriesId: string, instant: Date): Promise<boolean> {
    return this.store.seriesHasTariffInForce(seriesId, instant)
  }

  async isFinishAllowedByLiveSeries(finishId: string): Promise<boolean> {
    return this.store.isFinishAllowedByLiveSeries(finishId)
  }

  async isAccessoryAllowedByLiveSeries(accessoryId: string): Promise<boolean> {
    return this.store.isAccessoryAllowedByLiveSeries(accessoryId)
  }

  async finishHasLiveColors(finishId: string): Promise<boolean> {
    return this.store.finishHasLiveColors(finishId)
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

export class InMemoryTariffVersionRepository implements TariffVersionRepository {
  constructor(private readonly store: InMemoryCatalogStore) {}

  async findById(id: string): Promise<TariffVersion | null> {
    return this.store.findTariffVersion(id)
  }

  async listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
    return this.store.listTariffVersions().filter((version) => version.seriesId === seriesId)
  }

  async create(version: TariffVersion): Promise<void> {
    const alreadyExists = this.store
      .listTariffVersions()
      .some(
        (candidate) =>
          candidate.seriesId === version.seriesId &&
          candidate.versionNumber === version.versionNumber,
      )

    if (alreadyExists) {
      throw new ConflictError(
        `La serie "${version.seriesId}" ya tiene una versión de tarifa con el número ${version.versionNumber}`,
      )
    }

    this.store.upsertTariffVersion(version)
  }

  async save(version: TariffVersion): Promise<void> {
    this.store.upsertTariffVersion(version)
  }

  async findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
    return (
      this.store.pricing.find((entry) => entry.tariff.id === tariffVersionId)?.priceTable ?? null
    )
  }

  async savePriceTable(priceTable: PriceTable): Promise<void> {
    this.store.upsertPriceTable(priceTable)
  }
}
