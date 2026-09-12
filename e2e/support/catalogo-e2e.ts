/**
 * Catálogo sintético con el que se siembra la base efímera del E2E (ADR-0027 §5).
 *
 * La fuente es el mismo catálogo de demostración que sirve `src/infrastructure/demo/demo-catalog.ts`
 * cuando no hay base de datos: datos **inventados**, ningún dato del propietario (ADR-0014 §1,
 * ADR-0017 §2). Sembrarlo en PostgreSQL es lo que permite que los dos `webServer` de la suite
 * compartan estado y que el flujo 3 (cambiar un precio en el panel y verlo en el configurador) sea
 * observable.
 *
 * Las columnas del esquema son `@db.Uuid` y el catálogo de demostración usa ids legibles
 * (`series-ci-100`), así que cada id se traduce a un UUID determinista (`catalogUuid`): la siembra es
 * idempotente entre ejecuciones y los specs leen los ids del catálogo sembrado en `E2E_CATALOG` en
 * vez de repetir literales.
 */

import { createHash } from 'node:crypto'

import { Prisma, type PrismaClient } from '@prisma/client'

import type { AccessoryCategory } from '@/domain/catalog/accessory'
import type { LocalizedText } from '@/domain/catalog/catalog-text'
import { buildDemoCatalog } from '@/infrastructure/demo/demo-catalog'
import type { CatalogStoreSnapshot } from '@/infrastructure/persistence/in-memory/catalog-store'
import {
  catalogStatusToDb,
  localizedTextToJson,
  modifierKindToDb,
  modifierTargetToDb,
  pricingStrategyToDb,
} from '@/infrastructure/persistence/prisma/mappers'

/** Prefijo de los ids sintéticos: el mismo que usan el catálogo demo y la siembra de preview. */
const SYNTHETIC_ID_PREFIX = '0192f1b0-0000-7000-8000-'

/**
 * Id determinista con forma de UUID para el catálogo del E2E. El prefijo es el de los datos
 * sintéticos del proyecto, así que un volcado de la base se reconoce de un vistazo; el resto es el
 * hash del id legible del catálogo demo, que es lo que lo hace estable entre ejecuciones.
 */
export function catalogUuid(demoId: string): string {
  const digest = createHash('sha1').update(`e2e:${demoId}`).digest('hex')

  return `${SYNTHETIC_ID_PREFIX}${digest.slice(0, 12)}`
}

const snapshot: CatalogStoreSnapshot = buildDemoCatalog()

function demoSeries(slug: string) {
  const series = snapshot.series.find((candidate) => candidate.slug === slug)

  if (series === undefined) {
    throw new Error(`El catálogo de demostración no tiene la serie "${slug}"`)
  }

  return series
}

function demoPublished(seriesSlug: string) {
  const seriesId = demoSeries(seriesSlug).id
  const pricing = snapshot.pricing.find((entry) => entry.tariff.seriesId === seriesId)

  if (pricing === undefined) {
    throw new Error(`El catálogo de demostración no tiene tarifa para la serie "${seriesSlug}"`)
  }

  return pricing
}

function demoDraft(seriesSlug: string, versionNumber: number) {
  const seriesId = demoSeries(seriesSlug).id
  const draft = (snapshot.tariffVersions ?? []).find(
    (version) =>
      version.seriesId === seriesId &&
      version.versionNumber === versionNumber &&
      version.status === 'draft',
  )

  if (draft === undefined) {
    throw new Error(
      `El catálogo de demostración no tiene el borrador v${versionNumber} de "${seriesSlug}"`,
    )
  }

  return draft
}

function demoModifier(seriesSlug: string, target: string) {
  const modifier = demoPublished(seriesSlug).priceTable.modifiers.find(
    (candidate) => candidate.target === target,
  )

  if (modifier === undefined) {
    throw new Error(`La tarifa de "${seriesSlug}" no tiene modificador para "${target}"`)
  }

  return modifier
}

function demoBand(seriesSlug: string, index: number) {
  const band = demoPublished(seriesSlug).priceTable.bands[index]

  if (band === undefined) {
    throw new Error(`La tarifa de "${seriesSlug}" no tiene la banda ${index + 1}`)
  }

  return band
}

/**
 * Ids del catálogo sembrado que los specs del panel necesitan para **no compartir estado mutable**:
 * los proyectos `chromium` y `movil` corren en paralelo, así que cada uno tiene que publicar o
 * editar su propia entidad (criterio 2 de la revisión de CIF-86, requisito 2 de CIF-490).
 */
export const E2E_CATALOG = {
  series: {
    ci100: catalogUuid(demoSeries('ci-100').id),
    ci200: catalogUuid(demoSeries('ci-200').id),
    ci300: catalogUuid(demoSeries('ci-300').id),
    ci400: catalogUuid(demoSeries('ci-400').id),
  },
  tariffs: {
    ci100V1: demoPublished('ci-100').tariff.id,
    ci200V1: demoPublished('ci-200').tariff.id,
    ci300V1: demoPublished('ci-300').tariff.id,
    ci100V2Draft: demoDraft('ci-100', 2).id,
    ci400Draft2027: demoDraft('ci-400', 1).id,
    ci400Draft2029: demoDraft('ci-400', 2).id,
  },
  bands: {
    ci200Medium: demoBand('ci-200', 0).id,
    ci200Wide: demoBand('ci-200', 1).id,
    ci200Tall: demoBand('ci-200', 2).id,
  },
  modifiers: {
    ci100Finish: demoModifier('ci-100', 'finish').id,
    ci100Color: demoModifier('ci-100', 'color').id,
    ci100Accessory: demoModifier('ci-100', 'accessory').id,
    ci100Installation: demoModifier('ci-100', 'installation').id,
    ci100Shipping: demoModifier('ci-100', 'shipping').id,
    ci100Urgency: demoModifier('ci-100', 'urgency').id,
    ci100Discount: demoModifier('ci-100', 'discount').id,
  },
} as const

const ENTITY_TYPE = {
  series: 'SERIES',
  finish: 'FINISH',
  color: 'COLOR',
  accessory: 'ACCESSORY',
} as const

type CatalogEntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE]

const ACCESSORY_CATEGORY_TO_DB: Record<
  AccessoryCategory,
  'HARDWARE' | 'CLOSING' | 'GLASS' | 'VENTILATION' | 'OTHER'
> = {
  hardware: 'HARDWARE',
  closing: 'CLOSING',
  glass: 'GLASS',
  ventilation: 'VENTILATION',
  other: 'OTHER',
}

/**
 * Borradores publicables: el spec de publicación los publica (`200`). Desde ADR-0027 §4 una versión
 * sin tabla de precios **no se publica**, así que estos dos llevan una tabla mínima. Sus vigencias
 * son futuras (2027 y 2029), así que publicarlas no cambia el precio vigente de CI-400: hoy la serie
 * sigue pasando a presupuesto manual, como espera `e2e/catalog-api.spec.ts`.
 */
const PUBLISHABLE_DRAFT_PRICES: readonly { readonly id: string; readonly cents: bigint }[] = [
  { id: demoDraft('ci-400', 1).id, cents: 40_000n },
  { id: demoDraft('ci-400', 2).id, cents: 42_000n },
]

interface CatalogTextRow {
  readonly entityType: CatalogEntityType
  readonly entityId: string
  readonly field: 'NAME' | 'DESCRIPTION'
  readonly locale: string
  readonly value: string
}

function catalogTexts(
  entityType: CatalogEntityType,
  entityId: string,
  name: LocalizedText | null,
  description: LocalizedText | null,
): readonly CatalogTextRow[] {
  const rows: CatalogTextRow[] = []

  for (const [field, text] of [
    ['NAME', name],
    ['DESCRIPTION', description],
  ] as const) {
    if (text === null) {
      continue
    }

    for (const locale of text.availableLocales()) {
      rows.push({ entityType, entityId, field, locale, value: text.resolve(locale) })
    }
  }

  return rows
}

/** Resumen de la siembra: solo recuentos, para el registro de la suite. */
export interface SeedSummary {
  readonly series: number
  readonly finishes: number
  readonly colors: number
  readonly accessories: number
  readonly tariffVersions: number
}

/**
 * Siembra el catálogo de demostración en la base efímera. Es **idempotente** (upserts por id
 * determinista) y **rearma** lo que los specs mutan: los borradores vuelven a `DRAFT` y sin fecha de
 * publicación, así que una ejecución no depende de la anterior.
 */
export async function seedCatalogoE2e(prisma: PrismaClient): Promise<SeedSummary> {
  const texts: CatalogTextRow[] = []

  for (const finish of snapshot.finishes) {
    const id = catalogUuid(finish.id)
    const data = {
      code: finish.code,
      status: catalogStatusToDb(finish.status),
      sortOrder: finish.sortOrder,
    }

    await prisma.finish.upsert({ where: { id }, create: { id, ...data }, update: data })
    texts.push(...catalogTexts(ENTITY_TYPE.finish, id, finish.name, finish.description))
  }

  for (const color of snapshot.colors) {
    const id = catalogUuid(color.id)
    const data = {
      finishId: catalogUuid(color.finishId),
      code: color.code,
      hex: color.hex,
      status: catalogStatusToDb(color.status),
      sortOrder: color.sortOrder,
    }

    await prisma.color.upsert({ where: { id }, create: { id, ...data }, update: data })
    texts.push(...catalogTexts(ENTITY_TYPE.color, id, color.name, null))
  }

  for (const accessory of snapshot.accessories) {
    const id = catalogUuid(accessory.id)
    const data = {
      code: accessory.code,
      category: ACCESSORY_CATEGORY_TO_DB[accessory.category],
      status: catalogStatusToDb(accessory.status),
      sortOrder: accessory.sortOrder,
    }

    await prisma.accessory.upsert({ where: { id }, create: { id, ...data }, update: data })
    texts.push(...catalogTexts(ENTITY_TYPE.accessory, id, accessory.name, accessory.description))
  }

  for (const series of snapshot.series) {
    const id = catalogUuid(series.id)
    const range = series.sizeRange
    const data = {
      code: series.code,
      slug: series.slug,
      status: catalogStatusToDb(series.status),
      minWidthMm: range.minWidthMm,
      maxWidthMm: range.maxWidthMm,
      minHeightMm: range.minHeightMm,
      maxHeightMm: range.maxHeightMm,
      sortOrder: series.sortOrder,
    }

    await prisma.doorSeries.upsert({ where: { id }, create: { id, ...data }, update: data })

    for (const finishId of series.allowedFinishIds) {
      const link = { seriesId: id, finishId: catalogUuid(finishId) }

      await prisma.seriesFinish.upsert({
        where: { seriesId_finishId: link },
        create: link,
        update: {},
      })
    }

    for (const accessoryId of series.allowedAccessoryIds) {
      const link = { seriesId: id, accessoryId: catalogUuid(accessoryId) }

      await prisma.seriesAccessory.upsert({
        where: { seriesId_accessoryId: link },
        create: link,
        update: {},
      })
    }

    texts.push(...catalogTexts(ENTITY_TYPE.series, id, series.name, series.description))
  }

  const tariffs = snapshot.tariffVersions ?? snapshot.pricing.map((entry) => entry.tariff)

  for (const tariff of tariffs) {
    const data = {
      seriesId: catalogUuid(tariff.seriesId),
      versionNumber: tariff.versionNumber,
      status: catalogStatusToDb(tariff.status),
      strategy: pricingStrategyToDb(tariff.strategy),
      validFrom: tariff.validity.validFrom,
      validUntil: tariff.validity.validUntil,
      taxRatePercent: new Prisma.Decimal(tariff.taxRatePercent),
      currency: tariff.currency,
      notes: tariff.notes,
      publishedAt: tariff.publishedAt,
    }

    await prisma.tariffVersion.upsert({
      where: { id: tariff.id },
      create: { id: tariff.id, ...data, createdAt: tariff.createdAt, updatedAt: tariff.updatedAt },
      update: data,
    })
  }

  for (const { tariff, priceTable } of snapshot.pricing) {
    const table = {
      perSquareMetreCents: priceTable.perSquareMetre?.cents ?? null,
      fixedPriceCents: priceTable.fixedPrice?.cents ?? null,
    }

    await prisma.tariffPriceTable.upsert({
      where: { tariffVersionId: tariff.id },
      create: { tariffVersionId: tariff.id, ...table },
      update: table,
    })

    for (const [index, band] of priceTable.bands.entries()) {
      const key = { tariffPriceTableId: tariff.id, sortOrder: index + 1 }
      const data = {
        label: band.label === null ? Prisma.DbNull : localizedTextToJson(band.label),
        minWidthMm: band.minWidthMm,
        maxWidthMm: band.maxWidthMm,
        minHeightMm: band.minHeightMm,
        maxHeightMm: band.maxHeightMm,
        priceCents: band.price.cents,
      }

      await prisma.tariffSizeBand.upsert({
        where: { tariffPriceTableId_sortOrder: key },
        create: { id: catalogUuid(band.id), ...key, ...data },
        update: data,
      })
    }

    for (const [index, modifier] of priceTable.modifiers.entries()) {
      const data = {
        label: modifier.label === null ? Prisma.DbNull : localizedTextToJson(modifier.label),
        kind: modifierKindToDb(modifier.kind),
        target: modifierTargetToDb(modifier.target),
        // El descuento guarda su referencia en `discount_code`; el resto, la del catálogo (CIF-74).
        discountCode: modifier.target === 'discount' ? modifier.targetId : null,
        finishId: modifier.target === 'finish' ? catalogUuid(modifier.targetId ?? '') : null,
        colorId: modifier.target === 'color' ? catalogUuid(modifier.targetId ?? '') : null,
        accessoryId: modifier.target === 'accessory' ? catalogUuid(modifier.targetId ?? '') : null,
        amountCents: modifier.amount?.cents ?? null,
        percentage: modifier.percentage === null ? null : new Prisma.Decimal(modifier.percentage),
      }

      await prisma.tariffModifier.upsert({
        where: { tariffPriceTableId_code: { tariffPriceTableId: tariff.id, code: modifier.code } },
        create: {
          id: catalogUuid(modifier.id),
          tariffPriceTableId: tariff.id,
          code: modifier.code,
          sortOrder: index + 1,
          ...data,
        },
        update: { sortOrder: index + 1, ...data },
      })
    }
  }

  for (const draft of PUBLISHABLE_DRAFT_PRICES) {
    const table = { perSquareMetreCents: draft.cents, fixedPriceCents: null }

    await prisma.tariffPriceTable.upsert({
      where: { tariffVersionId: draft.id },
      create: { tariffVersionId: draft.id, ...table },
      update: table,
    })
  }

  for (const text of texts) {
    const key = {
      entityType: text.entityType,
      entityId: text.entityId,
      field: text.field,
      locale: text.locale,
    }

    await prisma.catalogText.upsert({
      where: { entityType_entityId_field_locale: key },
      create: { ...key, value: text.value },
      update: { value: text.value },
    })
  }

  return {
    series: snapshot.series.length,
    finishes: snapshot.finishes.length,
    colors: snapshot.colors.length,
    accessories: snapshot.accessories.length,
    tariffVersions: tariffs.length,
  }
}
