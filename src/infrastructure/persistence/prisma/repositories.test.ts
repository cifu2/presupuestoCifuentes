/**
 * Test de integración de los adaptadores Prisma contra PostgreSQL real.
 *
 * Se ejecuta cuando existe `TEST_DATABASE_URL` (base de datos de test con las migraciones
 * aplicadas: `DATABASE_URL=$TEST_DATABASE_URL pnpm db:deploy`). En CI, QA/DevOps añaden el
 * servicio `postgres` y la variable (CIF-10/CIF-11).
 */

import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { ManualQuoteRequest } from '@/domain/catalog/manual-quote-request'
import { Dimensions } from '@/domain/catalog/measurement'
import { QuoteDelivery, quoteDeliveryKey } from '@/domain/quote/quote-delivery'
import type { Quote } from '@/domain/quote/quote'
import type { QuoteDocument } from '@/domain/quote/quote-document'
import {
  AmbiguousTariffError,
  ConflictError,
  EmptyPriceTableError,
  ItemInUseError,
  SeriesInUseError,
  TariffVersionNotEditableError,
} from '@/domain/shared/errors'
import { makeSeries } from '@/domain/catalog/testing/factories'
import { CurrentInstantClock } from '@/infrastructure/clock/system-clock'

import { QUOTE_DELIVERY_CLAIM_LEASE_MS } from '@/application/ports/quote-delivery-repository'
import type { EmailMessage, EmailSender } from '@/application/ports/email-sender'
import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'
import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'
import { calculatePrice } from '@/application/use-cases/calculate-price'
import { createAdminCatalogUseCase } from '@/application/use-cases/get-admin-catalog'
import {
  deliverQuote,
  retryQuoteDeliveries,
  type DeliverQuoteDeps,
} from '@/application/use-cases/deliver-quote'
import { issueQuote } from '@/application/use-cases/issue-quote'
import { publishTariffVersion } from '@/application/use-cases/publish-tariff-version'
import { deactivateCatalogItem } from '@/application/use-cases/deactivate-catalog-item'
import { deactivateSeries } from '@/application/use-cases/deactivate-series'
import { updateSeries } from '@/application/use-cases/update-series'
import { updateTariffPrice } from '@/application/use-cases/update-tariff-price'
import { upsertAccessory } from '@/application/use-cases/upsert-accessory'
import { upsertColor } from '@/application/use-cases/upsert-color'
import { upsertFinish } from '@/application/use-cases/upsert-finish'
import { upsertSeries } from '@/application/use-cases/upsert-series'
import { PrismaAdminCatalogReader } from './admin-catalog-reader'
import { createPrismaClient } from './client'
import { PrismaQuoteDeliveryRepository } from './quote-delivery-repository'
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
  isPublishedTariffOverlapViolation,
} from './repositories'
import type { PrismaClient } from '@prisma/client'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

const IDS = {
  series: '11111111-1111-7111-8111-111111111111',
  finish: '22222222-2222-7222-8222-222222222222',
  color: '33333333-3333-7333-8333-333333333333',
  accessory: '44444444-4444-7444-8444-444444444444',
  tariff: '55555555-5555-7555-8555-555555555555',
  tariffAuto: '55555555-5555-7555-8555-555555555556',
  tariffDraft: '55555555-5555-7555-8555-555555555557',
  tariffDraftSave: '55555555-5555-7555-8555-555555555558',
  raceSeries: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
  tariffRaceA: '55555555-5555-7555-8555-555555555561',
  tariffRaceC: '55555555-5555-7555-8555-555555555562',
  band: '66666666-6666-7666-8666-666666666666',
  modifier: '77777777-7777-7777-8777-777777777777',
  modifierDiscount: '88888888-8888-7888-8888-888888888888',
  modifierAutoDiscount: '99999999-9999-7999-8999-999999999999',
} as const

/** Todos los códigos de error del grafo del error (`meta.driverAdapterError` incluido). */
function errorCodes(error: unknown): string[] {
  const codes = new Set<string>()
  const visited = new Set<unknown>()

  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || typeof value !== 'object' || value === null || visited.has(value)) return

    visited.add(value)

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'string') {
        if (key === 'code' || key === 'originalCode' || key === 'sqlState') codes.add(child)
        continue
      }

      if (typeof child === 'object' && child !== null) visit(child, depth + 1)
    }
  }

  visit(error, 0)

  return [...codes]
}

async function clean(prisma: PrismaClient): Promise<void> {
  await prisma.quoteLine.deleteMany({})
  await prisma.quote.deleteMany({})
  await prisma.manualQuoteRequest.deleteMany({})
  await prisma.tariffVersion.deleteMany({
    where: {
      id: {
        in: [
          IDS.tariff,
          IDS.tariffAuto,
          IDS.tariffDraft,
          IDS.tariffDraftSave,
          IDS.tariffRaceA,
          IDS.tariffRaceC,
        ],
      },
    },
  })
  await prisma.doorSeries.deleteMany({ where: { id: { in: [IDS.series, IDS.raceSeries] } } })
  await prisma.catalogText.deleteMany({})
  await prisma.finish.deleteMany({ where: { id: IDS.finish } })
  await prisma.accessory.deleteMany({ where: { id: IDS.accessory } })
}

async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.finish.create({
    data: {
      id: IDS.finish,
      code: `LACADO-${IDS.finish.slice(0, 4)}`,
      status: 'PUBLISHED',
      sortOrder: 1,
    },
  })

  await prisma.color.create({
    data: {
      id: IDS.color,
      finishId: IDS.finish,
      code: 'RAL-9010',
      hex: '#F1EDE1',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
  })

  await prisma.accessory.create({
    data: {
      id: IDS.accessory,
      code: 'MANILLA-A',
      category: 'HARDWARE',
      status: 'PUBLISHED',
      sortOrder: 1,
    },
  })

  await prisma.doorSeries.create({
    data: {
      id: IDS.series,
      code: 'CI-INTEGRACION',
      slug: 'ci-integracion',
      status: 'PUBLISHED',
      minWidthMm: 600,
      maxWidthMm: 1000,
      minHeightMm: 1800,
      maxHeightMm: 2200,
      sortOrder: 1,
      finishLinks: { create: [{ finishId: IDS.finish }] },
      accessoryLinks: { create: [{ accessoryId: IDS.accessory }] },
    },
  })

  await prisma.catalogText.createMany({
    data: [
      {
        entityType: 'SERIES',
        entityId: IDS.series,
        field: 'NAME',
        locale: 'es',
        value: 'Serie de integración',
      },
      {
        entityType: 'SERIES',
        entityId: IDS.series,
        field: 'NAME',
        locale: 'en',
        value: 'Integration series',
      },
      {
        entityType: 'FINISH',
        entityId: IDS.finish,
        field: 'NAME',
        locale: 'es',
        value: 'Lacado',
      },
      {
        entityType: 'COLOR',
        entityId: IDS.color,
        field: 'NAME',
        locale: 'es',
        value: 'Blanco puro',
      },
      {
        entityType: 'ACCESSORY',
        entityId: IDS.accessory,
        field: 'NAME',
        locale: 'es',
        value: 'Manilla de acero',
      },
    ],
  })

  await prisma.tariffVersion.create({
    data: {
      id: IDS.tariff,
      seriesId: IDS.series,
      versionNumber: 1,
      status: 'PUBLISHED',
      strategy: 'PER_SQUARE_METRE',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      // La v1 termina donde empieza la v2: dos versiones publicadas de la misma serie no pueden
      // solaparse (invariante que la base de datos refuerza desde CIF-89).
      validUntil: new Date('2027-01-01T00:00:00.000Z'),
      taxRatePercent: '21',
      currency: 'EUR',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      priceTable: {
        create: {
          perSquareMetreCents: 40_000n,
          modifiers: {
            create: [
              {
                id: IDS.modifier,
                code: 'INSTALACION',
                kind: 'FIXED',
                target: 'INSTALLATION',
                amountCents: 18_000n,
                sortOrder: 1,
              },
              {
                // El código del modificador difiere del código de descuento: el motor debe leer
                // `discount_code`, no `code` (CIF-74, B2).
                id: IDS.modifierDiscount,
                code: 'PROMO10-10PCT',
                kind: 'PERCENTAGE',
                target: 'DISCOUNT',
                discountCode: 'PROMO10',
                percentage: '10',
                sortOrder: 2,
              },
            ],
          },
        },
      },
    },
  })

  // Tarifa futura (fuera de vigencia) con un descuento automático: su código de descuento es nulo.
  await prisma.tariffVersion.create({
    data: {
      id: IDS.tariffAuto,
      seriesId: IDS.series,
      versionNumber: 2,
      status: 'PUBLISHED',
      strategy: 'PER_SQUARE_METRE',
      validFrom: new Date('2027-01-01T00:00:00.000Z'),
      // Termina donde empieza `tariffDraftSave`: al publicarlo, las dos vigencias son adyacentes y
      // la restricción de exclusión no se dispara (CIF-89).
      validUntil: new Date('2028-01-01T00:00:00.000Z'),
      taxRatePercent: '21',
      currency: 'EUR',
      publishedAt: new Date('2027-01-01T00:00:00.000Z'),
      priceTable: {
        create: {
          perSquareMetreCents: 42_000n,
          modifiers: {
            create: [
              {
                id: IDS.modifierAutoDiscount,
                code: 'PROMO-AUTO',
                kind: 'PERCENTAGE',
                target: 'DISCOUNT',
                discountCode: null,
                percentage: '5',
                sortOrder: 1,
              },
            ],
          },
        },
      },
    },
  })

  // Borradores del panel: `tariffDraft` se solapa con la publicada v1 (para el 409 de CIF-82);
  // `tariffDraftSave` sirve para comprobar que `save` persiste el paso a publicada.
  await prisma.tariffVersion.createMany({
    data: [
      {
        id: IDS.tariffDraft,
        seriesId: IDS.series,
        versionNumber: 3,
        status: 'DRAFT',
        strategy: 'PER_SQUARE_METRE',
        validFrom: new Date('2026-06-01T00:00:00.000Z'),
        taxRatePercent: '21',
        currency: 'EUR',
      },
      {
        id: IDS.tariffDraftSave,
        seriesId: IDS.series,
        versionNumber: 4,
        status: 'DRAFT',
        strategy: 'PER_SQUARE_METRE',
        validFrom: new Date('2028-01-01T00:00:00.000Z'),
        taxRatePercent: '21',
        currency: 'EUR',
      },
    ],
  })

  // Serie sin ninguna tarifa publicada: sirve para provocar de verdad la carrera de dos
  // publicaciones concurrentes (CIF-89). Los dos borradores se solapan entre sí.
  await prisma.doorSeries.create({
    data: {
      id: IDS.raceSeries,
      code: 'CI-CARRERA',
      slug: 'ci-carrera',
      status: 'PUBLISHED',
      minWidthMm: 600,
      maxWidthMm: 1000,
      minHeightMm: 1800,
      maxHeightMm: 2200,
      sortOrder: 2,
    },
  })

  await prisma.tariffVersion.createMany({
    data: [
      {
        id: IDS.tariffRaceA,
        seriesId: IDS.raceSeries,
        versionNumber: 1,
        status: 'DRAFT',
        strategy: 'PER_SQUARE_METRE',
        validFrom: new Date('2026-03-01T00:00:00.000Z'),
        validUntil: new Date('2027-01-01T00:00:00.000Z'),
        taxRatePercent: '21',
        currency: 'EUR',
      },
      {
        id: IDS.tariffRaceC,
        seriesId: IDS.raceSeries,
        versionNumber: 2,
        status: 'DRAFT',
        strategy: 'PER_SQUARE_METRE',
        validFrom: new Date('2026-06-01T00:00:00.000Z'),
        validUntil: new Date('2027-06-01T00:00:00.000Z'),
        taxRatePercent: '21',
        currency: 'EUR',
      },
    ],
  })

  // `createMany` no anida relaciones, y las dos publicaciones de la carrera pasan por el caso de
  // uso: sin tabla de precios no se publican (ADR-0027 §4).
  await prisma.tariffPriceTable.createMany({
    data: [
      { tariffVersionId: IDS.tariffRaceA, perSquareMetreCents: 40_000n },
      { tariffVersionId: IDS.tariffRaceC, perSquareMetreCents: 41_000n },
    ],
  })
}

describe.runIf(TEST_DATABASE_URL !== undefined)(
  'adaptadores Prisma (integración con PostgreSQL)',
  () => {
    const prisma = createPrismaClient(TEST_DATABASE_URL ?? '')
    const seriesRepository = new PrismaSeriesRepository(prisma)
    const finishRepository = new PrismaFinishRepository(prisma)
    const colorRepository = new PrismaColorRepository(prisma)
    const accessoryRepository = new PrismaAccessoryRepository(prisma)
    const tariffPricingRepository = new PrismaTariffPricingRepository(prisma)
    const quoteRepository = new PrismaQuoteRepository(prisma)
    const manualQuoteRequestRepository = new PrismaManualQuoteRequestRepository(prisma)
    const quoteNumberSequence = new PrismaQuoteNumberSequence(prisma)
    const clock = new CurrentInstantClock(new Date('2026-09-11T10:00:00.000Z'))

    beforeAll(async () => {
      await clean(prisma)
      await seed(prisma)
    })

    afterAll(async () => {
      await clean(prisma)
      await prisma.$disconnect()
    })

    it('lee la serie publicada con sus textos y compatibilidades', async () => {
      const series = await seriesRepository.findPublishedBySlug('ci-integracion')

      expect(series).not.toBeNull()
      expect(series?.name.resolve('en')).toBe('Integration series')
      expect(series?.allowedFinishIds).toEqual([IDS.finish])
      expect(series?.allowedAccessoryIds).toEqual([IDS.accessory])
      expect(series?.maxWidthMm).toBe(1000)
    })

    it('lee acabados, colores y accesorios publicados', async () => {
      const [finishes, colors, accessories] = await Promise.all([
        finishRepository.listPublishedByIds([IDS.finish]),
        colorRepository.listPublishedByFinishId(IDS.finish),
        accessoryRepository.listPublishedByIds([IDS.accessory]),
      ])

      expect(finishes[0]?.name.resolve('es')).toBe('Lacado')
      expect(colors[0]?.hex).toBe('#F1EDE1')
      expect(accessories[0]?.code).toBe('MANILLA-A')
    })

    it('resuelve la tarifa vigente con su tabla de precios y modificadores', async () => {
      const pricing = await tariffPricingRepository.findInForce(
        IDS.series,
        new Date('2026-09-11T10:00:00.000Z'),
      )

      expect(pricing?.tariff.versionNumber).toBe(1)
      expect(pricing?.priceTable.perSquareMetre?.toString()).toBe('400.00')
      expect(pricing?.priceTable.modifiers.map((modifier) => modifier.code)).toEqual([
        'INSTALACION',
        'PROMO10-10PCT',
      ])
      expect(pricing?.priceTable.modifiers[1]?.percentage).toBe('10.00')
      expect(pricing?.priceTable.modifiers[1]?.isDiscount).toBe(true)
      expect(pricing?.priceTable.modifiers[1]?.targetId).toBe('PROMO10')
    })

    it('hace round-trip del descuento por código y del descuento automático', async () => {
      const versions = await tariffPricingRepository.listBySeriesId(IDS.series)

      const withCode = versions.find((pricing) => pricing.tariff.id === IDS.tariff)
      const automatic = versions.find((pricing) => pricing.tariff.id === IDS.tariffAuto)

      const codeDiscount = withCode?.priceTable.modifiers.find(
        (modifier) => modifier.code === 'PROMO10-10PCT',
      )
      const automaticDiscount = automatic?.priceTable.modifiers.find(
        (modifier) => modifier.code === 'PROMO-AUTO',
      )

      expect(codeDiscount?.targetId).toBe('PROMO10')
      expect(automaticDiscount?.isDiscount).toBe(true)
      expect(automaticDiscount?.targetId).toBeNull()
    })

    it('no da tarifa vigente fuera de la vigencia', async () => {
      const pricing = await tariffPricingRepository.findInForce(
        IDS.series,
        new Date('2025-01-01T00:00:00.000Z'),
      )

      expect(pricing).toBeNull()
    })

    it('calcula y emite un presupuesto con precio congelado en base de datos', async () => {
      const deps = {
        seriesRepository,
        tariffPricingRepository,
        colorRepository,
        clock,
      }

      const price = await calculatePrice(deps, {
        slug: 'ci-integracion',
        widthMm: 900,
        heightMm: 2100,
        finishId: null,
        colorId: null,
        accessoryIds: [],
        extras: ['installation'],
        discountCode: 'PROMO10',
        locale: 'es',
      })

      expect(price.status).toBe('priced')

      const issued = await issueQuote(
        {
          ...deps,
          quoteRepository,
          quoteNumberSequence,
          idGenerator: { nextId: () => randomUUID() },
          validityDays: 30,
        },
        {
          slug: 'ci-integracion',
          widthMm: 900,
          heightMm: 2100,
          finishId: null,
          colorId: null,
          accessoryIds: [],
          extras: ['installation'],
          discountCode: 'PROMO10',
          locale: 'es',
        },
      )

      expect(issued.status).toBe('issued')

      if (issued.status !== 'issued') return

      expect(issued.quote.reference).toMatch(/^PC-2026-\d{6}$/)
      // 756 + 180 = 936; 10 % = 93,60 → 842,40; IVA 21 % = 176,90.
      expect(issued.quote.totals.total.amount).toBe('1019.30')

      const stored = await quoteRepository.findByReference(issued.quote.reference)

      expect(stored?.lines.map((line) => line.code)).toEqual([
        'base',
        'INSTALACION',
        'PROMO10-10PCT',
      ])
      expect(stored?.configurationSnapshot.extras).toEqual(['installation'])
      expect(stored?.tariffVersionId).toBe(IDS.tariff)
    })

    it('guarda y recupera solicitudes de presupuesto manual', async () => {
      const request = ManualQuoteRequest.create({
        id: randomUUID(),
        reason: 'size_exceeds_series_max',
        status: 'pending',
        seriesId: IDS.series,
        dimensions: Dimensions.of(1500, 2100),
        finishId: IDS.finish,
        colorId: null,
        accessoryIds: [IDS.accessory],
        contact: {
          name: 'Cliente de integración',
          email: 'integracion@example.com',
          phone: '+34 600 000 000',
          message: null,
          locale: 'es',
        },
        createdAt: clock.now(),
        updatedAt: clock.now(),
        handledAt: null,
      })

      await manualQuoteRequestRepository.save(request)

      const stored = await manualQuoteRequestRepository.findById(request.id)

      expect(stored?.reason).toBe('size_exceeds_series_max')
      expect(stored?.dimensions?.widthMm).toBe(1500)
      expect(stored?.accessoryIds).toEqual([IDS.accessory])
      expect(stored?.contact.email).toBe('integracion@example.com')

      await expect(
        manualQuoteRequestRepository.findById('00000000-0000-7000-8000-000000000000'),
      ).resolves.toBeNull()
    })

    it('no publica una tarifa solapada y deja la fila en borrador (CIF-82)', async () => {
      const tariffVersionRepository = new PrismaTariffVersionRepository(prisma)

      await expect(
        publishTariffVersion(
          { tariffVersionRepository, clock },
          { tariffVersionId: IDS.tariffDraft },
        ),
      ).rejects.toThrow(AmbiguousTariffError)

      const row = await prisma.tariffVersion.findUnique({ where: { id: IDS.tariffDraft } })

      expect(row?.status).toBe('DRAFT')
      expect(row?.publishedAt).toBeNull()
    })

    it('persiste el paso a publicada con `save`', async () => {
      const tariffVersionRepository = new PrismaTariffVersionRepository(prisma)
      const draft = await tariffVersionRepository.findById(IDS.tariffDraftSave)

      expect(draft).not.toBeNull()

      await tariffVersionRepository.save(draft!.publish(clock.now()))

      const stored = await tariffVersionRepository.findById(IDS.tariffDraftSave)

      expect(stored?.status).toBe('published')
      expect(stored?.publishedAt?.toISOString()).toBe(clock.now().toISOString())
    })

    it('la base de datos rechaza publicar una tarifa que se solapa con otra publicada (CIF-89)', async () => {
      // Escritura directa, sin pasar por la comprobación del caso de uso: lo que se prueba aquí es
      // que la restricción de exclusión de PostgreSQL es la que rechaza el solape (SQLSTATE 23P01).
      const error = await prisma.tariffVersion
        .create({
          data: {
            id: randomUUID(),
            seriesId: IDS.series,
            versionNumber: 90,
            status: 'PUBLISHED',
            strategy: 'PER_SQUARE_METRE',
            // Se solapa con la v1 publicada ([2026-01-01, 2027-01-01)).
            validFrom: new Date('2026-06-01T00:00:00.000Z'),
            validUntil: new Date('2026-09-01T00:00:00.000Z'),
            taxRatePercent: '21',
            currency: 'EUR',
            publishedAt: new Date('2026-06-01T00:00:00.000Z'),
          },
        })
        .then(
          () => null,
          (caught: unknown) => caught,
        )

      expect(error).not.toBeNull()
      expect(isPublishedTariffOverlapViolation(error)).toBe(true)
      expect(errorCodes(error)).toContain('23P01')
    })

    it('mapea la violación de la restricción a AmbiguousTariffError, no a 500 (CIF-89)', async () => {
      const tariffVersionRepository = new PrismaTariffVersionRepository(prisma)
      const draft = await tariffVersionRepository.findById(IDS.tariffDraft)

      expect(draft).not.toBeNull()

      // `save` sin la comprobación previa del caso de uso: el solape con la v1 publicada lo detecta
      // la restricción de la base de datos y el adaptador lo traduce al error de dominio (409).
      await expect(tariffVersionRepository.save(draft!.publish(clock.now()))).rejects.toThrow(
        AmbiguousTariffError,
      )

      const row = await prisma.tariffVersion.findUnique({ where: { id: IDS.tariffDraft } })

      expect(row?.status).toBe('DRAFT')
      expect(row?.publishedAt).toBeNull()
    })

    it('dos publicaciones concurrentes solapadas dejan una sola tarifa publicada (CIF-89)', async () => {
      const tariffVersionRepository = new PrismaTariffVersionRepository(prisma)

      const [first, second] = await Promise.allSettled([
        publishTariffVersion(
          { tariffVersionRepository, clock },
          { tariffVersionId: IDS.tariffRaceA },
        ),
        publishTariffVersion(
          { tariffVersionRepository, clock },
          { tariffVersionId: IDS.tariffRaceC },
        ),
      ])

      const rejected = [first, second].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      )
      const fulfilled = [first, second].filter((result) => result.status === 'fulfilled')

      // La invariante se cumple pase lo que pase: una publica y la otra choca, con el error de
      // dominio (409) tanto si lo detecta la comprobación previa como si lo detecta PostgreSQL.
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0]?.reason).toBeInstanceOf(AmbiguousTariffError)

      const published = await prisma.tariffVersion.findMany({
        where: { seriesId: IDS.raceSeries, status: 'PUBLISHED' },
        select: { id: true },
      })

      expect(published).toHaveLength(1)
    })

    /**
     * Entrega del presupuesto contra PostgreSQL real (F5 de CIF-175).
     *
     * La revisión de QA encontró que la idempotencia concurrente (F1) y la escritura rezagada (F2)
     * se habían colado porque el adaptador Prisma no tenía test de integración: el E2E usa el
     * adaptador en memoria. Aquí se ejercitan de verdad el índice único y la escritura condicional.
     */
    describe('entrega del presupuesto (CIF-175 F1/F2/F3)', () => {
      const deliveries = new PrismaQuoteDeliveryRepository(prisma)
      const CUSTOMER = { name: 'Ana', email: 'cliente@example.com' }
      const INTERNAL = 'comercial@example.com'
      const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46])

      const settings: QuoteDocumentSettings = {
        issuer: {
          name: 'Puertas Cifuentes S.L.',
          taxId: 'B12345678',
          address: 'Calle Mayor 1',
          email: 'presupuestos@example.com',
          phone: '+34 900 000 000',
          website: 'https://example.com',
          isPending: false,
        },
        conditions: { es: ['Validez 30 días'], en: ['Valid for 30 days'] },
        internalRecipients: [INTERNAL],
        pendingFields: [],
      }

      async function issueTestQuote(): Promise<Quote> {
        const deps = { seriesRepository, tariffPricingRepository, colorRepository, clock }

        const issued = await issueQuote(
          {
            ...deps,
            quoteRepository,
            quoteNumberSequence,
            idGenerator: { nextId: () => randomUUID() },
            validityDays: 30,
          },
          {
            slug: 'ci-integracion',
            widthMm: 900,
            heightMm: 2100,
            finishId: null,
            colorId: null,
            accessoryIds: [],
            extras: ['installation'],
            discountCode: null,
            locale: 'es',
          },
        )

        if (issued.status !== 'issued') {
          throw new Error('no se pudo emitir el presupuesto de prueba')
        }

        const stored = await quoteRepository.findByReference(issued.quote.reference)

        if (stored === null) {
          throw new Error('el presupuesto emitido no quedó persistido')
        }

        return stored
      }

      function makeDelivery(
        quote: Quote,
        recipient: string,
        at: Date,
        audience: 'customer' | 'internal' = 'customer',
        id: string = randomUUID(),
      ): QuoteDelivery {
        return QuoteDelivery.pending({
          id,
          quoteId: quote.id,
          quoteReference: quote.reference,
          version: 1,
          audience,
          recipient,
          customerName: audience === 'customer' ? CUSTOMER.name : null,
          createdAt: at,
        })
      }

      /**
       * Dobles de frontera: ni se renderiza un PDF real ni se envía correo de verdad.
       *
       * `onSend` se ejecuta **dentro** del envío, antes de registrarlo: es la costura que deja una
       * petición detenida justo cuando ya reclamó sus entregas y todavía no las ha marcado como
       * enviadas (CIF-406).
       */
      function makeDoubles(onSend?: (message: EmailMessage) => Promise<void>): {
        readonly sent: EmailMessage[]
        readonly documents: QuoteDocument[]
        readonly failTo: Set<string>
        readonly emailSender: EmailSender
        readonly renderer: QuotePdfRenderer
      } {
        const sent: EmailMessage[] = []
        const documents: QuoteDocument[] = []
        const failTo = new Set<string>()

        return {
          sent,
          documents,
          failTo,
          emailSender: {
            send: async (message) => {
              if (failTo.has(message.to)) {
                throw new Error('proveedor caído')
              }

              await onSend?.(message)

              sent.push(message)

              return { providerMessageId: `msg-${sent.length}` }
            },
          },
          renderer: {
            render: async (document) => {
              documents.push(document)

              return PDF_BYTES
            },
          },
        }
      }

      function makeDeps(doubles: ReturnType<typeof makeDoubles>): DeliverQuoteDeps {
        return {
          seriesRepository,
          finishRepository,
          colorRepository,
          accessoryRepository,
          quoteRepository,
          quoteDeliveryRepository: deliveries,
          quotePdfRenderer: doubles.renderer,
          emailSender: doubles.emailSender,
          idGenerator: { nextId: () => randomUUID() },
          clock,
          settings,
        }
      }

      it('un solo intento gana el reclamo entre varios simultáneos', async () => {
        const quote = await issueTestQuote()
        const at = clock.now()
        const candidate = makeDelivery(quote, CUSTOMER.email, at)

        const results = await Promise.all(
          [1, 2, 3, 4].map(() => deliveries.claim(candidate.startAttempt(at))),
        )

        expect(results.filter((result) => result !== null)).toHaveLength(1)

        const rows = await prisma.quoteDelivery.findMany({
          where: { idempotencyKey: quoteDeliveryKey(quote.id, 1, CUSTOMER.email) },
        })

        expect(rows).toHaveLength(1)
        expect(rows[0]?.attempts).toBe(1)
      })

      it('una escritura rezagada no devuelve a pendiente una entrega enviada (F2)', async () => {
        const quote = await issueTestQuote()
        const at = clock.now()
        const key = quoteDeliveryKey(quote.id, 1, CUSTOMER.email)
        const claimed = await deliveries.claim(
          makeDelivery(quote, CUSTOMER.email, at).startAttempt(at),
        )

        expect(claimed).not.toBeNull()

        await deliveries.save(claimed!.markSent('msg-1', at))
        // Copia rezagada: leída antes del envío, llega después con el mismo id.
        await deliveries.save(
          makeDelivery(quote, CUSTOMER.email, at, 'customer', claimed!.id).startAttempt(at),
        )

        const stored = await deliveries.findByKey(key)

        expect(stored?.status).toBe('sent')
        expect(stored?.attempts).toBe(1)
        expect(stored?.providerMessageId).toBe('msg-1')
        expect(stored?.sentAt?.toISOString()).toBe(at.toISOString())
      })

      it('no vuelve a reclamar ni a enviar una entrega ya enviada', async () => {
        const quote = await issueTestQuote()
        const at = clock.now()
        const claimed = await deliveries.claim(
          makeDelivery(quote, CUSTOMER.email, at).startAttempt(at),
        )

        await deliveries.save(claimed!.markSent('msg-1', at))

        // Petición tardía con el mismo destinatario: no puede reclamar lo ya entregado.
        const later = new Date(at.getTime() + 60 * 60 * 1000)

        expect(
          await deliveries.claim(makeDelivery(quote, CUSTOMER.email, at).startAttempt(later)),
        ).toBeNull()
      })

      it('deja retomar un reclamo abandonado pasado el margen', async () => {
        const quote = await issueTestQuote()
        const at = clock.now()
        const key = quoteDeliveryKey(quote.id, 1, CUSTOMER.email)

        await deliveries.claim(makeDelivery(quote, CUSTOMER.email, at).startAttempt(at))
        await prisma.quoteDelivery.update({
          where: { idempotencyKey: key },
          data: { claimedAt: new Date(at.getTime() - QUOTE_DELIVERY_CLAIM_LEASE_MS - 1000) },
        })

        const stored = await deliveries.findByKey(key)
        const retaken = await deliveries.claim(stored!.startAttempt(new Date(at.getTime() + 1000)))

        expect(retaken).not.toBeNull()
        expect(retaken?.attempts).toBe(2)
        expect(retaken?.lastError).toBeNull()
      })

      it('dos entregas simultáneas del mismo presupuesto envían un solo correo (F1)', async () => {
        const quote = await issueTestQuote()

        // Carrera forzada y determinista. La primera petición reclama las dos entregas y se queda
        // dentro del envío del primer correo; ahí arranca la segunda, que encuentra las reservas
        // vivas, no puede reclamar ninguna y no envía nada. Dejar el entrelazado al scheduling del
        // runner repartía los reclamos entre las dos peticiones (2-0 o 1-1): con 1-1 cada una ve la
        // fila que ganó la otra y ninguna informa del estado final, así que afirmar «una respuesta
        // `delivered`» fallaba en verde (CIF-406).
        let firstSendStarted!: () => void
        const startedFirstSend = new Promise<void>((resolve) => {
          firstSendStarted = resolve
        })
        let allowFirstSend!: () => void
        const firstSendGate = new Promise<void>((resolve) => {
          allowFirstSend = resolve
        })

        // Costura de un solo uso (CIF-420): solo la primera petición se detiene dentro de su envío.
        // Si una segunda petición llegara a enviar —justo la regresión que este test caza— su envío
        // no espera la puerta, que solo se libera más abajo tras `await second`. Así el doble envío
        // se manifiesta como aserción sobre el estado de la segunda petición y sobre `doubles.sent`,
        // no como timeout de 5 s.
        let gateArmed = true
        const doubles = makeDoubles(async () => {
          if (!gateArmed) return

          gateArmed = false
          firstSendStarted()
          await firstSendGate
        })
        const deps = makeDeps(doubles)

        const first = deliverQuote(deps, { reference: quote.reference, customer: CUSTOMER })

        // La primera ya reclamó las dos filas: la segunda llega con las reservas vivas.
        await startedFirstSend

        const second = await deliverQuote(deps, { reference: quote.reference, customer: CUSTOMER })

        allowFirstSend()

        const firstResult = await first

        expect(second.status).toBe('in_progress')
        expect(second.deliveries.every((delivery) => delivery.status === 'pending')).toBe(true)
        expect(firstResult.status).toBe('delivered')

        // El repro de QA: una fila por destinatario y un solo envío a cada uno.
        expect(doubles.sent.map((message) => message.to).sort()).toEqual(
          [CUSTOMER.email, INTERNAL].sort(),
        )

        const rows = await prisma.quoteDelivery.findMany({ where: { quoteId: quote.id } })

        expect(rows).toHaveLength(2)
        expect(rows.every((row) => row.status === 'SENT')).toBe(true)
        expect(rows.every((row) => row.attempts === 1)).toBe(true)

        // Y una petición posterior converge sin volver a enviar: el estado ya es terminal.
        const later = await deliverQuote(deps, { reference: quote.reference, customer: CUSTOMER })

        expect(later.status).toBe('already_delivered')
        expect(doubles.sent).toHaveLength(2)
      })

      it('cualquier reparto de los reclamos entre dos entregas simultáneas deja un correo por destinatario (F1)', async () => {
        const quote = await issueTestQuote()
        const doubles = makeDoubles()
        const deps = makeDeps(doubles)

        // Sin forzar el entrelazado, el reparto de reclamos (2-0 o 1-1) depende del scheduling: lo
        // que F1 garantiza pase lo que pase es que cada destinatario se reclama y se envía una sola
        // vez. Se afirma sobre esa reserva idempotente y no sobre cuántas peticiones concretas ven
        // `delivered` (CIF-406).
        const results = await Promise.all([
          deliverQuote(deps, { reference: quote.reference, customer: CUSTOMER }),
          deliverQuote(deps, { reference: quote.reference, customer: CUSTOMER }),
        ])

        expect(doubles.sent.map((message) => message.to).sort()).toEqual(
          [CUSTOMER.email, INTERNAL].sort(),
        )

        const rows = await prisma.quoteDelivery.findMany({ where: { quoteId: quote.id } })

        expect(rows).toHaveLength(2)
        expect(rows.every((row) => row.status === 'SENT')).toBe(true)
        expect(rows.every((row) => row.attempts === 1)).toBe(true)

        // Ninguna respuesta puede dar la entrega por fallida —invitaría a reintentar y a duplicar el
        // correo— ni cerrarla por intentos agotados: solo cabe `delivered`, `already_delivered` o,
        // mientras la otra petición sigue enviando, `in_progress`.
        expect(
          results.every((result) =>
            ['delivered', 'already_delivered', 'in_progress'].includes(result.status),
          ),
        ).toBe(true)
        expect(doubles.sent).toHaveLength(2)
      })

      it('el reintento conserva los datos del cliente en el documento (F3)', async () => {
        const quote = await issueTestQuote()
        const doubles = makeDoubles()
        const deps = makeDeps(doubles)

        doubles.failTo.add(INTERNAL)
        const first = await deliverQuote(deps, { reference: quote.reference, customer: CUSTOMER })

        expect(first.status).toBe('incomplete')
        expect(doubles.documents[0]?.customer).toEqual({
          name: CUSTOMER.name,
          email: CUSTOMER.email,
        })

        doubles.failTo.clear()
        const retried = await retryQuoteDeliveries(deps, { reference: quote.reference })

        expect(retried.status).toBe('delivered')
        expect(doubles.documents.at(-1)?.customer).toEqual({
          name: CUSTOMER.name,
          email: CUSTOMER.email,
        })
      })
    })

    /**
     * Lectura de administración del panel (CIF-242, ADR-0023 §6).
     *
     * Este bloque vive aquí y no en un fichero propio a propósito: es el único test de integración
     * del repositorio contra PostgreSQL y su `clean()` borra `catalog_text` entera, así que dos
     * ficheros que corrieran en paralelo se pisarían entre sí. Siembra sus propias filas sintéticas
     * —ninguna serie ni tarifa real (ADR-0017 §2)— y las limpia por id.
     */
    describe('lectura de administración (CIF-242)', () => {
      const ADMIN_IDS = {
        series: 'c1f24200-0000-4000-8000-000000000001',
        seriesArchived: 'c1f24200-0000-4000-8000-000000000002',
        finish: 'c1f24200-0000-4000-8000-000000000003',
        color: 'c1f24200-0000-4000-8000-000000000004',
        accessory: 'c1f24200-0000-4000-8000-000000000005',
        tariff: 'c1f24200-0000-4000-8000-000000000006',
        tariffDraft: 'c1f24200-0000-4000-8000-000000000007',
        band: 'c1f24200-0000-4000-8000-000000000008',
        modifier: 'c1f24200-0000-4000-8000-000000000009',
      } as const

      const ADMIN_ENTITY_IDS = [
        ADMIN_IDS.series,
        ADMIN_IDS.seriesArchived,
        ADMIN_IDS.finish,
        ADMIN_IDS.color,
        ADMIN_IDS.accessory,
      ]

      async function cleanAdmin(): Promise<void> {
        await prisma.tariffVersion.deleteMany({
          where: { id: { in: [ADMIN_IDS.tariff, ADMIN_IDS.tariffDraft] } },
        })
        await prisma.color.deleteMany({ where: { id: ADMIN_IDS.color } })
        await prisma.doorSeries.deleteMany({
          where: { id: { in: [ADMIN_IDS.series, ADMIN_IDS.seriesArchived] } },
        })
        await prisma.catalogText.deleteMany({ where: { entityId: { in: ADMIN_ENTITY_IDS } } })
        await prisma.finish.deleteMany({ where: { id: ADMIN_IDS.finish } })
        await prisma.accessory.deleteMany({ where: { id: ADMIN_IDS.accessory } })
      }

      async function seedAdmin(): Promise<void> {
        await prisma.finish.create({
          data: {
            id: ADMIN_IDS.finish,
            code: 'ADMIN-CI242-LACADO',
            status: 'PUBLISHED',
            sortOrder: 1,
          },
        })

        await prisma.color.create({
          data: {
            id: ADMIN_IDS.color,
            finishId: ADMIN_IDS.finish,
            code: 'ADMIN-CI242-RAL-9010',
            hex: '#F1EDE1',
            // Archivado: el panel lo sigue viendo aunque el configurador ya no lo ofrezca.
            status: 'ARCHIVED',
            sortOrder: 1,
          },
        })

        await prisma.accessory.create({
          data: {
            id: ADMIN_IDS.accessory,
            code: 'ADMIN-CI242-MANILLA',
            category: 'HARDWARE',
            status: 'PUBLISHED',
            sortOrder: 1,
          },
        })

        await prisma.doorSeries.create({
          data: {
            id: ADMIN_IDS.series,
            code: 'ADMIN-CI242',
            slug: 'admin-ci242',
            // En borrador: es el caso que el configurador no ve y el panel sí.
            status: 'DRAFT',
            minWidthMm: 600,
            maxWidthMm: 1100,
            minHeightMm: 1800,
            maxHeightMm: 2300,
            sortOrder: 1,
            finishLinks: { create: [{ finishId: ADMIN_IDS.finish }] },
            accessoryLinks: { create: [{ accessoryId: ADMIN_IDS.accessory }] },
          },
        })

        await prisma.doorSeries.create({
          data: {
            id: ADMIN_IDS.seriesArchived,
            code: 'ADMIN-CI242-ARCHIVADA',
            slug: 'admin-ci242-archivada',
            status: 'ARCHIVED',
            minWidthMm: 500,
            maxWidthMm: 900,
            minHeightMm: 1500,
            maxHeightMm: 2000,
            sortOrder: 2,
          },
        })

        await prisma.catalogText.createMany({
          data: [
            {
              entityType: 'SERIES',
              entityId: ADMIN_IDS.series,
              field: 'NAME',
              locale: 'es',
              value: 'Serie de panel',
            },
            {
              entityType: 'SERIES',
              entityId: ADMIN_IDS.series,
              field: 'NAME',
              locale: 'en',
              value: 'Panel series',
            },
            {
              entityType: 'SERIES',
              entityId: ADMIN_IDS.series,
              field: 'DESCRIPTION',
              locale: 'es',
              value: 'Serie sintética de integración',
            },
            {
              entityType: 'SERIES',
              entityId: ADMIN_IDS.series,
              field: 'DESCRIPTION',
              locale: 'en',
              value: 'Synthetic integration series',
            },
            // La archivada solo tiene español: el panel tiene que avisar de que falta el inglés.
            {
              entityType: 'SERIES',
              entityId: ADMIN_IDS.seriesArchived,
              field: 'NAME',
              locale: 'es',
              value: 'Serie archivada',
            },
            {
              entityType: 'FINISH',
              entityId: ADMIN_IDS.finish,
              field: 'NAME',
              locale: 'es',
              value: 'Lacado de panel',
            },
            {
              entityType: 'FINISH',
              entityId: ADMIN_IDS.finish,
              field: 'NAME',
              locale: 'en',
              value: 'Panel lacquer',
            },
            {
              entityType: 'COLOR',
              entityId: ADMIN_IDS.color,
              field: 'NAME',
              locale: 'es',
              value: 'Blanco puro',
            },
            {
              entityType: 'COLOR',
              entityId: ADMIN_IDS.color,
              field: 'NAME',
              locale: 'en',
              value: 'Pure white',
            },
            {
              entityType: 'ACCESSORY',
              entityId: ADMIN_IDS.accessory,
              field: 'NAME',
              locale: 'es',
              value: 'Manilla de acero',
            },
            {
              entityType: 'ACCESSORY',
              entityId: ADMIN_IDS.accessory,
              field: 'NAME',
              locale: 'en',
              value: 'Steel handle',
            },
            {
              entityType: 'ACCESSORY',
              entityId: ADMIN_IDS.accessory,
              field: 'DESCRIPTION',
              locale: 'es',
              value: 'Manilla sintética',
            },
          ],
        })

        await prisma.tariffVersion.create({
          data: {
            id: ADMIN_IDS.tariff,
            seriesId: ADMIN_IDS.series,
            versionNumber: 1,
            status: 'PUBLISHED',
            strategy: 'SIZE_BANDS',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            taxRatePercent: '21',
            currency: 'EUR',
            publishedAt: new Date('2026-01-01T00:00:00.000Z'),
            priceTable: {
              create: {
                bands: {
                  create: [
                    {
                      id: ADMIN_IDS.band,
                      minWidthMm: 600,
                      maxWidthMm: 1100,
                      minHeightMm: 1800,
                      maxHeightMm: 2300,
                      priceCents: 90_000n,
                      sortOrder: 1,
                    },
                  ],
                },
                modifiers: {
                  create: [
                    {
                      id: ADMIN_IDS.modifier,
                      code: 'ADMIN-CI242-INSTALACION',
                      kind: 'FIXED',
                      target: 'INSTALLATION',
                      amountCents: 12_000n,
                      sortOrder: 1,
                    },
                  ],
                },
              },
            },
          },
        })

        // Borrador sin tabla de precios: el panel lo lista con 0 precios.
        await prisma.tariffVersion.create({
          data: {
            id: ADMIN_IDS.tariffDraft,
            seriesId: ADMIN_IDS.series,
            versionNumber: 2,
            status: 'DRAFT',
            strategy: 'SIZE_BANDS',
            validFrom: new Date('2027-01-01T00:00:00.000Z'),
            taxRatePercent: '21',
            currency: 'EUR',
          },
        })
      }

      beforeAll(async () => {
        await cleanAdmin()
        await seedAdmin()
      })

      afterAll(async () => {
        await cleanAdmin()
      })

      it('devuelve el catálogo completo aunque la serie esté en borrador', async () => {
        const snapshot = await new PrismaAdminCatalogReader(prisma).loadAdminCatalog()

        const series = snapshot.series.find((item) => item.id === ADMIN_IDS.series)

        expect(series?.status).toBe('draft')
        expect(series?.limits.maxWidthMm).toBe(1100)
        expect(series?.name.resolve('en')).toBe('Panel series')
        expect(series?.description?.resolve('es')).toBe('Serie sintética de integración')
        expect(series?.allowedFinishIds).toEqual([ADMIN_IDS.finish])
        expect(series?.allowedAccessoryIds).toEqual([ADMIN_IDS.accessory])

        const archived = snapshot.series.find((item) => item.id === ADMIN_IDS.seriesArchived)

        expect(archived?.status).toBe('archived')
        expect(archived?.description).toBeNull()
      })

      it('cuenta las filas de precio y conserva estado y vigencia de cada versión', async () => {
        const snapshot = await new PrismaAdminCatalogReader(prisma).loadAdminCatalog()

        const published = snapshot.tariffVersions.find((item) => item.id === ADMIN_IDS.tariff)
        const draft = snapshot.tariffVersions.find((item) => item.id === ADMIN_IDS.tariffDraft)

        expect(published?.status).toBe('published')
        expect(published?.priceCount).toBe(2)
        expect(published?.validFrom.toISOString()).toBe('2026-01-01T00:00:00.000Z')
        expect(published?.validUntil).toBeNull()
        expect(draft?.status).toBe('draft')
        expect(draft?.priceCount).toBe(0)
      })

      it('mapea acabados con color archivado y complementos con sus textos', async () => {
        const snapshot = await new PrismaAdminCatalogReader(prisma).loadAdminCatalog()

        const finish = snapshot.finishes.find((item) => item.id === ADMIN_IDS.finish)
        const color = snapshot.colors.find((item) => item.id === ADMIN_IDS.color)
        const accessory = snapshot.accessories.find((item) => item.id === ADMIN_IDS.accessory)

        expect(finish?.name.resolve('en')).toBe('Panel lacquer')
        expect(color?.status).toBe('archived')
        expect(color?.hex).toBe('#F1EDE1')
        expect(color?.name.resolve('es')).toBe('Blanco puro')
        expect(accessory?.category).toBe('hardware')
        expect(accessory?.description?.resolve('es')).toBe('Manilla sintética')
      })

      it('el caso de uso sirve las vistas del panel sobre el adaptador real', async () => {
        const adminCatalog = createAdminCatalogUseCase({
          reader: new PrismaAdminCatalogReader(prisma),
          clock,
          locale: 'es',
        })

        const [series, versions, languages] = await Promise.all([
          adminCatalog.listSeries(),
          adminCatalog.listTariffVersions(),
          adminCatalog.listLanguages(),
        ])

        const borrador = series.find((item) => item.id === ADMIN_IDS.series)

        expect(borrador?.tariffVersionNumber).toBe(1)
        expect(borrador?.finishCount).toBe(1)
        expect(borrador?.missingLocales).toEqual([])

        const archivada = series.find((item) => item.id === ADMIN_IDS.seriesArchived)

        expect(archivada?.missingLocales).toEqual(['es', 'en'])

        const draft = versions.find((item) => item.id === ADMIN_IDS.tariffDraft)

        expect(draft?.effectiveFrom).toBeNull()

        // Cuenta todo el catálogo, no solo las series de este bloque: la archivada (nombre solo en
        // español, sin descripción) y las dos series del seed base (una sin descripción y la de la
        // carrera de tarifas, sin textos) están pendientes en los dos idiomas.
        expect(languages).toEqual([
          { code: 'es', isActive: true, missingSeries: 3 },
          { code: 'en', isActive: true, missingSeries: 3 },
        ])
      })
    })

    /**
     * Escritura de catálogo contra PostgreSQL real (CIF-126a, ADR-0027).
     *
     * Datos sintéticos y aislados por id: el bloque limpia lo suyo al terminar porque el describe de
     * «catálogo vacío» que va detrás cuenta filas. Ejercita los casos de uso contra los adaptadores
     * Prisma —idempotencia por `code` y por `(finishId, code)`, textos multi-idioma, guardas de
     * desactivación e invariante de publicación—, no los adaptadores por dentro.
     */
    describe('escritura de catálogo (CIF-126a)', () => {
      const WRITE_IDS = {
        series: 'c1f126a0-0000-4000-8000-000000000001',
        seriesOtroSlug: 'c1f126a0-0000-4000-8000-000000000002',
        finish: 'c1f126a0-0000-4000-8000-000000000003',
        finishSuelto: 'c1f126a0-0000-4000-8000-000000000004',
        color: 'c1f126a0-0000-4000-8000-000000000005',
        accessory: 'c1f126a0-0000-4000-8000-000000000006',
        tariff: 'c1f126a0-0000-4000-8000-000000000007',
        tariffBorrador: 'c1f126a0-0000-4000-8000-000000000008',
        band: 'c1f126a0-0000-4000-8000-000000000009',
      } as const

      const seriesWriteRepository = new PrismaSeriesWriteRepository(prisma)
      const finishWriteRepository = new PrismaFinishWriteRepository(prisma)
      const colorWriteRepository = new PrismaColorWriteRepository(prisma)
      const accessoryWriteRepository = new PrismaAccessoryWriteRepository(prisma)
      const tariffVersionRepository = new PrismaTariffVersionRepository(prisma)
      const catalogUsageReader = new PrismaCatalogUsageReader(prisma)

      const writeDeps = {
        seriesRepository,
        finishRepository,
        colorRepository,
        accessoryRepository,
        seriesWriteRepository,
        finishWriteRepository,
        colorWriteRepository,
        accessoryWriteRepository,
        catalogUsageReader,
        idGenerator: { nextId: () => randomUUID() },
        clock,
      }

      async function cleanWrite(): Promise<void> {
        await prisma.tariffVersion.deleteMany({
          where: { id: { in: [WRITE_IDS.tariff, WRITE_IDS.tariffBorrador] } },
        })
        await prisma.color.deleteMany({ where: { id: WRITE_IDS.color } })
        await prisma.doorSeries.deleteMany({
          where: { id: { in: [WRITE_IDS.series, WRITE_IDS.seriesOtroSlug] } },
        })
        await prisma.catalogText.deleteMany({
          where: {
            entityId: {
              in: Object.values(WRITE_IDS).slice(0, 6),
            },
          },
        })
        await prisma.finish.deleteMany({
          where: { id: { in: [WRITE_IDS.finish, WRITE_IDS.finishSuelto] } },
        })
        await prisma.accessory.deleteMany({ where: { id: { in: [WRITE_IDS.accessory] } } })
      }

      /**
       * Borra lo que los casos hayan creado de más (códigos `CI126A-*` con id fuera del seed), para
       * que un fallo a mitad de un caso no contamine los bloques siguientes: el describe de
       * «catálogo vacío» que va detrás cuenta filas. Las filas del seed se conservan porque los
       * casos siguientes las necesitan.
       */
      async function cleanWriteLeftovers(): Promise<void> {
        const seededIds = Object.values(WRITE_IDS)
        const createdSeries = await prisma.doorSeries.findMany({
          where: { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
          select: { id: true },
        })
        const createdFinishes = await prisma.finish.findMany({
          where: { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
          select: { id: true },
        })
        const createdAccessories = await prisma.accessory.findMany({
          where: { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
          select: { id: true },
        })
        const createdEntityIds = [
          ...createdSeries.map((row) => row.id),
          ...createdFinishes.map((row) => row.id),
          ...createdAccessories.map((row) => row.id),
        ]

        await prisma.tariffVersion.deleteMany({
          where: { seriesId: { in: createdSeries.map((row) => row.id) } },
        })
        await prisma.catalogText.deleteMany({
          where: { entityId: { in: createdEntityIds } },
        })
        await prisma.color.deleteMany({
          where: {
            OR: [
              { finishId: { in: createdFinishes.map((row) => row.id) } },
              { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
            ],
          },
        })
        await prisma.accessory.deleteMany({
          where: { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
        })
        await prisma.finish.deleteMany({
          where: { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
        })
        await prisma.doorSeries.deleteMany({
          where: { code: { startsWith: 'CI126A' }, id: { notIn: [...seededIds] } },
        })
      }

      /** Serie publicada con tarifa vigente y vínculos vivos: el catálogo del que parte el bloque. */
      async function seedWrite(): Promise<void> {
        await prisma.finish.create({
          data: {
            id: WRITE_IDS.finish,
            code: 'CI126A-LACADO',
            status: 'PUBLISHED',
            sortOrder: 1,
          },
        })
        await prisma.finish.create({
          data: {
            id: WRITE_IDS.finishSuelto,
            code: 'CI126A-SUELTO',
            status: 'DRAFT',
            sortOrder: 2,
          },
        })
        await prisma.color.create({
          data: {
            id: WRITE_IDS.color,
            finishId: WRITE_IDS.finish,
            code: 'CI126A-RAL-9010',
            hex: '#F1EDE1',
            status: 'PUBLISHED',
            sortOrder: 1,
          },
        })
        await prisma.accessory.create({
          data: {
            id: WRITE_IDS.accessory,
            code: 'CI126A-MANILLA',
            category: 'HARDWARE',
            status: 'PUBLISHED',
            sortOrder: 1,
          },
        })
        await prisma.doorSeries.create({
          data: {
            id: WRITE_IDS.series,
            code: 'CI126A',
            slug: 'ci126a',
            status: 'PUBLISHED',
            minWidthMm: 600,
            maxWidthMm: 1100,
            minHeightMm: 1800,
            maxHeightMm: 2300,
            sortOrder: 1,
            finishLinks: { create: [{ finishId: WRITE_IDS.finish }] },
            accessoryLinks: { create: [{ accessoryId: WRITE_IDS.accessory }] },
          },
        })
        await prisma.doorSeries.create({
          data: {
            id: WRITE_IDS.seriesOtroSlug,
            code: 'CI126A-OTRA',
            slug: 'ci126a-otra',
            status: 'DRAFT',
            minWidthMm: 600,
            maxWidthMm: 1000,
            minHeightMm: 1800,
            maxHeightMm: 2200,
            sortOrder: 2,
          },
        })
        await prisma.catalogText.createMany({
          data: [
            {
              entityType: 'SERIES',
              entityId: WRITE_IDS.series,
              field: 'NAME',
              locale: 'es',
              value: 'Serie de escritura',
            },
            {
              entityType: 'SERIES',
              entityId: WRITE_IDS.series,
              field: 'NAME',
              locale: 'en',
              value: 'Write series',
            },
          ],
        })
        await prisma.tariffVersion.create({
          data: {
            id: WRITE_IDS.tariff,
            seriesId: WRITE_IDS.series,
            versionNumber: 1,
            status: 'PUBLISHED',
            strategy: 'PER_SQUARE_METRE',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            taxRatePercent: '21',
            currency: 'EUR',
            publishedAt: new Date('2026-01-01T00:00:00.000Z'),
            priceTable: { create: { perSquareMetreCents: 40_000n } },
          },
        })
        await prisma.tariffVersion.create({
          data: {
            id: WRITE_IDS.tariffBorrador,
            seriesId: WRITE_IDS.series,
            versionNumber: 2,
            status: 'DRAFT',
            strategy: 'SIZE_BANDS',
            validFrom: new Date('2027-01-01T00:00:00.000Z'),
            taxRatePercent: '21',
            currency: 'EUR',
          },
        })
      }

      beforeAll(async () => {
        await cleanWrite()
        await seedWrite()
      })

      afterEach(async () => {
        await cleanWriteLeftovers()
      })

      afterAll(async () => {
        await cleanWrite()
      })

      it('da de alta una serie con vínculos y textos por idioma', async () => {
        const created = await upsertSeries(writeDeps, {
          code: 'CI126A-NUEVA',
          slug: 'ci126a-nueva',
          name: { es: 'Serie nueva', en: 'New series' },
          description: { es: 'Descripción' },
          limits: { minWidthMm: 700, maxWidthMm: 1200, minHeightMm: 1900, maxHeightMm: 2400 },
          allowedFinishIds: [WRITE_IDS.finish],
          allowedAccessoryIds: [WRITE_IDS.accessory],
        })

        const row = await prisma.doorSeries.findUnique({
          where: { id: created.id },
          include: {
            finishLinks: true,
            accessoryLinks: true,
          },
        })
        const texts = await prisma.catalogText.findMany({
          where: { entityType: 'SERIES', entityId: created.id },
          orderBy: [{ field: 'asc' }, { locale: 'asc' }],
        })

        expect(row?.code).toBe('CI126A-NUEVA')
        expect(row?.minWidthMm).toBe(700)
        expect(row?.finishLinks.map((link) => link.finishId)).toEqual([WRITE_IDS.finish])
        expect(row?.accessoryLinks.map((link) => link.accessoryId)).toEqual([WRITE_IDS.accessory])
        expect(texts.map((text) => `${text.field}:${text.locale}=${text.value}`)).toEqual([
          // PostgreSQL ordena el enum `catalog_text_field` por orden de declaración (NAME, DESCRIPTION),
          // no alfabéticamente.
          'NAME:en=New series',
          'NAME:es=Serie nueva',
          'DESCRIPTION:es=Descripción',
        ])
      })

      it('es idempotente por code y borra la traducción que ya no viene', async () => {
        const first = await upsertSeries(writeDeps, {
          code: 'CI126A-OTRA',
          slug: 'ci126a-otra',
          name: { es: 'Serie otra revisada', en: 'Other series' },
          limits: { minWidthMm: 600, maxWidthMm: 1000, minHeightMm: 1800, maxHeightMm: 2200 },
        })
        const second = await upsertSeries(writeDeps, {
          code: 'CI126A-OTRA',
          slug: 'ci126a-otra',
          name: { es: 'Serie otra definitiva' },
          limits: { minWidthMm: 650, maxWidthMm: 1050, minHeightMm: 1800, maxHeightMm: 2200 },
        })

        const rows = await prisma.doorSeries.findMany({ where: { code: 'CI126A-OTRA' } })
        const texts = await prisma.catalogText.findMany({
          where: { entityType: 'SERIES', entityId: WRITE_IDS.seriesOtroSlug },
        })

        expect(first.id).toBe(WRITE_IDS.seriesOtroSlug)
        expect(second.id).toBe(first.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]?.minWidthMm).toBe(650)
        expect(texts.map((text) => `${text.field}:${text.locale}=${text.value}`)).toEqual([
          'NAME:es=Serie otra definitiva',
        ])
      })

      it('traduce la violación de unicidad de slug a ConflictError, no a 500 (escritura directa)', async () => {
        const current = await seriesWriteRepository.findByCode('CI126A-OTRA')

        expect(current).not.toBeNull()

        await expect(
          seriesWriteRepository.save(
            makeSeries({ ...current!, id: WRITE_IDS.series, slug: current!.slug }),
          ),
        ).rejects.toThrow(ConflictError)
      })

      it('edita los límites de una serie y conserva sus textos', async () => {
        const updated = await updateSeries(
          { seriesRepository, seriesWriteRepository, clock },
          {
            seriesId: WRITE_IDS.series,
            limits: { minWidthMm: 550, maxWidthMm: 1300, minHeightMm: 1700, maxHeightMm: 2500 },
            name: { en: 'Write series (rev)' },
          },
        )

        const row = await prisma.doorSeries.findUnique({ where: { id: WRITE_IDS.series } })

        expect(updated.limits.maxWidthMm).toBe(1300)
        expect(updated.name).toEqual({ es: 'Serie de escritura', en: 'Write series (rev)' })
        expect(row?.maxWidthMm).toBe(1300)
      })

      it('da de alta y actualiza acabados, colores y complementos sin duplicar (upsert)', async () => {
        const finish = await upsertFinish(writeDeps, {
          code: 'CI126A-MADERA',
          name: { es: 'Madera', en: 'Wood' },
        })
        await upsertFinish(writeDeps, {
          code: 'CI126A-MADERA',
          name: { es: 'Madera natural' },
        })

        const color = await upsertColor(writeDeps, {
          finishId: WRITE_IDS.finish,
          code: 'CI126A-RAL-7016',
          name: { es: 'Antracita' },
          hex: '#383e42',
        })
        await upsertColor(writeDeps, {
          finishId: WRITE_IDS.finish,
          code: 'CI126A-RAL-7016',
          name: { es: 'Gris antracita' },
        })

        await upsertAccessory(writeDeps, {
          code: 'CI126A-CIERRE',
          name: { es: 'Cierrapuertas' },
          category: 'closing',
        })
        await upsertAccessory(writeDeps, {
          code: 'CI126A-CIERRE',
          name: { es: 'Cierrapuertas hidráulico' },
          category: 'closing',
        })

        const finishes = await prisma.finish.findMany({ where: { code: 'CI126A-MADERA' } })
        const colors = await prisma.color.findMany({ where: { code: 'CI126A-RAL-7016' } })
        const accessories = await prisma.accessory.findMany({ where: { code: 'CI126A-CIERRE' } })
        const finishTexts = await prisma.catalogText.findMany({
          where: { entityType: 'FINISH', entityId: finish.id },
        })

        expect(finishes).toHaveLength(1)
        expect(colors).toHaveLength(1)
        expect(colors[0]?.hex).toBe('#383E42')
        expect(accessories).toHaveLength(1)
        expect(color.finishId).toBe(WRITE_IDS.finish)
        expect(finishTexts.map((text) => text.value)).toEqual(['Madera natural'])

        await prisma.color.deleteMany({ where: { id: color.id } })
        await prisma.finish.deleteMany({ where: { id: finish.id } })
        await prisma.accessory.deleteMany({ where: { code: 'CI126A-CIERRE' } })
        await prisma.catalogText.deleteMany({ where: { entityId: finish.id } })
      })

      it('rechaza desactivar una serie con tarifa publicada y vigente sin escribir', async () => {
        await expect(deactivateSeries(writeDeps, { seriesId: WRITE_IDS.series })).rejects.toThrow(
          SeriesInUseError,
        )

        const row = await prisma.doorSeries.findUnique({ where: { id: WRITE_IDS.series } })

        expect(row?.status).toBe('PUBLISHED')
        await expect(
          catalogUsageReader.seriesHasTariffInForce(WRITE_IDS.series, clock.now()),
        ).resolves.toBe(true)
      })

      it('rechaza desactivar un acabado que una serie viva permite sin escribir', async () => {
        await expect(
          deactivateCatalogItem(writeDeps, { entity: 'finish', id: WRITE_IDS.finish }),
        ).rejects.toThrow(ItemInUseError)

        const row = await prisma.finish.findUnique({ where: { id: WRITE_IDS.finish } })

        expect(row?.status).toBe('PUBLISHED')
        await expect(
          catalogUsageReader.isFinishAllowedByLiveSeries(WRITE_IDS.finish),
        ).resolves.toBe(true)
      })

      it('desactiva un acabado sin uso y lo deja archivado', async () => {
        const result = await deactivateCatalogItem(writeDeps, {
          entity: 'finish',
          id: WRITE_IDS.finishSuelto,
        })

        const row = await prisma.finish.findUnique({ where: { id: WRITE_IDS.finishSuelto } })

        expect(result.item.status).toBe('archived')
        expect(row?.status).toBe('ARCHIVED')
      })

      it('escribe la tabla de precios de un borrador con sus bandas y modificadores', async () => {
        const table = await updateTariffPrice(
          { tariffVersionRepository, idGenerator: { nextId: () => randomUUID() } },
          {
            tariffVersionId: WRITE_IDS.tariffBorrador,
            bands: [
              {
                id: WRITE_IDS.band,
                minWidthMm: 600,
                maxWidthMm: 1000,
                minHeightMm: 1800,
                maxHeightMm: 2200,
                price: '480.00',
              },
            ],
            modifiers: [
              { code: 'INSTALACION', kind: 'fixed', target: 'installation', amount: '180' },
            ],
          },
        )

        const stored = await tariffVersionRepository.findPriceTableByVersionId(
          WRITE_IDS.tariffBorrador,
        )

        expect(table.bands).toHaveLength(1)
        expect(stored?.bands.map((band) => band.id)).toEqual([WRITE_IDS.band])
        expect(stored?.modifiers.map((modifier) => modifier.code)).toEqual(['INSTALACION'])
      })

      it('no publica la tarifa sin tabla de precios y deja la fila intacta (ADR-0027 §4)', async () => {
        const id = randomUUID()

        await prisma.tariffVersion.create({
          data: {
            id,
            seriesId: WRITE_IDS.seriesOtroSlug,
            versionNumber: 5,
            status: 'DRAFT',
            strategy: 'PER_SQUARE_METRE',
            validFrom: new Date('2027-06-01T00:00:00.000Z'),
            taxRatePercent: '21',
            currency: 'EUR',
          },
        })

        await expect(
          publishTariffVersion({ tariffVersionRepository, clock }, { tariffVersionId: id }),
        ).rejects.toThrow(EmptyPriceTableError)

        const stored = await prisma.tariffVersion.findUnique({ where: { id } })

        expect(stored?.status).toBe('DRAFT')
        expect(stored?.publishedAt).toBeNull()

        await prisma.tariffVersion.delete({ where: { id } })
      })

      it('rechaza editar los precios de una tarifa publicada', async () => {
        await expect(
          updateTariffPrice(
            { tariffVersionRepository, idGenerator: { nextId: () => randomUUID() } },
            { tariffVersionId: WRITE_IDS.tariff, perSquareMetre: '1.00' },
          ),
        ).rejects.toThrow(TariffVersionNotEditableError)
      })
    })

    /**
     * Catálogo vacío (CIF-449, riesgo residual R1 de CIF-445).
     *
     * El E2E de `catalog-empty` (CIF-436) recorre ese estado de punta a punta, pero solo con el
     * adaptador en memoria; ningún test ejercía el camino de producción con la tabla sin filas. Este
     * bloque va al final del fichero a propósito: reutiliza `clean()` (que borra `catalog_text`
     * entera) y solo después comprueba que el catálogo quedó de verdad a cero, para no pisar a los
     * tests anteriores. `afterAll` resiembra por si en el futuro se añaden casos detrás.
     */
    describe('catálogo vacío (CIF-449)', () => {
      beforeAll(async () => {
        await clean(prisma)
      })

      afterAll(async () => {
        await clean(prisma)
        await seed(prisma)
      })

      it('sin series publicadas, las lecturas publicadas devuelven listas vacías', async () => {
        expect(await prisma.doorSeries.count()).toBe(0)
        expect(await prisma.finish.count()).toBe(0)
        expect(await prisma.accessory.count()).toBe(0)

        expect(await seriesRepository.listPublished()).toEqual([])
        expect(await seriesRepository.findPublishedBySlug('ci-integracion')).toBeNull()
        expect(await finishRepository.listPublished()).toEqual([])
        expect(await accessoryRepository.listPublished()).toEqual([])
        expect(await colorRepository.listPublishedByFinishId(IDS.finish)).toEqual([])
      })
    })
  },
)
