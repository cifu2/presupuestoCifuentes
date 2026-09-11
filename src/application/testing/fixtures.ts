/**
 * Mundo de pruebas de la capa de aplicación: puertos doblados en memoria con datos explícitos.
 *
 * Se exporta desde `testing/` y queda fuera de la cobertura (es andamiaje). Reutiliza los
 * adaptadores en memoria de infraestructura, que implementan los mismos puertos que los de Prisma.
 */

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { SizeRange } from '@/domain/catalog/measurement'
import type { DoorSeries } from '@/domain/catalog/series'
import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'

import {
  InMemoryAccessoryRepository,
  InMemoryCatalogStore,
  InMemoryColorRepository,
  InMemoryFinishRepository,
  InMemorySeriesRepository,
  InMemoryTariffPricingRepository,
} from '@/infrastructure/persistence/in-memory/catalog-store'
import {
  InMemoryManualQuoteRequestRepository,
  InMemoryQuoteNumberSequence,
  InMemoryQuoteRepository,
  InMemoryQuoteStore,
} from '@/infrastructure/persistence/in-memory/quote-store'

import {
  makeAccessory,
  makeColor,
  makeDimensions,
  makeFinish,
  makeSeries,
  makeTariffVersion,
  TEST_NOW,
} from '@/domain/catalog/testing/factories'
import { Money } from '@/domain/shared/money'
import { makeModifier, makePriceTable } from '@/domain/pricing/testing/factories'

export const TEST_SERIES_ID = 'series-ci-100'
export const TEST_SERIES_SLUG = 'ci-100'
export const TEST_NO_TARIFF_SLUG = 'ci-400'
export const TEST_TARIFF_ID = 'tariff-ci-100-v1'

export class FixedClock implements Clock {
  constructor(private readonly instant: Date = TEST_NOW) {}

  now(): Date {
    return this.instant
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0

  nextId(): string {
    this.counter += 1

    return `id-${this.counter}`
  }
}

export interface TestWorld {
  readonly clock: FixedClock
  readonly idGenerator: SequentialIdGenerator
  readonly catalog: InMemoryCatalogStore
  readonly quotes: InMemoryQuoteStore
  readonly seriesRepository: InMemorySeriesRepository
  readonly finishRepository: InMemoryFinishRepository
  readonly colorRepository: InMemoryColorRepository
  readonly accessoryRepository: InMemoryAccessoryRepository
  readonly tariffPricingRepository: InMemoryTariffPricingRepository
  readonly quoteRepository: InMemoryQuoteRepository
  readonly manualQuoteRequestRepository: InMemoryManualQuoteRequestRepository
  readonly quoteNumberSequence: InMemoryQuoteNumberSequence
}

export interface TestWorldOptions {
  readonly extraSeries?: readonly DoorSeries[]
}

export function makeTestWorld(options: TestWorldOptions = {}): TestWorld {
  const lacado = makeFinish({
    id: 'finish-lacado',
    name: LocalizedText.of({ es: 'Lacado', en: 'Lacquered' }),
  })
  const archivado = makeFinish({ id: 'finish-retirado', code: 'RETIRADO', status: 'archived' })
  const color = makeColor({ id: 'color-ral-9010', finishId: lacado.id })
  const accessory = makeAccessory({ id: 'accessory-manilla' })

  const series = makeSeries({
    id: TEST_SERIES_ID,
    slug: TEST_SERIES_SLUG,
    name: LocalizedText.of({ es: 'Serie CI-100', en: 'CI-100 series' }),
    allowedFinishIds: [lacado.id, archivado.id],
    allowedAccessoryIds: [accessory.id],
  })

  const seriesSinTarifa = makeSeries({
    id: 'series-ci-400',
    code: 'CI-400',
    slug: TEST_NO_TARIFF_SLUG,
    sizeRange: SizeRange.of({
      minWidthMm: 600,
      maxWidthMm: 1000,
      minHeightMm: 1800,
      maxHeightMm: 2200,
    }),
    allowedFinishIds: [],
    allowedAccessoryIds: [],
    sortOrder: 2,
  })

  const catalog = new InMemoryCatalogStore({
    series: [series, seriesSinTarifa, ...(options.extraSeries ?? [])],
    finishes: [lacado, archivado],
    colors: [color],
    accessories: [accessory],
    pricing: [
      {
        tariff: makeTariffVersion({ id: TEST_TARIFF_ID, seriesId: series.id }),
        priceTable: makePriceTable({
          tariffVersionId: TEST_TARIFF_ID,
          perSquareMetre: Money.fromDecimalString('400'),
          modifiers: [
            makeModifier({
              id: 'modifier-instalacion',
              code: 'INSTALACION',
              target: 'installation',
              amount: Money.fromDecimalString('180'),
            }),
            makeModifier({
              id: 'modifier-manilla',
              code: 'MANILLA',
              kind: 'per_unit',
              target: 'accessory',
              targetId: accessory.id,
              amount: Money.fromDecimalString('32'),
            }),
            makeModifier({
              id: 'modifier-promo',
              code: 'PROMO10',
              kind: 'percentage',
              target: 'discount',
              targetId: 'PROMO10',
              amount: null,
              percentage: '10',
            }),
          ],
        }),
      },
    ],
  })

  const quotes = new InMemoryQuoteStore()

  return {
    clock: new FixedClock(),
    idGenerator: new SequentialIdGenerator(),
    catalog,
    quotes,
    seriesRepository: new InMemorySeriesRepository(catalog),
    finishRepository: new InMemoryFinishRepository(catalog),
    colorRepository: new InMemoryColorRepository(catalog),
    accessoryRepository: new InMemoryAccessoryRepository(catalog),
    tariffPricingRepository: new InMemoryTariffPricingRepository(catalog),
    quoteRepository: new InMemoryQuoteRepository(quotes),
    manualQuoteRequestRepository: new InMemoryManualQuoteRequestRepository(quotes),
    quoteNumberSequence: new InMemoryQuoteNumberSequence(quotes),
  }
}

export function makePriceInput(): {
  widthMm: number
  heightMm: number
  finishId: string | null
  colorId: string | null
  accessoryIds: readonly string[]
  extras: readonly ('installation' | 'shipping' | 'urgency')[]
  discountCode: string | null
} {
  return {
    widthMm: 900,
    heightMm: 2100,
    finishId: null,
    colorId: null,
    accessoryIds: [],
    extras: [],
    discountCode: null,
  }
}

export { makeDimensions }
