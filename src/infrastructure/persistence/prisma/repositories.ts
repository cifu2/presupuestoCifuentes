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
import { AmbiguousTariffError, ConflictError, InvalidValueError } from '@/domain/shared/errors'
import type { LocalizedText } from '@/domain/catalog/catalog-text'
import type { QuoteExtra } from '@/domain/pricing/quote-configuration'
import type { PriceTable } from '@/domain/pricing/price-table'
import type { Accessory } from '@/domain/catalog/accessory'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'
import type { DoorSeries } from '@/domain/catalog/series'

import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { ManualQuoteRequestRepository } from '@/application/ports/manual-quote-request-repository'
import type { QuoteNumberSequence } from '@/application/ports/quote-number-sequence'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type {
  AccessoryWriteRepository,
  CatalogUsageReader,
  ColorWriteRepository,
  FinishWriteRepository,
  SeriesWriteRepository,
} from '@/application/ports/catalog-write-repositories'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type {
  TariffPricing,
  TariffPricingRepository,
} from '@/application/ports/tariff-pricing-repository'
import type {
  TariffPublishTransition,
  TariffVersionRepository,
} from '@/application/ports/tariff-version-repository'
import {
  catalogStatusToDb,
  groupCatalogTexts,
  localizedTextToJson,
  manualQuoteReasonToDb,
  accessoryCategoryToDb,
  modifierCatalogColumns,
  modifierKindToDb,
  modifierTargetToDb,
  pricingStrategyToDb,
  pricingStrategyToDomain,
  quoteLineKindToDb,
  toAccessory,
  toCatalogTextRows,
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

/** SQLSTATE con el que PostgreSQL aborta una de dos transacciones que se esperan en círculo. */
const POSTGRES_DEADLOCK_DETECTED = '40P01'

/** Restricción de exclusión que impide dos tarifas publicadas solapadas de la misma serie. */
const PUBLISHED_TARIFF_OVERLAP_CONSTRAINT = 'tariff_version_published_no_overlap'

/** Profundidad máxima del recorrido del error; Prisma anida el del driver 2-3 niveles. */
const MAX_ERROR_DEPTH = 8

/** Columnas mutables de una versión de tarifa; la identidad y `createdAt` no se tocan al editar. */
function mutableTariffVersionFields(version: TariffVersion) {
  return {
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
}

/** `upsert` de una versión completa: alta con su identidad y actualización de lo mutable. */
function tariffVersionUpsert(version: TariffVersion) {
  return {
    where: { id: version.id },
    create: {
      id: version.id,
      seriesId: version.seriesId,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      ...mutableTariffVersionFields(version),
    },
    update: mutableTariffVersionFields(version),
  }
}

/**
 * ¿Algún nodo del grafo del error menciona alguno de esos códigos o nombres?
 *
 * Prisma 7 (adaptador `pg`) envuelve los errores de PostgreSQL en un `PrismaClientKnownRequestError`
 * con código `P2039` y anida el del driver en `meta.driverAdapterError.cause`: el SQLSTATE aparece
 * en un campo `code`-like y a veces solo dentro del mensaje, y el nombre de la restricción, en
 * `message`/`constraint`. Se recorre el grafo buscando esos rastros —en vez de mirar una ruta
 * fija— para no depender de la forma concreta del error. `message` y `cause` no son enumerables en
 * las subclases de `Error`, así que se leen aparte, y el recorrido corta a `MAX_ERROR_DEPTH` y con
 * un conjunto de visitados para no quedarse colgado con referencias circulares.
 */
function errorGraphMentions(error: unknown, needles: readonly string[]): boolean {
  const visited = new Set<unknown>()

  const mentions = (value: unknown): boolean =>
    typeof value === 'string' && needles.some((needle) => value.includes(needle))

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

    if (typeof code === 'string' && needles.includes(code)) {
      return true
    }

    if (mentions(record.constraint) || mentions(record.message)) {
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

/**
 * ¿El error viene de publicar dos versiones de tarifa solapadas de la misma serie?
 *
 * La restricción de exclusión (`tariff_version_published_no_overlap`) es la defensa en escritura
 * frente a dos publicaciones concurrentes (CIF-89): PostgreSQL la rechaza con el SQLSTATE 23P01, o
 * con el nombre de la restricción en el mensaje. Se exporta para probarlo sin base de datos.
 */
export function isPublishedTariffOverlapViolation(error: unknown): boolean {
  return errorGraphMentions(error, [
    POSTGRES_EXCLUSION_VIOLATION,
    PUBLISHED_TARIFF_OVERLAP_CONSTRAINT,
  ])
}

/**
 * ¿La base ha abortado la escritura por un bloqueo mutuo con otra publicación concurrente?
 *
 * La restricción de exclusión de tarifas publicadas resuelve dos inserciones solapadas que se cruzan
 * dejando que cada transacción espere a la otra: PostgreSQL detecta el círculo y aborta una con
 * `deadlock detected` (SQLSTATE 40P01). Es la misma carrera que la violación de exclusión (23P01)
 * con otro desenlace —la que pierde no ha publicado nada, porque la transacción se deshace entera—
 * así que el borde debe responder el mismo 409 y no un 500 (CIF-542). La forma del error es la
 * misma que la de 23P01 (Prisma 7 lo envuelve en `P2039` con el SQLSTATE anidado), pero aquí no hay
 * nombre de restricción al que agarrarse: se busca el SQLSTATE en el grafo.
 */
export function isDeadlockDetected(error: unknown): boolean {
  return errorGraphMentions(error, [POSTGRES_DEADLOCK_DETECTED])
}

/** Códigos de Prisma para las violaciones de integridad que el borde debe traducir a dominio. */
const PRISMA_UNIQUE_VIOLATION = 'P2002'
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003'

/**
 * ¿El error (o alguno de los errores anidados) lleva ese código de Prisma?
 *
 * Prisma 7 envuelve el error del driver, y la restricción de exclusión ya se busca así (CIF-89). Se
 * recorre el grafo en lugar de depender de la forma concreta del error.
 */
function errorGraphHasCode(error: unknown, code: string): boolean {
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

    if (record.code === code) {
      return true
    }

    return Object.values(record).some(
      (child) => typeof child === 'object' && child !== null && inspect(child, depth + 1),
    )
  }

  return inspect(error, 0)
}

/**
 * ¿El error viene de violar un `@@unique` (código o slug ya ocupado)?
 *
 * La comprobación previa del caso de uso cubre el caso normal; esto evita un 500 en una carrera
 * entre dos altas con el mismo `code`. Se exporta para probarlo sin base de datos.
 */
export function isUniqueViolation(error: unknown): boolean {
  return errorGraphHasCode(error, PRISMA_UNIQUE_VIOLATION)
}

/** Formato de un id `@db.Uuid`; cualquier otra cosa no puede existir en la tabla. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * ¿El error viene de una clave ajena inexistente? Se traduce a `ResourceNotFoundError`: el llamante
 * mandó un id de acabado o complemento que no existe.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return errorGraphHasCode(error, PRISMA_FOREIGN_KEY_VIOLATION)
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
    // Un id sin formato de UUID no puede existir en una columna `@db.Uuid`: se responde `null`
    // (el borde lo traduce a 404) en vez de dejar que Prisma lance P2007 y salga un 500. En modo
    // demostración los ids del catálogo son legibles (`series-ci-100`), así que este camino es
    // normal ahí; en producción solo llega con un id manipulado.
    if (!isUuidLike(id)) {
      return null
    }

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
    try {
      await this.prisma.tariffVersion.upsert(tariffVersionUpsert(version))
    } catch (error) {
      // Defensa en profundidad: la comprobación previa del caso de uso no cubre dos publicaciones
      // concurrentes; aquí la base de datos ya ha rechazado el solape (CIF-89).
      if (isPublishedTariffOverlapViolation(error)) {
        throw new AmbiguousTariffError(
          `Ya hay una versión de tarifa publicada que se solapa con la versión ${version.versionNumber} de la serie "${version.seriesId}"`,
        )
      }

      // Dos escrituras simultáneas de la misma serie pueden acabar en bloqueo mutuo en vez de en la
      // violación de exclusión: PostgreSQL aborta una de las dos (40P01) y esa transacción se
      // deshace entera, así que el resultado es el mismo 409 —otra publicación de la serie ganó—
      // y no el 500 que salía por el borde (CIF-542).
      if (isDeadlockDetected(error)) {
        throw new AmbiguousTariffError(
          `Otra publicación concurrente de la serie "${version.seriesId}" ganó la carrera por la versión ${version.versionNumber}; vuelve a leer el catálogo y reintenta`,
        )
      }

      throw error
    }
  }

  /**
   * Alta de una versión nueva. El `@@unique([seriesId, versionNumber])` es la última red contra dos
   * altas concurrentes que hayan calculado el mismo número: se traduce a `ConflictError` (409) para
   * que el caso de uso pueda reintentar en vez de responder un 500.
   */
  async create(version: TariffVersion): Promise<void> {
    try {
      await this.prisma.tariffVersion.create({
        data: {
          id: version.id,
          seriesId: version.seriesId,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          ...mutableTariffVersionFields(version),
        },
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          `La serie "${version.seriesId}" ya tiene una versión de tarifa con el número ${version.versionNumber}`,
        )
      }

      throw error
    }
  }

  /**
   * Publica la sucesora y cierra la predecesora en **una transacción** (ADR-0003 rev. 2 §10): si
   * cualquiera de las dos escrituras falla —por ejemplo, porque el conjunto proyectado choca con la
   * restricción de exclusión de CIF-89— no queda ninguna de las dos a medias.
   *
   * La predecesora se actualiza **antes** que la sucesora: el orden de bloqueo es siempre el mismo
   * (de la más antigua a la más nueva) y dos publicaciones concurrentes de la misma serie no se
   * bloquean en cruzado. Las invariantes las comprueba el caso de uso antes de llegar aquí.
   */
  async savePublishTransition(transition: TariffPublishTransition): Promise<void> {
    const { successor, predecessor } = transition

    try {
      await this.prisma.$transaction(async (transaction) => {
        if (predecessor !== null) {
          await transaction.tariffVersion.update({
            where: { id: predecessor.id },
            data: mutableTariffVersionFields(predecessor),
          })
        }

        await transaction.tariffVersion.upsert(tariffVersionUpsert(successor))
      })
    } catch (error) {
      if (isPublishedTariffOverlapViolation(error)) {
        throw new AmbiguousTariffError(
          `Ya hay una versión de tarifa publicada que se solapa con la versión ${successor.versionNumber} de la serie "${successor.seriesId}"`,
        )
      }

      throw error
    }
  }

  async findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
    const row = await this.prisma.tariffVersion.findUnique({
      where: { id: tariffVersionId },
      select: { strategy: true, priceTable: { include: PRICE_TABLE_INCLUDE } },
    })

    if (row === null || row.priceTable === null) {
      return null
    }

    return toPriceTable(tariffVersionId, pricingStrategyToDomain(row.strategy), row.priceTable)
  }

  async savePriceTable(priceTable: PriceTable): Promise<void> {
    const tariffVersionId = priceTable.tariffVersionId

    await this.prisma.$transaction(async (transaction) => {
      await transaction.tariffPriceTable.upsert({
        where: { tariffVersionId },
        create: {
          tariffVersionId,
          perSquareMetreCents: priceTable.perSquareMetre?.cents ?? null,
          fixedPriceCents: priceTable.fixedPrice?.cents ?? null,
        },
        update: {
          perSquareMetreCents: priceTable.perSquareMetre?.cents ?? null,
          fixedPriceCents: priceTable.fixedPrice?.cents ?? null,
        },
      })

      // La tabla se reemplaza entera: la edición del panel envía el estado completo, así que las
      // filas que ya no vienen se borran (los presupuestos emitidos guardan su propia instantánea).
      await transaction.tariffSizeBand.deleteMany({
        where: { tariffPriceTableId: tariffVersionId },
      })
      await transaction.tariffSizeBand.createMany({
        data: priceTable.bands.map((band, index) => ({
          id: band.id,
          tariffPriceTableId: tariffVersionId,
          label: band.label === null ? Prisma.JsonNull : localizedTextToJson(band.label),
          minWidthMm: band.minWidthMm,
          maxWidthMm: band.maxWidthMm,
          minHeightMm: band.minHeightMm,
          maxHeightMm: band.maxHeightMm,
          priceCents: band.price.cents,
          sortOrder: index,
        })),
      })

      await transaction.tariffModifier.deleteMany({
        where: { tariffPriceTableId: tariffVersionId },
      })
      await transaction.tariffModifier.createMany({
        data: priceTable.modifiers.map((modifier, index) => ({
          id: modifier.id,
          tariffPriceTableId: tariffVersionId,
          code: modifier.code,
          label: modifier.label === null ? Prisma.JsonNull : localizedTextToJson(modifier.label),
          kind: modifierKindToDb(modifier.kind),
          target: modifierTargetToDb(modifier.target),
          ...modifierCatalogColumns(modifier),
          amountCents: modifier.amount?.cents ?? null,
          percentage: modifier.percentage,
          sortOrder: index,
        })),
      })
    })
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

/**
 * Traduce `catalog_text` a filas: *upsert* por idioma y borrado de los idiomas que ya no están.
 *
 * Un idioma sin traducción no debe dejar fila huérfana: si el propietario borra el inglés de un
 * nombre, la fila `en` desaparece y el configurador cae al idioma por defecto (ADR-0005).
 */
async function upsertCatalogTexts(
  transaction: Prisma.TransactionClient,
  entityType: $Enums.CatalogEntityType,
  entityId: string,
  fields: readonly ($Enums.CatalogTextField | null)[],
  text: LocalizedText | null,
): Promise<void> {
  for (const field of fields) {
    if (field === null) {
      continue
    }

    const rows = toCatalogTextRows(entityType, entityId, field, text)

    if (rows.length === 0) {
      // Sin texto no hay filas: se borran las que hubiera (el idioma se dejó vacío a propósito).
      await transaction.catalogText.deleteMany({ where: { entityType, entityId, field } })
      continue
    }

    await transaction.catalogText.deleteMany({
      where: { entityType, entityId, field, locale: { notIn: rows.map((row) => row.locale) } },
    })

    for (const row of rows) {
      await transaction.catalogText.upsert({
        where: {
          entityType_entityId_field_locale: {
            entityType,
            entityId,
            field,
            locale: row.locale,
          },
        },
        create: { entityType, entityId, field, locale: row.locale, value: row.value },
        update: { value: row.value },
      })
    }
  }
}

/** Textos de una serie: `name` siempre, `description` si la hay. */
async function saveSeriesTexts(
  transaction: Prisma.TransactionClient,
  series: DoorSeries,
): Promise<void> {
  await upsertCatalogTexts(transaction, 'SERIES', series.id, ['NAME'], series.name)
  await upsertCatalogTexts(transaction, 'SERIES', series.id, ['DESCRIPTION'], series.description)
}

/**
 * Escritura de series: *upsert* por id, con los vínculos de compatibilidad y los textos
 * multi-idioma reemplazados en la misma transacción.
 */
export class PrismaSeriesWriteRepository implements SeriesWriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByCode(code: string): Promise<DoorSeries | null> {
    const rows = await this.prisma.doorSeries.findMany({ where: { code }, include: SERIES_INCLUDE })

    return (await this.mapRows(rows))[0] ?? null
  }

  async findBySlug(slug: string): Promise<DoorSeries | null> {
    const rows = await this.prisma.doorSeries.findMany({ where: { slug }, include: SERIES_INCLUDE })

    return (await this.mapRows(rows))[0] ?? null
  }

  async save(series: DoorSeries): Promise<void> {
    const mutableFields = {
      code: series.code,
      slug: series.slug,
      status: catalogStatusToDb(series.status),
      minWidthMm: series.sizeRange.minWidthMm,
      maxWidthMm: series.sizeRange.maxWidthMm,
      minHeightMm: series.sizeRange.minHeightMm,
      maxHeightMm: series.sizeRange.maxHeightMm,
      sortOrder: series.sortOrder,
      updatedAt: series.updatedAt,
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.doorSeries.upsert({
          where: { id: series.id },
          create: { id: series.id, createdAt: series.createdAt, ...mutableFields },
          update: mutableFields,
        })

        await transaction.seriesFinish.deleteMany({ where: { seriesId: series.id } })

        if (series.allowedFinishIds.length > 0) {
          await transaction.seriesFinish.createMany({
            data: series.allowedFinishIds.map((finishId) => ({ seriesId: series.id, finishId })),
          })
        }

        await transaction.seriesAccessory.deleteMany({ where: { seriesId: series.id } })

        if (series.allowedAccessoryIds.length > 0) {
          await transaction.seriesAccessory.createMany({
            data: series.allowedAccessoryIds.map((accessoryId) => ({
              seriesId: series.id,
              accessoryId,
            })),
          })
        }

        await saveSeriesTexts(transaction, series)
      })
    } catch (error) {
      throw asCatalogWriteError(error, `la serie "${series.code}"`)
    }
  }

  private async mapRows(rows: readonly SeriesRow[]): Promise<readonly DoorSeries[]> {
    const texts = await fetchTexts(
      this.prisma,
      'SERIES',
      rows.map((row) => row.id),
    )

    return rows.map((row) => toDoorSeries(row, texts))
  }
}

/** Escritura de acabados: *upsert* por `code` con sus textos. */
export class PrismaFinishWriteRepository implements FinishWriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByCode(code: string): Promise<Finish | null> {
    const row = await this.prisma.finish.findUnique({ where: { code } })

    if (row === null) {
      return null
    }

    const texts = await fetchTexts(this.prisma, 'FINISH', [row.id])

    return toFinish(row, texts.get(row.id))
  }

  async save(finish: Finish): Promise<void> {
    const mutableFields = {
      code: finish.code,
      status: catalogStatusToDb(finish.status),
      sortOrder: finish.sortOrder,
      updatedAt: finish.updatedAt,
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.finish.upsert({
          where: { id: finish.id },
          create: { id: finish.id, createdAt: finish.createdAt, ...mutableFields },
          update: mutableFields,
        })

        await upsertCatalogTexts(transaction, 'FINISH', finish.id, ['NAME'], finish.name)
        await upsertCatalogTexts(
          transaction,
          'FINISH',
          finish.id,
          ['DESCRIPTION'],
          finish.description,
        )
      })
    } catch (error) {
      throw asCatalogWriteError(error, `el acabado "${finish.code}"`)
    }
  }
}

/** Escritura de colores: *upsert* por `(finishId, code)` con su nombre. */
export class PrismaColorWriteRepository implements ColorWriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByFinishIdAndCode(finishId: string, code: string): Promise<Color | null> {
    const row = await this.prisma.color.findUnique({
      where: { finishId_code: { finishId, code } },
    })

    if (row === null) {
      return null
    }

    const texts = await fetchTexts(this.prisma, 'COLOR', [row.id])

    return toColor(row, texts.get(row.id))
  }

  async save(color: Color): Promise<void> {
    const mutableFields = {
      finishId: color.finishId,
      code: color.code,
      hex: color.hex,
      status: catalogStatusToDb(color.status),
      sortOrder: color.sortOrder,
      updatedAt: color.updatedAt,
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.color.upsert({
          where: { id: color.id },
          create: { id: color.id, createdAt: color.createdAt, ...mutableFields },
          update: mutableFields,
        })

        await upsertCatalogTexts(transaction, 'COLOR', color.id, ['NAME'], color.name)
      })
    } catch (error) {
      throw asCatalogWriteError(error, `el color "${color.code}"`)
    }
  }
}

/** Escritura de complementos: *upsert* por `code` con sus textos. */
export class PrismaAccessoryWriteRepository implements AccessoryWriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByCode(code: string): Promise<Accessory | null> {
    const row = await this.prisma.accessory.findUnique({ where: { code } })

    if (row === null) {
      return null
    }

    const texts = await fetchTexts(this.prisma, 'ACCESSORY', [row.id])

    return toAccessory(row, texts.get(row.id))
  }

  async save(accessory: Accessory): Promise<void> {
    const mutableFields = {
      code: accessory.code,
      category: accessoryCategoryToDb(accessory.category),
      status: catalogStatusToDb(accessory.status),
      sortOrder: accessory.sortOrder,
      updatedAt: accessory.updatedAt,
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.accessory.upsert({
          where: { id: accessory.id },
          create: { id: accessory.id, createdAt: accessory.createdAt, ...mutableFields },
          update: mutableFields,
        })

        await upsertCatalogTexts(transaction, 'ACCESSORY', accessory.id, ['NAME'], accessory.name)
        await upsertCatalogTexts(
          transaction,
          'ACCESSORY',
          accessory.id,
          ['DESCRIPTION'],
          accessory.description,
        )
      })
    } catch (error) {
      throw asCatalogWriteError(error, `el complemento "${accessory.code}"`)
    }
  }
}

/**
 * Consultas de uso del catálogo vivo para las guardas de desactivación (CIF-126a).
 *
 * Cada método pregunta lo mínimo: una serie con tarifa publicada y vigente, un vínculo de serie no
 * archivada o un color no archivado.
 */
export class PrismaCatalogUsageReader implements CatalogUsageReader {
  constructor(private readonly prisma: PrismaClient) {}

  async seriesHasTariffInForce(seriesId: string, instant: Date): Promise<boolean> {
    const row = await this.prisma.tariffVersion.findFirst({
      where: {
        seriesId,
        status: 'PUBLISHED',
        validFrom: { lte: instant },
        OR: [{ validUntil: null }, { validUntil: { gt: instant } }],
      },
      select: { id: true },
    })

    return row !== null
  }

  async isFinishAllowedByLiveSeries(finishId: string): Promise<boolean> {
    const row = await this.prisma.seriesFinish.findFirst({
      where: { finishId, series: { status: { not: 'ARCHIVED' } } },
      select: { seriesId: true },
    })

    return row !== null
  }

  async isAccessoryAllowedByLiveSeries(accessoryId: string): Promise<boolean> {
    const row = await this.prisma.seriesAccessory.findFirst({
      where: { accessoryId, series: { status: { not: 'ARCHIVED' } } },
      select: { seriesId: true },
    })

    return row !== null
  }

  async finishHasLiveColors(finishId: string): Promise<boolean> {
    const row = await this.prisma.color.findFirst({
      where: { finishId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    })

    return row !== null
  }
}

/** Traduce las violaciones de integridad del catálogo a errores de dominio estables. */
function asCatalogWriteError(error: unknown, subject: string): unknown {
  if (isUniqueViolation(error)) {
    return new ConflictError(`Ya existe ${subject} con ese código o slug`)
  }

  if (isForeignKeyViolation(error)) {
    return new InvalidValueError(`Al guardar ${subject} se referenció un elemento que no existe`)
  }

  return error
}
