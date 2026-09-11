/**
 * Adaptadores Prisma de los puertos de catálogo, tarifas y presupuestos.
 *
 * Toda la traducción fila ↔ dominio vive en `mappers.ts`; estos adaptadores solo consultan y
 * escriben. Se construyen en la raíz de composición cuando hay `DATABASE_URL`.
 */

import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import type { $Enums, PrismaClient } from '@prisma/client'

import { selectTariffInForce, type TariffVersion } from '@/domain/catalog/tariff-version'
import type { ManualQuoteRequest } from '@/domain/catalog/manual-quote-request'
import type { Quote } from '@/domain/quote/quote'
import { AmbiguousTariffError, InvalidValueError } from '@/domain/shared/errors'
import type { QuoteExtra } from '@/domain/pricing/quote-configuration'

import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { ManualQuoteRequestRepository } from '@/application/ports/manual-quote-request-repository'
import type { QuoteNumberSequence } from '@/application/ports/quote-number-sequence'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type {
  TariffPricing,
  TariffPricingRepository,
} from '@/application/ports/tariff-pricing-repository'
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'
import {
  catalogStatusToDb,
  groupCatalogTexts,
  localizedTextToJson,
  manualQuoteReasonToDb,
  pricingStrategyToDb,
  quoteLineKindToDb,
  toAccessory,
  toColor,
  toDoorSeries,
  toFinish,
  toManualQuoteRequest,
  toPriceTable,
  toQuote,
  toTariffVersion,
  type CatalogTextRow,
  type SeriesRow,
} from './mappers'

type TextMap = ReturnType<typeof groupCatalogTexts>

/** SQLSTATE que PostgreSQL devuelve al violar una restricción de exclusión (`EXCLUDE`). */
const POSTGRES_EXCLUSION_VIOLATION = '23P01'

/** Restricción de exclusión que impide dos tarifas publicadas solapadas de la misma serie. */
const PUBLISHED_TARIFF_OVERLAP_CONSTRAINT = 'tariff_version_published_no_overlap'

/** Profundidad máxima del recorrido del error; Prisma anida el del driver 2-3 niveles. */
const MAX_ERROR_DEPTH = 8

/**
 * ¿El error viene de publicar dos versiones de tarifa solapadas de la misma serie?
 *
 * La restricción de exclusión (`tariff_version_published_no_overlap`) es la defensa en escritura
 * frente a dos publicaciones concurrentes (CIF-89). Prisma 7 (adaptador `pg`) envuelve el error de
 * PostgreSQL en un `PrismaClientKnownRequestError` con código `P2039`, y el SQLSTATE real queda
 * anidado en `meta.driverAdapterError.cause` (`code`/`originalCode`). Para no depender de esa
 * forma concreta se recorre el grafo del error buscando el SQLSTATE 23P01 o el nombre de la
 * restricción (que aparece en `message`, `originalMessage` y `detail`). Se exporta para probarlo
 * sin base de datos.
 */
export function isPublishedTariffOverlapViolation(error: unknown): boolean {
  const visited = new Set<unknown>()

  const inspect = (value: unknown, depth: number): boolean => {
    if (depth > MAX_ERROR_DEPTH || typeof value !== 'object' || value === null) {
      return false
    }

    if (visited.has(value)) {
      return false
    }

    visited.add(value)

    const record = value as Record<string, unknown>
    const code = record.code ?? record.originalCode ?? record.sqlState

    if (typeof code === 'string' && code === POSTGRES_EXCLUSION_VIOLATION) {
      return true
    }

    if (record.constraint === PUBLISHED_TARIFF_OVERLAP_CONSTRAINT) {
      return true
    }

    // `message` (y `cause` en algunos motores) no son enumerables en las subclases de `Error`, así
    // que se leen aparte de `Object.values`.
    const message = record.message

    if (typeof message === 'string' && message.includes(PUBLISHED_TARIFF_OVERLAP_CONSTRAINT)) {
      return true
    }

    for (const child of Object.values(record)) {
      if (typeof child === 'object' && child !== null && inspect(child, depth + 1)) {
        return true
      }
    }

    if (record.cause !== undefined && inspect(record.cause, depth + 1)) {
      return true
    }

    return false
  }

  return inspect(error, 0)
}

const SERIES_INCLUDE = {
  finishLinks: { select: { finishId: true } },
  accessoryLinks: { select: { accessoryId: true } },
} satisfies Prisma.DoorSeriesInclude

const QUOTE_INCLUDE = {
  lines: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.QuoteInclude

const PRICE_TABLE_INCLUDE = {
  bands: { orderBy: { sortOrder: 'asc' } },
  modifiers: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.TariffPriceTableInclude

async function fetchTexts(
  prisma: PrismaClient,
  entityType: $Enums.CatalogEntityType,
  entityIds: readonly string[],
): Promise<TextMap> {
  if (entityIds.length === 0) {
    return new Map()
  }

  const rows: CatalogTextRow[] = await prisma.catalogText.findMany({
    where: { entityType, entityId: { in: [...entityIds] } },
    select: { entityId: true, field: true, locale: true, value: true },
  })

  return groupCatalogTexts(rows)
}

export class PrismaSeriesRepository implements SeriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async mapRows(
    rows: readonly SeriesRow[],
  ): Promise<readonly ReturnType<typeof toDoorSeries>[]> {
    const texts = await fetchTexts(
      this.prisma,
      'SERIES',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toDoorSeries(row, texts))
  }

  async findPublishedBySlug(slug: string) {
    const rows = await this.prisma.doorSeries.findMany({
      where: { slug, status: 'PUBLISHED' },
      include: SERIES_INCLUDE,
    })

    return (await this.mapRows(rows))[0] ?? null
  }

  async findById(id: string) {
    const rows = await this.prisma.doorSeries.findMany({ where: { id }, include: SERIES_INCLUDE })

    return (await this.mapRows(rows))[0] ?? null
  }

  async listPublished() {
    const rows = await this.prisma.doorSeries.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
      include: SERIES_INCLUDE,
    })

    return this.mapRows(rows)
  }
}

export class PrismaFinishRepository implements FinishRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    const row = await this.prisma.finish.findUnique({ where: { id } })

    if (row === null) {
      return null
    }

    const texts = await fetchTexts(this.prisma, 'FINISH', [id])

    return toFinish(row, texts.get(id))
  }

  async listPublished() {
    const rows = await this.prisma.finish.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
    })
    const texts = await fetchTexts(
      this.prisma,
      'FINISH',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toFinish(row, texts.get(row.id)))
  }

  async listPublishedByIds(ids: readonly string[]) {
    if (ids.length === 0) {
      return []
    }

    const rows = await this.prisma.finish.findMany({
      where: { id: { in: [...ids] }, status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
    })
    const texts = await fetchTexts(
      this.prisma,
      'FINISH',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toFinish(row, texts.get(row.id)))
  }
}

export class PrismaColorRepository implements ColorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    const row = await this.prisma.color.findUnique({ where: { id } })

    if (row === null) {
      return null
    }

    const texts = await fetchTexts(this.prisma, 'COLOR', [id])

    return toColor(row, texts.get(id))
  }

  async listPublishedByFinishId(finishId: string) {
    const rows = await this.prisma.color.findMany({
      where: { finishId, status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
    })
    const texts = await fetchTexts(
      this.prisma,
      'COLOR',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toColor(row, texts.get(row.id)))
  }
}

export class PrismaAccessoryRepository implements AccessoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    const row = await this.prisma.accessory.findUnique({ where: { id } })

    if (row === null) {
      return null
    }

    const texts = await fetchTexts(this.prisma, 'ACCESSORY', [id])

    return toAccessory(row, texts.get(id))
  }

  async listPublished() {
    const rows = await this.prisma.accessory.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
    })
    const texts = await fetchTexts(
      this.prisma,
      'ACCESSORY',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toAccessory(row, texts.get(row.id)))
  }

  async listPublishedByIds(ids: readonly string[]) {
    if (ids.length === 0) {
      return []
    }

    const rows = await this.prisma.accessory.findMany({
      where: { id: { in: [...ids] }, status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
    })
    const texts = await fetchTexts(
      this.prisma,
      'ACCESSORY',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toAccessory(row, texts.get(row.id)))
  }
}

function toTariffPricing(
  tariff: TariffVersion,
  priceTable: Parameters<typeof toPriceTable>[2] | null,
): TariffPricing | null {
  if (priceTable === null) {
    return null
  }

  return { tariff, priceTable: toPriceTable(tariff.id, tariff.strategy, priceTable) }
}

export class PrismaTariffPricingRepository implements TariffPricingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findInForce(seriesId: string, instant: Date): Promise<TariffPricing | null> {
    const rows = await this.prisma.tariffVersion.findMany({
      where: {
        seriesId,
        status: 'PUBLISHED',
        validFrom: { lte: instant },
        OR: [{ validUntil: null }, { validUntil: { gt: instant } }],
      },
      include: { priceTable: { include: PRICE_TABLE_INCLUDE } },
    })

    if (rows.length === 0) {
      return null
    }

    const versions = rows.map(toTariffVersion)
    // `selectTariffInForce` lanza si hay más de una publicada vigente: invariante del catálogo.
    const inForce = selectTariffInForce(versions, instant)

    if (inForce === undefined) {
      return null
    }

    const row = rows.find((candidate) => candidate.id === inForce.id)

    return toTariffPricing(inForce, row?.priceTable ?? null)
  }

  async listBySeriesId(seriesId: string): Promise<readonly TariffPricing[]> {
    const rows = await this.prisma.tariffVersion.findMany({
      where: { seriesId },
      orderBy: { versionNumber: 'asc' },
      include: { priceTable: { include: PRICE_TABLE_INCLUDE } },
    })

    return rows.flatMap((row) => {
      const pricing = toTariffPricing(toTariffVersion(row), row.priceTable)

      return pricing === null ? [] : [pricing]
    })
  }
}

export class PrismaTariffVersionRepository implements TariffVersionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TariffVersion | null> {
    const row = await this.prisma.tariffVersion.findUnique({ where: { id } })

    return row === null ? null : toTariffVersion(row)
  }

  async listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
    const rows = await this.prisma.tariffVersion.findMany({
      where: { seriesId },
      orderBy: { versionNumber: 'asc' },
    })

    return rows.map(toTariffVersion)
  }

  async save(version: TariffVersion): Promise<void> {
    const mutableFields = {
      status: catalogStatusToDb(version.status),
      strategy: pricingStrategyToDb(version.strategy),
      validFrom: version.validity.validFrom,
      validUntil: version.validity.validUntil,
      taxRatePercent: version.taxRatePercent,
      currency: version.currency,
      notes: version.notes,
      publishedAt: version.publishedAt,
      updatedAt: version.updatedAt,
    }

    try {
      await this.prisma.tariffVersion.upsert({
        where: { id: version.id },
        create: {
          id: version.id,
          seriesId: version.seriesId,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          ...mutableFields,
        },
        update: mutableFields,
      })
    } catch (error) {
      // Defensa en profundidad: la comprobación previa del caso de uso no cubre dos publicaciones
      // concurrentes; aquí la base de datos ya ha rechazado el solape (CIF-89).
      if (isPublishedTariffOverlapViolation(error)) {
        throw new AmbiguousTariffError(
          `Ya hay una versión de tarifa publicada que se solapa con la versión ${version.versionNumber} de la serie "${version.seriesId}"`,
        )
      }

      throw error
    }
  }
}

export class PrismaQuoteRepository implements QuoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(quote: Quote): Promise<void> {
    // Instantánea completa del cálculo: permite reimprimir el presupuesto aunque cambie el
    // catálogo. Se guarda como JSON explícito (todos los importes en cadena decimal).
    const priceSnapshot: Prisma.InputJsonObject = {
      configuration: {
        seriesId: quote.configurationSnapshot.seriesId,
        widthMm: quote.configurationSnapshot.widthMm,
        heightMm: quote.configurationSnapshot.heightMm,
        finishId: quote.configurationSnapshot.finishId,
        colorId: quote.configurationSnapshot.colorId,
        accessoryIds: [...quote.configurationSnapshot.accessoryIds],
        extras: [...quote.configurationSnapshot.extras],
        discountCode: quote.configurationSnapshot.discountCode,
      },
      tariffVersionId: quote.tariffVersionId,
      breakdown: {
        currency: quote.breakdown.currency,
        basePrice: quote.breakdown.basePrice.toString(),
        subtotal: quote.breakdown.subtotal.toString(),
        taxRatePercent: quote.breakdown.taxRatePercent,
        taxAmount: quote.breakdown.taxAmount.toString(),
        total: quote.breakdown.total.toString(),
        lines: quote.breakdown.lines.map((line) => ({
          code: line.code,
          kind: line.kind,
          label: line.label === null ? null : localizedTextToJson(line.label),
          units: line.units,
          unitAmount: line.unitAmount.toString(),
          amount: line.amount.toString(),
        })),
      },
    }

    const data: Prisma.QuoteUncheckedCreateInput = {
      id: quote.id,
      reference: quote.reference,
      status: quote.status.toUpperCase() as $Enums.QuoteStatus,
      seriesId: quote.seriesId,
      tariffVersionId: quote.tariffVersionId,
      locale: quote.locale,
      widthMm: quote.configurationSnapshot.widthMm,
      heightMm: quote.configurationSnapshot.heightMm,
      finishId: quote.configurationSnapshot.finishId,
      colorId: quote.configurationSnapshot.colorId,
      accessoryIds: [...quote.configurationSnapshot.accessoryIds],
      extras: [...quote.configurationSnapshot.extras],
      discountCode: quote.configurationSnapshot.discountCode,
      currency: quote.breakdown.currency,
      subtotalCents: quote.breakdown.subtotal.cents,
      taxRatePercent: quote.breakdown.taxRatePercent,
      taxCents: quote.breakdown.taxAmount.cents,
      totalCents: quote.breakdown.total.cents,
      priceSnapshot,
      validUntil: quote.validUntil,
    }

    const lines: Prisma.QuoteLineCreateManyInput[] = quote.lines.map((line, index) => ({
      id: randomUUID(),
      quoteId: quote.id,
      code: line.code,
      kind: quoteLineKindToDb(line.kind),
      label: line.label === null ? Prisma.JsonNull : localizedTextToJson(line.label),
      units: line.units,
      unitAmountCents: line.unitAmount,
      amountCents: line.amount,
      sortOrder: index,
    }))

    await this.prisma.$transaction(async (transaction) => {
      await transaction.quote.upsert({
        where: { id: quote.id },
        create: data,
        update: data,
      })

      await transaction.quoteLine.deleteMany({ where: { quoteId: quote.id } })
      await transaction.quoteLine.createMany({ data: lines })
    })
  }

  async findById(id: string) {
    const row = await this.prisma.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE })

    return row === null ? null : toQuote(row)
  }

  async findByReference(reference: string) {
    const row = await this.prisma.quote.findUnique({
      where: { reference },
      include: QUOTE_INCLUDE,
    })

    return row === null ? null : toQuote(row)
  }

  async listRecent(limit: number) {
    const rows = await this.prisma.quote.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: QUOTE_INCLUDE,
    })

    return rows.map((row) => toQuote(row))
  }
}

export class PrismaManualQuoteRequestRepository implements ManualQuoteRequestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(request: ManualQuoteRequest): Promise<void> {
    await this.prisma.manualQuoteRequest.upsert({
      where: { id: request.id },
      create: {
        id: request.id,
        reason: manualQuoteReasonToDb(request.reason),
        status: 'PENDING',
        seriesId: request.seriesId,
        widthMm: request.dimensions?.widthMm ?? null,
        heightMm: request.dimensions?.heightMm ?? null,
        finishId: request.finishId,
        colorId: request.colorId,
        accessoryIds: [...request.accessoryIds],
        locale: request.contact.locale,
        customerName: request.contact.name,
        customerEmail: request.contact.email,
        customerPhone: request.contact.phone,
        message: request.contact.message,
        configurationSnapshot: {
          seriesId: request.seriesId,
          widthMm: request.dimensions?.widthMm ?? null,
          heightMm: request.dimensions?.heightMm ?? null,
          finishId: request.finishId,
          colorId: request.colorId,
          accessoryIds: [...request.accessoryIds],
        },
        handledAt: request.handledAt,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
      update: {
        status: request.status.toUpperCase() as $Enums.ManualQuoteStatus,
        handledAt: request.handledAt,
        updatedAt: request.updatedAt,
      },
    })
  }

  async findById(id: string) {
    const row = await this.prisma.manualQuoteRequest.findUnique({ where: { id } })

    return row === null ? null : toManualQuoteRequest(row)
  }
}

export class PrismaQuoteNumberSequence implements QuoteNumberSequence {
  constructor(private readonly prisma: PrismaClient) {}

  async next(year: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ last_value: bigint }[]>`
      INSERT INTO "quote_reference_counter" ("year", "last_value")
      VALUES (${year}, 1)
      ON CONFLICT ("year")
      DO UPDATE SET "last_value" = "quote_reference_counter"."last_value" + 1
      RETURNING "last_value"
    `

    const value = rows[0]?.last_value

    if (value === undefined) {
      throw new InvalidValueError('No se pudo obtener el siguiente número de presupuesto')
    }

    return Number(value)
  }
}

export type { QuoteExtra }
