/**
 * Traducción entre las filas de Prisma y las entidades del dominio.
 *
 * Los enums de Prisma usan nombres en mayúsculas y los del dominio en minúsculas; aquí está el
 * único sitio donde se cruzan. Ningún objeto de Prisma sale de esta capa.
 */

import type { $Enums, Prisma } from '@prisma/client'

import type { Accessory, AccessoryCategory } from '@/domain/catalog/accessory'
import { Accessory as AccessoryEntity } from '@/domain/catalog/accessory'
import { LocalizedText } from '@/domain/catalog/catalog-text'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import { Color } from '@/domain/catalog/color'
import { Finish } from '@/domain/catalog/finish'
import { SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'
import type { ManualQuoteReason, ManualQuoteStatus } from '@/domain/catalog/manual-quote-request'
import { ManualQuoteRequest } from '@/domain/catalog/manual-quote-request'
import { Dimensions, SizeRange } from '@/domain/catalog/measurement'
import { DoorSeries } from '@/domain/catalog/series'
import { TariffVersion } from '@/domain/catalog/tariff-version'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import type { PricingStrategy } from '@/domain/catalog/tariff-version'
import type { ManualQuoteContact } from '@/domain/catalog/manual-quote-request'
import type {
  ModifierKind,
  ModifierTarget,
  SizeBand as SizeBandEntity,
} from '@/domain/pricing/price-table'
import { PriceModifier, PriceTable, SizeBand } from '@/domain/pricing/price-table'
import type { PriceLine, PriceLineKind } from '@/domain/pricing/price-breakdown'
import { Quote } from '@/domain/quote/quote'
import { InvalidQuoteError, InvalidValueError } from '@/domain/shared/errors'
import { Money } from '@/domain/shared/money'

const CATALOG_STATUS: Record<$Enums.CatalogStatus, CatalogStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
}

const CATALOG_STATUS_TO_DB: Record<CatalogStatus, $Enums.CatalogStatus> = {
  draft: 'DRAFT',
  published: 'PUBLISHED',
  archived: 'ARCHIVED',
}

const PRICING_STRATEGY: Record<$Enums.PricingStrategy, PricingStrategy> = {
  PER_SQUARE_METRE: 'per_square_metre',
  SIZE_BANDS: 'size_bands',
  FIXED: 'fixed',
}

const PRICING_STRATEGY_TO_DB: Record<PricingStrategy, $Enums.PricingStrategy> = {
  per_square_metre: 'PER_SQUARE_METRE',
  size_bands: 'SIZE_BANDS',
  fixed: 'FIXED',
}

const MODIFIER_KIND: Record<$Enums.ModifierKind, ModifierKind> = {
  FIXED: 'fixed',
  PER_UNIT: 'per_unit',
  PERCENTAGE: 'percentage',
}

const MODIFIER_KIND_TO_DB: Record<ModifierKind, $Enums.ModifierKind> = {
  fixed: 'FIXED',
  per_unit: 'PER_UNIT',
  percentage: 'PERCENTAGE',
}

const MODIFIER_TARGET: Record<$Enums.ModifierTarget, ModifierTarget> = {
  FINISH: 'finish',
  COLOR: 'color',
  ACCESSORY: 'accessory',
  INSTALLATION: 'installation',
  SHIPPING: 'shipping',
  URGENCY: 'urgency',
  DISCOUNT: 'discount',
}

const MODIFIER_TARGET_TO_DB: Record<ModifierTarget, $Enums.ModifierTarget> = {
  finish: 'FINISH',
  color: 'COLOR',
  accessory: 'ACCESSORY',
  installation: 'INSTALLATION',
  shipping: 'SHIPPING',
  urgency: 'URGENCY',
  discount: 'DISCOUNT',
}

const QUOTE_LINE_KIND: Record<$Enums.QuoteLineKind, PriceLineKind> = {
  BASE: 'base',
  ADDITION: 'addition',
  DISCOUNT: 'discount',
}

const QUOTE_LINE_KIND_TO_DB: Record<PriceLineKind, $Enums.QuoteLineKind> = {
  base: 'BASE',
  addition: 'ADDITION',
  discount: 'DISCOUNT',
}

const MANUAL_QUOTE_REASON: Record<$Enums.ManualQuoteReason, ManualQuoteReason> = {
  SIZE_EXCEEDS_SERIES_MAX: 'size_exceeds_series_max',
  NO_TARIFF_IN_FORCE: 'no_tariff_in_force',
  UNCOVERED_CONFIGURATION: 'uncovered_configuration',
  CUSTOMER_REQUESTED: 'customer_requested',
}

const MANUAL_QUOTE_REASON_TO_DB: Record<ManualQuoteReason, $Enums.ManualQuoteReason> = {
  size_exceeds_series_max: 'SIZE_EXCEEDS_SERIES_MAX',
  no_tariff_in_force: 'NO_TARIFF_IN_FORCE',
  uncovered_configuration: 'UNCOVERED_CONFIGURATION',
  customer_requested: 'CUSTOMER_REQUESTED',
}

const MANUAL_QUOTE_STATUS: Record<$Enums.ManualQuoteStatus, ManualQuoteStatus> = {
  PENDING: 'pending',
  CONTACTED: 'contacted',
  CLOSED: 'closed',
}

const ACCESSORY_CATEGORY: Record<$Enums.AccessoryCategory, AccessoryCategory> = {
  HARDWARE: 'hardware',
  CLOSING: 'closing',
  GLASS: 'glass',
  VENTILATION: 'ventilation',
  OTHER: 'other',
}

export const catalogStatusToDomain = (status: $Enums.CatalogStatus): CatalogStatus =>
  CATALOG_STATUS[status]

export const catalogStatusToDb = (status: CatalogStatus): $Enums.CatalogStatus =>
  CATALOG_STATUS_TO_DB[status]

export const pricingStrategyToDb = (strategy: PricingStrategy): $Enums.PricingStrategy =>
  PRICING_STRATEGY_TO_DB[strategy]

/** Texto multi-idioma a partir de `{ es, en }`; `null` si no hay ningún idioma válido. */
export function localizedTextFromJson(value: Prisma.JsonValue | null): LocalizedText | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const byLocale = new Map<Locale, string>()

  for (const locale of SUPPORTED_LOCALES) {
    const candidate = (value as Record<string, unknown>)[locale]

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      byLocale.set(locale, candidate)
    }
  }

  const spanish = byLocale.get('es')
  const english = byLocale.get('en')

  if (spanish === undefined) {
    return null
  }

  return english === undefined
    ? LocalizedText.of({ es: spanish })
    : LocalizedText.of({ es: spanish, en: english })
}

export function localizedTextToJson(text: LocalizedText): Prisma.InputJsonValue {
  const json: Record<string, string> = {}

  for (const locale of SUPPORTED_LOCALES) {
    if (text.hasTranslation(locale)) {
      json[locale] = text.resolve(locale)
    }
  }

  return json
}

export interface CatalogTextRow {
  readonly entityId: string
  readonly field: $Enums.CatalogTextField
  readonly locale: string
  readonly value: string
}

/** Agrupa filas de `catalog_text` como `entityId → campo → filas`. */
export function groupCatalogTexts(
  rows: readonly CatalogTextRow[],
): Map<string, Map<$Enums.CatalogTextField, CatalogTextRow[]>> {
  const grouped = new Map<string, Map<$Enums.CatalogTextField, CatalogTextRow[]>>()

  for (const row of rows) {
    const byField =
      grouped.get(row.entityId) ?? new Map<$Enums.CatalogTextField, CatalogTextRow[]>()
    const list = byField.get(row.field) ?? []
    list.push(row)
    byField.set(row.field, list)
    grouped.set(row.entityId, byField)
  }

  return grouped
}

/**
 * Construye un texto traducible tolerando datos incompletos: si falta el idioma por defecto se usa
 * la primera traducción disponible y, si no hay ninguna, el `fallback` (normalmente el código).
 */
export function buildLocalizedText(
  rows: readonly CatalogTextRow[] | undefined,
  fallback: string,
): LocalizedText {
  const byLocale = new Map<string, string>()

  for (const row of rows ?? []) {
    if (
      (SUPPORTED_LOCALES as readonly string[]).includes(row.locale) &&
      row.value.trim().length > 0
    ) {
      byLocale.set(row.locale, row.value)
    }
  }

  const defaultText = byLocale.get('es') ?? [...byLocale.values()][0] ?? fallback
  const english = byLocale.get('en')

  return english === undefined
    ? LocalizedText.of({ es: defaultText })
    : LocalizedText.of({ es: defaultText, en: english })
}

export function buildOptionalLocalizedText(
  rows: readonly CatalogTextRow[] | undefined,
): LocalizedText | null {
  if (rows === undefined || rows.length === 0) {
    return null
  }

  const byLocale = new Map<string, string>()

  for (const row of rows) {
    if (
      (SUPPORTED_LOCALES as readonly string[]).includes(row.locale) &&
      row.value.trim().length > 0
    ) {
      byLocale.set(row.locale, row.value)
    }
  }

  if (byLocale.size === 0) {
    return null
  }

  const defaultText = byLocale.get('es') ?? [...byLocale.values()][0] ?? ''
  const english = byLocale.get('en')

  return english === undefined
    ? LocalizedText.of({ es: defaultText })
    : LocalizedText.of({ es: defaultText, en: english })
}

export function resolveLocale(value: string): Locale {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    throw new InvalidValueError(`Idioma guardado desconocido "${value}"`)
  }

  return value as Locale
}

export interface SeriesRow {
  readonly id: string
  readonly code: string
  readonly slug: string
  readonly status: $Enums.CatalogStatus
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
  readonly sortOrder: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly finishLinks: readonly { readonly finishId: string }[]
  readonly accessoryLinks: readonly { readonly accessoryId: string }[]
}

export function toDoorSeries(
  row: SeriesRow,
  texts: Map<string, Map<$Enums.CatalogTextField, CatalogTextRow[]>>,
): DoorSeries {
  const byField = texts.get(row.id)

  return DoorSeries.create({
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: buildLocalizedText(byField?.get('NAME'), row.code),
    description: buildOptionalLocalizedText(byField?.get('DESCRIPTION')),
    status: CATALOG_STATUS[row.status],
    sizeRange: SizeRange.of({
      minWidthMm: row.minWidthMm,
      maxWidthMm: row.maxWidthMm,
      minHeightMm: row.minHeightMm,
      maxHeightMm: row.maxHeightMm,
    }),
    allowedFinishIds: row.finishLinks.map((link) => link.finishId),
    allowedAccessoryIds: row.accessoryLinks.map((link) => link.accessoryId),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function toFinish(
  row: {
    readonly id: string
    readonly code: string
    readonly status: $Enums.CatalogStatus
    readonly sortOrder: number
    readonly createdAt: Date
    readonly updatedAt: Date
  },
  texts: Map<$Enums.CatalogTextField, CatalogTextRow[]> | undefined,
): Finish {
  return Finish.create({
    id: row.id,
    code: row.code,
    name: buildLocalizedText(texts?.get('NAME'), row.code),
    description: buildOptionalLocalizedText(texts?.get('DESCRIPTION')),
    status: CATALOG_STATUS[row.status],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function toColor(
  row: {
    readonly id: string
    readonly finishId: string
    readonly code: string
    readonly hex: string | null
    readonly status: $Enums.CatalogStatus
    readonly sortOrder: number
    readonly createdAt: Date
    readonly updatedAt: Date
  },
  texts: Map<$Enums.CatalogTextField, CatalogTextRow[]> | undefined,
): Color {
  return Color.create({
    id: row.id,
    finishId: row.finishId,
    code: row.code,
    name: buildLocalizedText(texts?.get('NAME'), row.code),
    hex: row.hex,
    status: CATALOG_STATUS[row.status],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function toAccessory(
  row: {
    readonly id: string
    readonly code: string
    readonly category: $Enums.AccessoryCategory
    readonly status: $Enums.CatalogStatus
    readonly sortOrder: number
    readonly createdAt: Date
    readonly updatedAt: Date
  },
  texts: Map<$Enums.CatalogTextField, CatalogTextRow[]> | undefined,
): Accessory {
  return AccessoryEntity.create({
    id: row.id,
    code: row.code,
    name: buildLocalizedText(texts?.get('NAME'), row.code),
    description: buildOptionalLocalizedText(texts?.get('DESCRIPTION')),
    category: ACCESSORY_CATEGORY[row.category],
    status: CATALOG_STATUS[row.status],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export interface TariffRow {
  readonly id: string
  readonly seriesId: string
  readonly versionNumber: number
  readonly status: $Enums.TariffStatus
  readonly strategy: $Enums.PricingStrategy
  readonly validFrom: Date
  readonly validUntil: Date | null
  readonly taxRatePercent: Prisma.Decimal
  readonly currency: string
  readonly notes: string | null
  readonly publishedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export function toTariffVersion(row: TariffRow): TariffVersion {
  return TariffVersion.create({
    id: row.id,
    seriesId: row.seriesId,
    versionNumber: row.versionNumber,
    status: CATALOG_STATUS[row.status],
    strategy: PRICING_STRATEGY[row.strategy],
    validity: ValidityPeriod.of(row.validFrom, row.validUntil),
    taxRatePercent: row.taxRatePercent.toFixed(2),
    currency: row.currency.trim(),
    notes: row.notes,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export interface PriceTableRow {
  readonly perSquareMetreCents: bigint | null
  readonly fixedPriceCents: bigint | null
  readonly bands: readonly {
    readonly id: string
    readonly label: Prisma.JsonValue | null
    readonly minWidthMm: number
    readonly maxWidthMm: number
    readonly minHeightMm: number
    readonly maxHeightMm: number
    readonly priceCents: bigint
  }[]
  readonly modifiers: readonly {
    readonly id: string
    readonly code: string
    readonly label: Prisma.JsonValue | null
    readonly kind: $Enums.ModifierKind
    readonly target: $Enums.ModifierTarget
    readonly discountCode: string | null
    readonly finishId: string | null
    readonly colorId: string | null
    readonly accessoryId: string | null
    readonly amountCents: bigint | null
    readonly percentage: Prisma.Decimal | null
  }[]
}

export function toPriceTable(
  tariffVersionId: string,
  strategy: PricingStrategy,
  row: PriceTableRow,
): PriceTable {
  const targetId = (modifier: PriceTableRow['modifiers'][number]): string | null => {
    if (modifier.finishId !== null) return modifier.finishId
    if (modifier.colorId !== null) return modifier.colorId
    if (modifier.accessoryId !== null) return modifier.accessoryId

    return null
  }

  return PriceTable.create({
    tariffVersionId,
    strategy,
    perSquareMetre:
      row.perSquareMetreCents === null ? null : Money.fromCents(row.perSquareMetreCents),
    fixedPrice: row.fixedPriceCents === null ? null : Money.fromCents(row.fixedPriceCents),
    bands: row.bands.map((band): SizeBandEntity =>
      SizeBand.create({
        id: band.id,
        label: localizedTextFromJson(band.label),
        minWidthMm: band.minWidthMm,
        maxWidthMm: band.maxWidthMm,
        minHeightMm: band.minHeightMm,
        maxHeightMm: band.maxHeightMm,
        price: Money.fromCents(band.priceCents),
      }),
    ),
    modifiers: row.modifiers.map((modifier) =>
      PriceModifier.create({
        id: modifier.id,
        code: modifier.code,
        label: localizedTextFromJson(modifier.label),
        kind: MODIFIER_KIND[modifier.kind],
        target: MODIFIER_TARGET[modifier.target],
        // El descuento guarda su referencia en `discount_code` (`null` = automático, CIF-74); el
        // resto de objetivos, la referencia del catálogo.
        targetId: modifier.target === 'DISCOUNT' ? modifier.discountCode : targetId(modifier),
        amount: modifier.amountCents === null ? null : Money.fromCents(modifier.amountCents),
        percentage: modifier.percentage === null ? null : modifier.percentage.toFixed(2),
      }),
    ),
  })
}

export const modifierKindToDb = (kind: ModifierKind): $Enums.ModifierKind =>
  MODIFIER_KIND_TO_DB[kind]
export const modifierTargetToDb = (target: ModifierTarget): $Enums.ModifierTarget =>
  MODIFIER_TARGET_TO_DB[target]

export interface QuoteRow {
  readonly id: string
  readonly reference: string
  readonly status: $Enums.QuoteStatus
  readonly seriesId: string
  readonly tariffVersionId: string
  readonly locale: string
  readonly widthMm: number
  readonly heightMm: number
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly string[]
  readonly discountCode: string | null
  readonly currency: string
  readonly subtotalCents: bigint
  readonly taxRatePercent: Prisma.Decimal
  readonly taxCents: bigint
  readonly totalCents: bigint
  readonly validUntil: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly lines: readonly {
    readonly code: string
    readonly kind: $Enums.QuoteLineKind
    readonly label: Prisma.JsonValue | null
    readonly units: number
    readonly unitAmountCents: bigint
    readonly amountCents: bigint
  }[]
}

export function toQuote(row: QuoteRow): Quote {
  const lines: PriceLine[] = row.lines.map((line) => {
    const kind = QUOTE_LINE_KIND[line.kind]

    return {
      code: line.code,
      kind,
      label: localizedTextFromJson(line.label),
      units: line.units,
      unitAmount: Money.fromCents(line.unitAmountCents),
      amount: Money.fromCents(line.amountCents),
    }
  })

  const baseLine = lines.find((line) => line.kind === 'base')

  if (baseLine === undefined) {
    throw new InvalidQuoteError(`El presupuesto "${row.reference}" no tiene línea base`)
  }

  const extras = row.extras.filter(
    (extra): extra is 'installation' | 'shipping' | 'urgency' =>
      extra === 'installation' || extra === 'shipping' || extra === 'urgency',
  )

  return Quote.create({
    id: row.id,
    reference: row.reference,
    status: QUOTE_STATUS[row.status],
    seriesId: row.seriesId,
    tariffVersionId: row.tariffVersionId,
    locale: resolveLocale(row.locale),
    configurationSnapshot: {
      seriesId: row.seriesId,
      widthMm: row.widthMm,
      heightMm: row.heightMm,
      finishId: row.finishId,
      colorId: row.colorId,
      accessoryIds: [...row.accessoryIds],
      extras,
      discountCode: row.discountCode,
    },
    breakdown: {
      currency: row.currency.trim(),
      lines,
      basePrice: baseLine.amount,
      subtotal: Money.fromCents(row.subtotalCents),
      taxRatePercent: row.taxRatePercent.toFixed(2),
      taxAmount: Money.fromCents(row.taxCents),
      total: Money.fromCents(row.totalCents),
    },
    validUntil: row.validUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

const QUOTE_STATUS: Record<$Enums.QuoteStatus, Quote['status']> = {
  ISSUED: 'issued',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
}

export const quoteLineKindToDb = (kind: PriceLineKind): $Enums.QuoteLineKind =>
  QUOTE_LINE_KIND_TO_DB[kind]

export const manualQuoteReasonToDb = (reason: ManualQuoteReason): $Enums.ManualQuoteReason =>
  MANUAL_QUOTE_REASON_TO_DB[reason]

export interface ManualQuoteRow {
  readonly id: string
  readonly reason: $Enums.ManualQuoteReason
  readonly status: $Enums.ManualQuoteStatus
  readonly seriesId: string | null
  readonly widthMm: number | null
  readonly heightMm: number | null
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly locale: string
  readonly customerName: string
  readonly customerEmail: string
  readonly customerPhone: string | null
  readonly message: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly handledAt: Date | null
}

export function toManualQuoteRequest(row: ManualQuoteRow): ManualQuoteRequest {
  const contact: ManualQuoteContact = {
    name: row.customerName,
    email: row.customerEmail,
    phone: row.customerPhone,
    message: row.message,
    locale: resolveLocale(row.locale),
  }

  return ManualQuoteRequest.create({
    id: row.id,
    reason: MANUAL_QUOTE_REASON[row.reason],
    status: MANUAL_QUOTE_STATUS[row.status],
    seriesId: row.seriesId,
    dimensions:
      row.widthMm === null || row.heightMm === null
        ? null
        : Dimensions.of(row.widthMm, row.heightMm),
    finishId: row.finishId,
    colorId: row.colorId,
    accessoryIds: [...row.accessoryIds],
    contact,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    handledAt: row.handledAt,
  })
}
