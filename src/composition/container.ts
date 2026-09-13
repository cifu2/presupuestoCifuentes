import type { AdminCatalogReadPort } from '@/application/ports/admin-catalog-reader'
import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type {
  AccessoryWriteRepository,
  CatalogUsageReader,
  ColorWriteRepository,
  FinishWriteRepository,
  SeriesWriteRepository,
} from '@/application/ports/catalog-write-repositories'
import type { Clock } from '@/application/ports/clock'
import type { EmailSender } from '@/application/ports/email-sender'
import type { HealthProbe } from '@/application/ports/health-probe'
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
import { createHealthProbe } from '@/infrastructure/persistence/prisma/health-probe'
import {
  InMemoryAccessoryRepository,
  InMemoryAccessoryWriteRepository,
  InMemoryCatalogUsageReader,
  InMemoryColorRepository,
  InMemoryColorWriteRepository,
  InMemoryFinishRepository,
  InMemoryFinishWriteRepository,
  InMemorySeriesRepository,
  InMemorySeriesWriteRepository,
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
  PrismaAccessoryWriteRepository,
  PrismaCatalogUsageReader,
  PrismaColorRepository,
  PrismaColorWriteRepository,
  PrismaFinishRepository,
  PrismaFinishWriteRepository,
  PrismaManualQuoteRequestRepository,
  PrismaQuoteNumberSequence,
  PrismaQuoteRepository,
  PrismaSeriesRepository,
  PrismaSeriesWriteRepository,
  PrismaTariffPricingRepository,
  PrismaTariffVersionRepository,
} from '@/infrastructure/persistence/prisma/repositories'

import { getProcessSingleton } from './process-singleton'

/**
 * Raíz de composición: único lugar donde se conectan puertos con adaptadores (ADR-0001).
 *
 * Dos modos:
 * - `prisma` cuando hay `DATABASE_URL`: persistencia real en PostgreSQL.
 * - `demo` cuando no la hay (o `CATALOG_DEMO_MODE=true`): catálogo de demostración en memoria, para
 *   desarrollo y E2E sin base de datos. Los presupuestos y solicitudes se pierden al reiniciar.
 *
 * `createContainer()` devuelve **un contenedor por proceso y modo** (`process-singleton.ts`), no uno
 * por grafo de módulos: las páginas (RSC) y las rutas HTTP comparten el mismo catálogo en memoria,
 * que es lo que exige el modo demostración para comportarse como una sola aplicación (CIF-577).
 */
export type CatalogMode = 'prisma' | 'demo'

/** Clave del contenedor de demostración en el registro por proceso (`process-singleton.ts`). */
const DEMO_CONTAINER_KEY = 'catalog:demo'

export interface Container {
  readonly mode: CatalogMode
  readonly clock: Clock
  /**
   * Sonda de salud de la base. `null` en modo demo: la sonda de `/api/health` informa
   * `unconfigured` y nunca devuelve 503 (ADR-0015 §5).
   */
  readonly healthProbe: HealthProbe | null
  readonly idGenerator: IdGenerator
  readonly seriesRepository: SeriesRepository
  readonly finishRepository: FinishRepository
  readonly colorRepository: ColorRepository
  readonly accessoryRepository: AccessoryRepository
  readonly tariffPricingRepository: TariffPricingRepository
  readonly tariffVersionRepository: TariffVersionRepository
  /**
   * Escritura del catálogo (CIF-126a, ADR-0027): *upsert* idempotente por `code` —o
   * `(finishId, code)` en colores— y edición de la tabla de precios de un borrador.
   */
  readonly seriesWriteRepository: SeriesWriteRepository
  readonly finishWriteRepository: FinishWriteRepository
  readonly colorWriteRepository: ColorWriteRepository
  readonly accessoryWriteRepository: AccessoryWriteRepository
  /** Consultas de uso para las guardas de desactivación (tarifa viva, vínculos vivos). */
  readonly catalogUsageReader: CatalogUsageReader
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
    healthProbe: null,
    idGenerator: new CryptoIdGenerator(),
    seriesRepository: new InMemorySeriesRepository(catalog),
    finishRepository: new InMemoryFinishRepository(catalog),
    colorRepository: new InMemoryColorRepository(catalog),
    accessoryRepository: new InMemoryAccessoryRepository(catalog),
    tariffPricingRepository: new InMemoryTariffPricingRepository(catalog),
    tariffVersionRepository: new InMemoryTariffVersionRepository(catalog),
    seriesWriteRepository: new InMemorySeriesWriteRepository(catalog),
    finishWriteRepository: new InMemoryFinishWriteRepository(catalog),
    colorWriteRepository: new InMemoryColorWriteRepository(catalog),
    accessoryWriteRepository: new InMemoryAccessoryWriteRepository(catalog),
    catalogUsageReader: new InMemoryCatalogUsageReader(catalog),
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
    healthProbe: createHealthProbe(connectionString),
    idGenerator: new CryptoIdGenerator(),
    seriesRepository: new PrismaSeriesRepository(prisma),
    finishRepository: new PrismaFinishRepository(prisma),
    colorRepository: new PrismaColorRepository(prisma),
    accessoryRepository: new PrismaAccessoryRepository(prisma),
    tariffPricingRepository: new PrismaTariffPricingRepository(prisma),
    tariffVersionRepository: new PrismaTariffVersionRepository(prisma),
    seriesWriteRepository: new PrismaSeriesWriteRepository(prisma),
    finishWriteRepository: new PrismaFinishWriteRepository(prisma),
    colorWriteRepository: new PrismaColorWriteRepository(prisma),
    accessoryWriteRepository: new PrismaAccessoryWriteRepository(prisma),
    catalogUsageReader: new PrismaCatalogUsageReader(prisma),
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

export function createContainer(): Container {
  const connectionString = env.DATABASE_URL

  // Sin base de datos (o con el interruptor de demo) el catálogo vive en memoria: si cada capa del
  // servidor se quedara con el suyo, el panel no vería lo que publica una ruta HTTP del mismo
  // proceso. El contenedor se memoiza **por proceso**, no por grafo de módulos (CIF-577).
  if (env.CATALOG_DEMO_MODE || connectionString === undefined) {
    return getProcessSingleton(DEMO_CONTAINER_KEY, createDemoContainer)
  }

  return getProcessSingleton(`prisma:${connectionString}`, () =>
    createPrismaContainer(connectionString),
  )
}
