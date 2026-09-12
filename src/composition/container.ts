import type { AdminCatalogReadPort } from '@/application/ports/admin-catalog-reader'
import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { Clock } from '@/application/ports/clock'
import type { EmailSender } from '@/application/ports/email-sender'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { ManualQuoteRequestRepository } from '@/application/ports/manual-quote-request-repository'
import type { QuoteDeliveryRepository } from '@/application/ports/quote-delivery-repository'
import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'
import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'
import type { QuoteNumberSequence } from '@/application/ports/quote-number-sequence'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type { TariffPricingRepository } from '@/application/ports/tariff-pricing-repository'
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'
import { env } from '@/config/env'
import { resolveQuoteDocumentSettings } from '@/config/quote-document'
import { SystemClock } from '@/infrastructure/clock/system-clock'
import { createDemoCatalogStore } from '@/infrastructure/demo/demo-catalog'
import { ConsoleEmailSender } from '@/infrastructure/email/console-email-sender'
import { ResendEmailSender } from '@/infrastructure/email/resend-email-sender'
import { CryptoIdGenerator } from '@/infrastructure/id/crypto-id-generator'
import { InMemoryAdminCatalogReader } from '@/infrastructure/persistence/in-memory/admin-catalog-reader'
import { ReactPdfQuoteRenderer } from '@/infrastructure/pdf/react-pdf-quote-renderer'
import {
  InMemoryAccessoryRepository,
  InMemoryColorRepository,
  InMemoryFinishRepository,
  InMemorySeriesRepository,
  InMemoryTariffPricingRepository,
  InMemoryTariffVersionRepository,
} from '@/infrastructure/persistence/in-memory/catalog-store'
import { InMemoryQuoteDeliveryRepository } from '@/infrastructure/persistence/in-memory/quote-delivery-store'
import {
  InMemoryManualQuoteRequestRepository,
  InMemoryQuoteNumberSequence,
  InMemoryQuoteRepository,
  InMemoryQuoteStore,
} from '@/infrastructure/persistence/in-memory/quote-store'
import { PrismaAdminCatalogReader } from '@/infrastructure/persistence/prisma/admin-catalog-reader'
import { getPrismaClient } from '@/infrastructure/persistence/prisma/client'
import { PrismaQuoteDeliveryRepository } from '@/infrastructure/persistence/prisma/quote-delivery-repository'
import {
  PrismaAccessoryRepository,
  PrismaColorRepository,
  PrismaFinishRepository,
  PrismaManualQuoteRequestRepository,
  PrismaQuoteNumberSequence,
  PrismaQuoteRepository,
  PrismaSeriesRepository,
  PrismaTariffPricingRepository,
  PrismaTariffVersionRepository,
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
  readonly tariffVersionRepository: TariffVersionRepository
  /** Lectura de administración del panel (ADR-0023 §6): catálogo completo, cualquier estado. */
  readonly adminCatalogReader: AdminCatalogReadPort
  readonly quoteRepository: QuoteRepository
  readonly quoteDeliveryRepository: QuoteDeliveryRepository
  readonly manualQuoteRequestRepository: ManualQuoteRequestRepository
  readonly quoteNumberSequence: QuoteNumberSequence
  readonly quoteValidityDays: number
  readonly quotePdfRenderer: QuotePdfRenderer
  readonly emailSender: EmailSender
  /** Datos fiscales, condiciones y destinatarios internos pendientes del propietario (CIF-14). */
  readonly quoteDocumentSettings: QuoteDocumentSettings
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
    tariffVersionRepository: new InMemoryTariffVersionRepository(catalog),
    adminCatalogReader: new InMemoryAdminCatalogReader(catalog),
    quoteRepository: new InMemoryQuoteRepository(quotes),
    quoteDeliveryRepository: new InMemoryQuoteDeliveryRepository(),
    manualQuoteRequestRepository: new InMemoryManualQuoteRequestRepository(quotes),
    quoteNumberSequence: new InMemoryQuoteNumberSequence(quotes),
    quoteValidityDays: env.QUOTE_VALIDITY_DAYS,
    quotePdfRenderer: new ReactPdfQuoteRenderer(),
    emailSender: createEmailSender(),
    quoteDocumentSettings: resolveQuoteDocumentSettings(),
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
    tariffVersionRepository: new PrismaTariffVersionRepository(prisma),
    adminCatalogReader: new PrismaAdminCatalogReader(prisma),
    quoteRepository: new PrismaQuoteRepository(prisma),
    quoteDeliveryRepository: new PrismaQuoteDeliveryRepository(prisma),
    manualQuoteRequestRepository: new PrismaManualQuoteRequestRepository(prisma),
    quoteNumberSequence: new PrismaQuoteNumberSequence(prisma),
    quoteValidityDays: env.QUOTE_VALIDITY_DAYS,
    quotePdfRenderer: new ReactPdfQuoteRenderer(),
    emailSender: createEmailSender(),
    quoteDocumentSettings: resolveQuoteDocumentSettings(),
  }
}

/**
 * Envío de email según lo que haya configurado el propietario (ADR-0004 §4).
 *
 * Sin remitente verificado o sin clave, se usa el adaptador de consola: nunca se intenta un envío
 * real con la configuración a medias (CIF-14). Se avisa en el log —sin datos personales— para que
 * un despliegue en producción sin remitente no pase desapercibido.
 */
function createEmailSender(): EmailSender {
  const { RESEND_FROM: from, RESEND_API_KEY: apiKey } = env

  if (from !== undefined && apiKey !== undefined) {
    return new ResendEmailSender(apiKey, from)
  }

  if (env.NODE_ENV === 'production') {
    console.warn(
      '[email] sin RESEND_FROM y RESEND_API_KEY: los presupuestos no se enviarán por email (adaptador de consola)',
    )
  }

  return new ConsoleEmailSender()
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
