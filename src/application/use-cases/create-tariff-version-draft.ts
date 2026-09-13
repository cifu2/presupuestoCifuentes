/**
 * Caso de uso: abrir la siguiente versión de tarifa en borrador (CIF-126a, ADR-0003).
 *
 * Es la puerta de entrada del flujo «el propietario cambia un precio y se refleja en el configurador
 * sin tocar código» (criterio 1 de CIF-9): `updateTariffPrice` solo escribe en `draft` y lanza
 * `TariffVersionNotEditableError` en cualquier otro estado, así que una serie cuya última versión ya
 * está publicada necesita abrir un borrador nuevo antes de poder editar precios.
 *
 * Abrir un borrador **no** cambia lo que ve el configurador: la versión nace en `draft`, sin
 * `publishedAt`, y solo el caso de uso de publicación la pone en vigor.
 *
 * Decisiones de diseño:
 *
 * - El `versionNumber` es el siguiente entero libre de la serie (`máximo + 1`) y lo asigna este caso
 *   de uso, que es quien conoce el histórico completo. Como dos altas concurrentes podrían calcular
 *   el mismo número, el puerto `create` falla con `ConflictError` y aquí se reintenta con el número
 *   recalculado.
 * - Clonar es opcional y explícito (`cloneFromVersionId`): hereda estrategia, IVA, moneda y notas de
 *   la versión origen y copia su tabla de precios con **ids nuevos** (bandas y modificadores forman
 *   parte del agregado de la versión y no se pueden compartir).
 * - Sin origen que clonar hay que declarar la estrategia y el IVA: son decisiones de negocio (CIF-13)
 *   que este caso de uso no inventa.
 * - La vigencia por defecto del clon continúa la del origen (`validFrom` = el día en que termina la
 *   versión origen) para que publicar el sucesor no se solape con él; si el origen no tiene fin de
 *   vigencia, el borrador empieza el día en que se abre.
 */

import { TariffVersion, type PricingStrategy } from '@/domain/catalog/tariff-version'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import { PriceModifier, PriceTable, SizeBand } from '@/domain/pricing/price-table'
import {
  ConflictError,
  InvalidTariffVersionError,
  ResourceNotFoundError,
} from '@/domain/shared/errors'

import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'

import { toPriceTableOutput, type PriceTableOutput } from './catalog-write-output'

export interface CreateTariffVersionDraftDeps {
  readonly tariffVersionRepository: TariffVersionRepository
  readonly seriesRepository: SeriesRepository
  readonly idGenerator: IdGenerator
  readonly clock: Clock
}

export interface CreateTariffVersionDraftInput {
  readonly seriesId: string
  /** Versión de la que se hereda la configuración de tarifa y, si tiene, su tabla de precios. */
  readonly cloneFromVersionId?: string | null
  /** Primer día de vigencia (ISO 8601). Por defecto, el que se deriva del origen o el día de hoy. */
  readonly validFrom?: string | null
  /** Último día de vigencia exclusivo; `null` (por defecto) deja la vigencia abierta. */
  readonly validUntil?: string | null
  /** Omitido (`undefined`) hereda las del origen; `null` las deja vacías a propósito. */
  readonly notes?: string | null | undefined
  /** Solo puede faltar si se clona de otra versión, que ya la declara. */
  readonly strategy?: PricingStrategy | null
  /** Solo puede faltar si se clona de otra versión, que ya la declara. */
  readonly taxRatePercent?: string | null
  /** Solo puede faltar si se clona de otra versión; por defecto `EUR`. */
  readonly currency?: string | null
}

export interface TariffVersionDraftOutput {
  readonly id: string
  readonly seriesId: string
  readonly versionNumber: number
  readonly status: 'draft'
  readonly strategy: PricingStrategy
  readonly validFrom: string
  readonly validUntil: string | null
  readonly currency: string
  readonly taxRatePercent: string
  readonly notes: string | null
  readonly createdAt: string
  readonly updatedAt: string
  /** Tabla clonada del origen, lista para editar; `null` si no se clonó o el origen no tenía. */
  readonly priceTable: PriceTableOutput | null
}

/** Intentos de asignación del `versionNumber` antes de rendirse ante un conflicto. */
export const VERSION_NUMBER_ATTEMPTS = 3

const DEFAULT_CURRENCY = 'EUR'

export async function createTariffVersionDraft(
  deps: CreateTariffVersionDraftDeps,
  input: CreateTariffVersionDraftInput,
): Promise<TariffVersionDraftOutput> {
  const series = await deps.seriesRepository.findById(input.seriesId)

  if (series === null) {
    throw new ResourceNotFoundError(`No existe la serie "${input.seriesId}"`)
  }

  const source = await resolveCloneSource(deps, input)
  const strategy = source?.strategy ?? input.strategy ?? undefined
  const taxRatePercent = source?.taxRatePercent ?? input.taxRatePercent ?? undefined

  if (strategy === undefined || taxRatePercent === undefined) {
    throw new InvalidTariffVersionError(
      'Para abrir la primera versión de una serie hay que declarar su estrategia de cálculo y su IVA; o clonar una versión existente',
    )
  }

  const now = deps.clock.now()
  const validity = ValidityPeriod.of(
    parseInstant(input.validFrom) ?? defaultValidFrom(source, now),
    parseInstant(input.validUntil),
  )
  const notes = input.notes === undefined ? (source?.notes ?? null) : input.notes
  const currency = source?.currency ?? input.currency ?? DEFAULT_CURRENCY
  const sourcePriceTable =
    source === null ? null : await deps.tariffVersionRepository.findPriceTableByVersionId(source.id)

  let conflict: ConflictError | null = null

  for (let attempt = 0; attempt < VERSION_NUMBER_ATTEMPTS; attempt += 1) {
    const versions = await deps.tariffVersionRepository.listBySeriesId(series.id)
    const draft = TariffVersion.create({
      id: deps.idGenerator.nextId(),
      seriesId: series.id,
      versionNumber: nextVersionNumber(versions),
      status: 'draft',
      strategy,
      validity,
      taxRatePercent,
      currency,
      notes,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    try {
      await deps.tariffVersionRepository.create(draft)
    } catch (error) {
      // Otra alta concurrente se quedó con ese `versionNumber`: se recalcula y se reintenta.
      if (error instanceof ConflictError) {
        conflict = error
        continue
      }

      throw error
    }

    const priceTable =
      sourcePriceTable === null ? null : clonePriceTable(sourcePriceTable, draft, deps.idGenerator)

    if (priceTable !== null) {
      await deps.tariffVersionRepository.savePriceTable(priceTable)
    }

    return toTariffVersionDraftOutput(draft, priceTable)
  }

  throw (
    conflict ??
    new ConflictError(
      `No se pudo asignar un número de versión libre a la serie "${series.id}"; vuelve a intentarlo`,
    )
  )
}

/** El origen del clon, si se pidió: tiene que existir y ser de la misma serie. */
async function resolveCloneSource(
  deps: CreateTariffVersionDraftDeps,
  input: CreateTariffVersionDraftInput,
): Promise<TariffVersion | null> {
  if (input.cloneFromVersionId === undefined || input.cloneFromVersionId === null) {
    return null
  }

  const source = await deps.tariffVersionRepository.findById(input.cloneFromVersionId)

  if (source === null) {
    throw new ResourceNotFoundError(`No existe la versión de tarifa "${input.cloneFromVersionId}"`)
  }

  if (source.seriesId !== input.seriesId) {
    throw new InvalidTariffVersionError(
      `La versión "${source.id}" pertenece a la serie "${source.seriesId}"; no se puede clonar en la serie "${input.seriesId}"`,
    )
  }

  return source
}

function nextVersionNumber(versions: readonly TariffVersion[]): number {
  return versions.reduce((highest, version) => Math.max(highest, version.versionNumber), 0) + 1
}

/**
 * La vigencia del clon continúa la del origen: empieza el día en que el origen deja de valer. Solo
 * aplica cuando el origen tiene fin de vigencia; si es de vigencia abierta, el borrador empieza hoy
 * (publicarlo exigirá cerrar antes el origen, que sigue en vigor).
 */
function defaultValidFrom(source: TariffVersion | null, now: Date): Date {
  return source?.validity.validUntil === null || source === null
    ? startOfUtcDay(now)
    : startOfUtcDay(source.validity.validUntil)
}

function startOfUtcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()))
}

/** La columna es `@db.Date`: se compara por día UTC, no por instante. */
function parseInstant(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) {
    return null
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidTariffVersionError(`"${value}" no es una fecha ISO 8601 válida`)
  }

  return startOfUtcDay(parsed)
}

/** La tabla de precios vive dentro de la versión: se copia con ids nuevos, no se comparte. */
function clonePriceTable(
  source: PriceTable,
  draft: TariffVersion,
  idGenerator: IdGenerator,
): PriceTable {
  return PriceTable.create({
    tariffVersionId: draft.id,
    strategy: source.strategy,
    perSquareMetre: source.perSquareMetre,
    fixedPrice: source.fixedPrice,
    bands: source.bands.map((band) => SizeBand.create({ ...band, id: idGenerator.nextId() })),
    modifiers: source.modifiers.map((modifier) =>
      PriceModifier.create({ ...modifier, id: idGenerator.nextId() }),
    ),
  })
}

export function toTariffVersionDraftOutput(
  draft: TariffVersion,
  priceTable: PriceTable | null,
): TariffVersionDraftOutput {
  return {
    id: draft.id,
    seriesId: draft.seriesId,
    versionNumber: draft.versionNumber,
    status: 'draft',
    strategy: draft.strategy,
    validFrom: draft.validity.validFrom.toISOString(),
    validUntil: draft.validity.validUntil?.toISOString() ?? null,
    currency: draft.currency,
    taxRatePercent: draft.taxRatePercent,
    notes: draft.notes,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    priceTable: priceTable === null ? null : toPriceTableOutput(priceTable, draft.currency),
  }
}
