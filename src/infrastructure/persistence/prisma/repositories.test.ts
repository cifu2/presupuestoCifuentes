/**
 * Test de integración de los adaptadores Prisma contra PostgreSQL real.
 *
 * Se ejecuta cuando existe `TEST_DATABASE_URL` (base de datos de test con las migraciones
 * aplicadas: `DATABASE_URL=$TEST_DATABASE_URL pnpm db:deploy`). En CI, QA/DevOps añaden el
 * servicio `postgres` y la variable (CIF-10/CIF-11).
 */

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ManualQuoteRequest } from '@/domain/catalog/manual-quote-request'
import { Dimensions } from '@/domain/catalog/measurement'
import { CurrentInstantClock } from '@/infrastructure/clock/system-clock'

import { calculatePrice } from '@/application/use-cases/calculate-price'
import { issueQuote } from '@/application/use-cases/issue-quote'
import { createPrismaClient } from './client'
import {
  PrismaAccessoryRepository,
  PrismaColorRepository,
  PrismaFinishRepository,
  PrismaManualQuoteRequestRepository,
  PrismaQuoteNumberSequence,
  PrismaQuoteRepository,
  PrismaSeriesRepository,
  PrismaTariffPricingRepository,
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
  band: '66666666-6666-7666-8666-666666666666',
  modifier: '77777777-7777-7777-8777-777777777777',
  modifierDiscount: '88888888-8888-7888-8888-888888888888',
  modifierAutoDiscount: '99999999-9999-7999-8999-999999999999',
} as const

async function clean(prisma: PrismaClient): Promise<void> {
  await prisma.quoteLine.deleteMany({})
  await prisma.quote.deleteMany({})
  await prisma.manualQuoteRequest.deleteMany({})
  await prisma.tariffVersion.deleteMany({ where: { id: { in: [IDS.tariff, IDS.tariffAuto] } } })
  await prisma.doorSeries.deleteMany({ where: { id: IDS.series } })
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
  },
)
