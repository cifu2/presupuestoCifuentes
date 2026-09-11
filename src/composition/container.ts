import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { ManualQuoteRequestRepository } from '@/application/ports/manual-quote-request-repository'
import type { QuoteNumberSequence } from '@/application/ports/quote-number-sequence'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type { TariffPricingRepository } from '@/application/ports/tariff-pricing-repository'
import { env } from '@/config/env'
import { SystemClock } from '@/infrastructure/clock/system-clock'
import { createDemoCatalogStore } from '@/infrastructure/demo/demo-catalog'
import { CryptoIdGenerator } from '@/infrastructure/id/crypto-id-generator'
import {
  InMemoryAccessoryRepository,
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
import { getPrismaClient } from '@/infrastructure/persistence/prisma/client'
import {
  PrismaAccessoryRepository,
  PrismaColorRepository,
  PrismaFinishRepository,
  PrismaManualQuoteRequestRepository,
  PrismaQuoteNumberSequence,
  PrismaQuoteRepository,
  PrismaSeriesRepository,
  PrismaTariffPricingRepository,
} from '@/infrastructure/persistence/prisma/repositories'

/**
 * Raíz de composición: único lugar donde se conectan puertos con adaptadores (ADR-0001).
 *
 * Dos modos:
 * - `prisma` cuando hay `DATABASE_URL`: persistencia real en PostgreSQL.
 * - `demo` cuando no la hay (o `CATALOG_DEMO_MODE=true`): catálogo de demostración en memoria, para
 *   desarrollo y E2E sin base de datos. Los presupuestos y solicitudes se pierden al reiniciar.
 */
export type CatalogMode = 'prisma' | 'demo'

export interface Container {
  readonly mode: CatalogMode
  readonly clock: Clock
  readonly idGenerator: IdGenerator
  readonly seriesRepository: SeriesRepository
  readonly finishRepository: FinishRepository
  readonly colorRepository: ColorRepository
  readonly accessoryRepository: AccessoryRepository
  readonly tariffPricingRepository: TariffPricingRepository
  readonly quoteRepository: QuoteRepository
  readonly manualQuoteRequestRepository: ManualQuoteRequestRepository
  readonly quoteNumberSequence: QuoteNumberSequence
  readonly quoteValidityDays: number
}

function createDemoContainer(): Container {
  const catalog = createDemoCatalogStore()
  const quotes = new InMemoryQuoteStore()

  return {
    mode: 'demo',
    clock: new SystemClock(),
    idGenerator: new CryptoIdGenerator(),
    seriesRepository: new InMemorySeriesRepository(catalog),
    finishRepository: new InMemoryFinishRepository(catalog),
    colorRepository: new InMemoryColorRepository(catalog),
    accessoryRepository: new InMemoryAccessoryRepository(catalog),
    tariffPricingRepository: new InMemoryTariffPricingRepository(catalog),
    quoteRepository: new InMemoryQuoteRepository(quotes),
    manualQuoteRequestRepository: new InMemoryManualQuoteRequestRepository(quotes),
    quoteNumberSequence: new InMemoryQuoteNumberSequence(quotes),
    quoteValidityDays: env.QUOTE_VALIDITY_DAYS,
  }
}

function createPrismaContainer(connectionString: string): Container {
  const prisma = getPrismaClient(connectionString)

  return {
    mode: 'prisma',
    clock: new SystemClock(),
    idGenerator: new CryptoIdGenerator(),
    seriesRepository: new PrismaSeriesRepository(prisma),
    finishRepository: new PrismaFinishRepository(prisma),
    colorRepository: new PrismaColorRepository(prisma),
    accessoryRepository: new PrismaAccessoryRepository(prisma),
    tariffPricingRepository: new PrismaTariffPricingRepository(prisma),
    quoteRepository: new PrismaQuoteRepository(prisma),
    manualQuoteRequestRepository: new PrismaManualQuoteRequestRepository(prisma),
    quoteNumberSequence: new PrismaQuoteNumberSequence(prisma),
    quoteValidityDays: env.QUOTE_VALIDITY_DAYS,
  }
}

let cached: Container | null = null
let cachedKey: string | null = null

export function createContainer(): Container {
  const useDemo = env.CATALOG_DEMO_MODE || !env.DATABASE_URL
  const key = useDemo ? 'demo' : `prisma:${env.DATABASE_URL}`

  if (cached !== null && cachedKey === key) {
    return cached
  }

  cached =
    useDemo || !env.DATABASE_URL ? createDemoContainer() : createPrismaContainer(env.DATABASE_URL)
  cachedKey = key

  return cached
}
