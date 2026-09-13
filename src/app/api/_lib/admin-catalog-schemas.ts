/**
 * Contratos de entrada de la escritura del catálogo del panel (CIF-243, ADR-0023 §7).
 *
 * Zod comprueba **forma** en el borde —tipos, longitudes, enumerados y el formato del dinero— y
 * nada más. Las reglas de negocio (idioma por defecto obligatorio, idempotencia por `code`,
 * transiciones de estado, coherencia de los rangos y guardas de «en uso») viven en el caso de uso y
 * en el dominio, que es su único dueño (ADR-0001): duplicarlas aquí crearía dos verdades.
 *
 * Convención de identificadores, la del resto del borde:
 *
 * - en la **ruta** (`:id`) el valor es una columna `@db.Uuid`, así que se valida como UUID
 *   (`admin-resource.ts`, hallazgo N2 de CIF-85);
 * - en el **cuerpo**, las referencias (`finishId`, `colorId`, `targetId`, ids de banda o de
 *   modificador) son cadenas no vacías, igual que en `configurationSchema`: el catálogo de
 *   demostración siembra ids legibles y el adaptador responde `NOT_FOUND` si no existen.
 */

import { z } from 'zod'

import { ACCESSORY_CATEGORIES } from '@/domain/catalog/accessory'
import { CATALOG_STATUSES } from '@/domain/catalog/catalog-status'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/domain/catalog/locale'
import { MAX_DIMENSION_MM, MIN_DIMENSION_MM } from '@/domain/catalog/measurement'
import { MODIFIER_KINDS, MODIFIER_TARGETS } from '@/domain/pricing/price-table'

/**
 * Importe decimal exacto con su signo (`-12.5` es válido: un modificador puede ser un descuento) y
 * sin notación exponencial, que `Money.fromDecimalString` no acepta.
 */
const decimalSchema = z
  .string()
  .regex(/^-?\d{1,9}(\.\d{1,4})?$/, { error: 'El importe debe ser un decimal como "1234.56"' })

const referenceSchema = z.string().min(1).max(80)

const textSchema = z.string().trim().min(1).max(200)

/**
 * Texto multi-idioma de un *upsert*: cualquier idioma soportado, con el idioma por defecto
 * obligatorio. `LocalizedText.of` vuelve a comprobarlo —es la regla del dominio— y responde
 * `INVALID_CATALOG_TEXT` si llega vacío o sin `es`.
 */
export const localizedTextSchema = z
  .object({
    ...Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, textSchema.optional()])),
    [DEFAULT_LOCALE]: textSchema,
  })
  .strict()

/**
 * Cambio parcial de un texto: `undefined`/ausente = no tocar, `null` = borrar esa traducción,
 * cadena no vacía = escribirla (`LocalizedTextPatch` del caso de uso).
 */
export const localizedTextPatchSchema = z
  .object(
    Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [locale, textSchema.nullable().optional()]),
    ),
  )
  .strict()

const dimensionSchema = z.number().int().min(MIN_DIMENSION_MM).max(MAX_DIMENSION_MM)

export const measurementLimitsSchema = z
  .object({
    minWidthMm: dimensionSchema,
    maxWidthMm: dimensionSchema,
    minHeightMm: dimensionSchema,
    maxHeightMm: dimensionSchema,
  })
  .strict()

const catalogStatusSchema = z.enum(CATALOG_STATUSES)

const sortOrderSchema = z.number().int().min(0).max(10_000)

const catalogItemIdsSchema = z.array(referenceSchema).max(200)

/**
 * Claves opcionales de un cuerpo ya validado, sin el `| undefined` que añade Zod.
 *
 * El `tsconfig` activa `exactOptionalPropertyTypes` y los puertos de escritura distinguen «clave
 * ausente» de «clave presente con `undefined`»: en una edición parcial significan lo mismo —no
 * tocar—, así que el borde descarta las claves no enviadas antes de llamar al caso de uso. Sin esto,
 * `undefined` explícito sobrescribiría el valor actual (o rompería la compilación del puerto).
 */
export type AbsentCleared<T> = {
  [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined>
}

export function withoutAbsent<T extends object>(payload: T): AbsentCleared<T> {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined)

  return Object.fromEntries(entries) as AbsentCleared<T>
}

export const upsertSeriesSchema = z
  .object({
    code: referenceSchema,
    slug: referenceSchema,
    name: localizedTextSchema,
    description: localizedTextSchema.nullable().optional(),
    limits: measurementLimitsSchema,
    allowedFinishIds: catalogItemIdsSchema.optional(),
    allowedAccessoryIds: catalogItemIdsSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    status: catalogStatusSchema.optional(),
  })
  .strict()

export const updateSeriesSchema = z
  .object({
    slug: referenceSchema.optional(),
    name: localizedTextPatchSchema.optional(),
    description: localizedTextPatchSchema.nullable().optional(),
    limits: measurementLimitsSchema.optional(),
    allowedFinishIds: catalogItemIdsSchema.optional(),
    allowedAccessoryIds: catalogItemIdsSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    status: catalogStatusSchema.optional(),
  })
  .strict()

export const upsertFinishSchema = z
  .object({
    code: referenceSchema,
    name: localizedTextSchema,
    description: localizedTextSchema.nullable().optional(),
    sortOrder: sortOrderSchema.optional(),
    status: catalogStatusSchema.optional(),
  })
  .strict()

export const upsertColorSchema = z
  .object({
    finishId: referenceSchema,
    code: referenceSchema,
    name: localizedTextSchema,
    hex: z.string().trim().max(16).nullable().optional(),
    sortOrder: sortOrderSchema.optional(),
    status: catalogStatusSchema.optional(),
  })
  .strict()

export const upsertAccessorySchema = z
  .object({
    code: referenceSchema,
    name: localizedTextSchema,
    description: localizedTextSchema.nullable().optional(),
    category: z.enum(ACCESSORY_CATEGORIES).optional(),
    sortOrder: sortOrderSchema.optional(),
    status: catalogStatusSchema.optional(),
  })
  .strict()

/** Elementos de catálogo con desactivación propia; su `:entity` vive en la ruta. */
export const catalogItemEntitySchema = z.enum(['finish', 'color', 'accessory'])

export type CatalogItemEntityPayload = z.infer<typeof catalogItemEntitySchema>

const priceBandSchema = z
  .object({
    id: referenceSchema.optional(),
    label: localizedTextSchema.nullable().optional(),
    minWidthMm: dimensionSchema,
    maxWidthMm: dimensionSchema,
    minHeightMm: dimensionSchema,
    maxHeightMm: dimensionSchema,
    price: decimalSchema,
  })
  .strict()
  .transform(withoutAbsent)

const priceModifierSchema = z
  .object({
    id: referenceSchema.optional(),
    code: referenceSchema,
    label: localizedTextSchema.nullable().optional(),
    kind: z.enum(MODIFIER_KINDS),
    target: z.enum(MODIFIER_TARGETS),
    targetId: referenceSchema.nullable().optional(),
    amount: decimalSchema.nullable().optional(),
    percentage: decimalSchema.nullable().optional(),
  })
  .strict()
  .transform(withoutAbsent)

/**
 * Edición rápida de la tabla de precios de un borrador. Los campos ausentes **no se tocan**: el
 * caso de uso solo reescribe lo que llega, así que el panel puede mandar únicamente el precio que
 * el propietario acaba de cambiar.
 */
export const updateTariffPriceSchema = z
  .object({
    perSquareMetre: decimalSchema.nullable().optional(),
    fixedPrice: decimalSchema.nullable().optional(),
    bands: z.array(priceBandSchema).max(200).optional(),
    modifiers: z.array(priceModifierSchema).max(200).optional(),
  })
  .strict()
