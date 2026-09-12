/**
 * Lógica pura del configurador público (CIF-7).
 *
 * Reúne lo que se puede probar sin navegador: el estado de la configuración, la evaluación de las
 * medidas con las **mismas invariantes del dominio**, la construcción de los cuerpos que consume la
 * API pública y el contrato del borrador recuperable.
 *
 * Condición de ADR-0020: el catálogo y los precios son datos. Aquí no hay ninguna serie, acabado,
 * color, accesorio ni precio escrito a mano; todo llega desde la API o desde las semillas del
 * catálogo. Lo único fijo es el modelo visual 2D (CIF-6/ADR-0016) y su nomenclatura.
 */

import { z } from 'zod'

import type { Locale } from '@/domain/catalog/locale'
import {
  Dimensions,
  MAX_DIMENSION_MM,
  MIN_DIMENSION_MM,
  SizeRange,
  type SizeAssessment,
} from '@/domain/catalog/measurement'
import { QUOTE_EXTRAS, type QuoteExtra } from '@/domain/pricing/quote-configuration'
import type { CatalogSeriesSummary } from '@/application/use-cases/get-published-series'
import type { CatalogColor, CatalogSeriesDetail } from '@/application/use-cases/get-series-detail'
import {
  TIPOS_2D_MVP,
  type FinishKind,
  type HingeSide,
  type MvpDoorType,
  type Planking,
} from '@/ui/preview-2d/model'

/** Medidas por defecto del configurador, acotadas después al rango de la serie elegida. */
export const DEFAULT_WIDTH_MM = 900
export const DEFAULT_HEIGHT_MM = 2030

export const HINGE_SIDES = ['izquierda', 'derecha'] as const satisfies readonly HingeSide[]

export const PLANKINGS = [
  'tablones-36',
  'tablones-54',
  'tablones-curvos-36',
  'tablones-curvos-54',
  'duelas-verticales',
  'duelas-horizontales',
] as const satisfies readonly Planking[]

/** Lo que el cliente ha elegido. Es la única entrada del precio, del dibujo y del borrador. */
export interface ConfiguratorSelection {
  readonly seriesSlug: string
  readonly doorType: MvpDoorType
  readonly widthMm: number
  readonly heightMm: number
  readonly hingeSide: HingeSide
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null
  /** Capas de tratamiento: solo afectan al dibujo, nunca al precio. */
  readonly planking: Planking | null
  readonly moulding: boolean
  readonly twoToneFrame: boolean
  readonly glazing: boolean
}

export interface ConfiguratorContact {
  readonly name: string
  readonly email: string
  readonly phone: string | null
  readonly message: string | null
}

/** Claves de `messages/<locale>.json` para los textos que dependen de un enumerado del modelo. */
export const TYPE_MESSAGE_KEYS: Record<MvpDoorType, string> = {
  'abatible-1-hoja': 'abatible1Hoja',
  'abatible-2-hojas': 'abatible2Hojas',
  'entrada-acorazada': 'entradaAcorazada',
  'pivotante-1-hoja': 'pivotante1Hoja',
  'pivotante-2-hojas': 'pivotante2Hoja',
}

export const HINGE_MESSAGE_KEYS: Record<HingeSide, string> = {
  izquierda: 'izquierda',
  derecha: 'derecha',
}

export const PLANKING_MESSAGE_KEYS: Record<Planking | 'ninguna', string> = {
  ninguna: 'ninguna',
  'tablones-36': 'tablones36',
  'tablones-54': 'tablones54',
  'tablones-curvos-36': 'tablonesCurvos36',
  'tablones-curvos-54': 'tablonesCurvos54',
  'duelas-verticales': 'duelasVerticales',
  'duelas-horizontales': 'duelasHorizontales',
}

/**
 * Traduce el `code` del acabado del catálogo al acabado visual del modelo 2D.
 *
 * El catálogo guarda códigos comerciales libres, así que la correspondencia es por palabra clave y
 * determinista; un código desconocido cae a `sin-acabado` (relleno neutro) en vez de romper el
 * dibujo. Cuando el catálogo tenga un campo visual explícito, este mapa se retira.
 */
const FINISH_VISUAL_RULES: readonly (readonly [RegExp, FinishKind])[] = [
  [/CORTEN/i, 'corten'],
  [/ANODIZ/i, 'anodizado'],
  [/ALUMINI|ALUMINIUM/i, 'aluminio'],
  [/ACERO|INOX|STEEL/i, 'acero'],
  [/DECORAD|LAMINAD|MELAMIN|HPL|FENOLIC/i, 'decorado-madera'],
  [/MADERA|CHAPA|ROBLE|NOGAL|WOOD|VENEER|OAK|WALNUT/i, 'chapa-natural'],
  [/LACAD|LACQUER|PINTAD|PAINT/i, 'lacado'],
]

export function isMvpDoorType(value: string): value is MvpDoorType {
  return TIPOS_2D_MVP.some((type) => type === value)
}

export function isPlanking(value: string): value is Planking {
  return PLANKINGS.some((planking) => planking === value)
}

export function finishKindForCode(code: string): FinishKind {
  for (const [pattern, kind] of FINISH_VISUAL_RULES) {
    if (pattern.test(code)) {
      return kind
    }
  }

  return 'sin-acabado'
}

function clampToRange(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function firstFinishId(detail: CatalogSeriesDetail | null): string | null {
  return detail?.finishes[0]?.id ?? null
}

export function colorsForFinish(
  detail: CatalogSeriesDetail | null,
  finishId: string | null,
): readonly CatalogColor[] {
  if (detail === null || finishId === null) {
    return []
  }

  return detail.finishes.find((finish) => finish.id === finishId)?.colors ?? []
}

export function firstColorId(
  detail: CatalogSeriesDetail | null,
  finishId: string | null,
): string | null {
  return colorsForFinish(detail, finishId)[0]?.id ?? null
}

export function findSeries(
  series: readonly CatalogSeriesSummary[],
  slug: string,
): CatalogSeriesSummary | null {
  return series.find((item) => item.slug === slug) ?? null
}

/** Configuración inicial de una serie: medidas por defecto acotadas y primer acabado del catálogo. */
export function defaultSelection(
  series: CatalogSeriesSummary,
  detail: CatalogSeriesDetail | null,
): ConfiguratorSelection {
  const finishId = firstFinishId(detail)

  return {
    seriesSlug: series.slug,
    doorType: 'abatible-1-hoja',
    widthMm: clampToRange(
      DEFAULT_WIDTH_MM,
      series.sizeRange.minWidthMm,
      series.sizeRange.maxWidthMm,
    ),
    heightMm: clampToRange(
      DEFAULT_HEIGHT_MM,
      series.sizeRange.minHeightMm,
      series.sizeRange.maxHeightMm,
    ),
    hingeSide: 'derecha',
    finishId,
    colorId: firstColorId(detail, finishId),
    accessoryIds: [],
    extras: [],
    discountCode: null,
    planking: null,
    moulding: false,
    twoToneFrame: false,
    glazing: false,
  }
}

/**
 * Ajusta una configuración (por ejemplo, un borrador recuperado) al catálogo publicado: descarta
 * acabados, colores y accesorios que ya no existen y deja las medidas en el rango del dominio.
 * Nunca acota al máximo de la serie: pasarse del máximo es un caso legítimo (presupuesto manual).
 */
export function reconcileSelection(
  candidate: ConfiguratorSelection,
  series: CatalogSeriesSummary,
  detail: CatalogSeriesDetail | null,
): ConfiguratorSelection {
  if (candidate.seriesSlug !== series.slug) {
    return defaultSelection(series, detail)
  }

  const finishId =
    detail === null
      ? candidate.finishId
      : detail.finishes.some((finish) => finish.id === candidate.finishId)
        ? candidate.finishId
        : firstFinishId(detail)

  const colorId =
    detail === null || candidate.colorId === null
      ? candidate.colorId
      : colorsForFinish(detail, finishId).some((color) => color.id === candidate.colorId)
        ? candidate.colorId
        : firstColorId(detail, finishId)

  const accessoryIds =
    detail === null
      ? unique(candidate.accessoryIds)
      : unique(candidate.accessoryIds).filter((id) =>
          detail.accessories.some((accessory) => accessory.id === id),
        )

  return {
    ...candidate,
    finishId,
    colorId,
    accessoryIds,
    extras: unique(candidate.extras).filter((extra) => QUOTE_EXTRAS.includes(extra)),
    widthMm: validMeasurement(candidate.widthMm)
      ? candidate.widthMm
      : clampToRange(DEFAULT_WIDTH_MM, series.sizeRange.minWidthMm, series.sizeRange.maxWidthMm),
    heightMm: validMeasurement(candidate.heightMm)
      ? candidate.heightMm
      : clampToRange(DEFAULT_HEIGHT_MM, series.sizeRange.minHeightMm, series.sizeRange.maxHeightMm),
    discountCode: candidate.discountCode === null ? null : candidate.discountCode.slice(0, 32),
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

export function validMeasurement(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_DIMENSION_MM && value <= MAX_DIMENSION_MM
}

export const MEASUREMENT_ERRORS = ['not_integer', 'below_minimum', 'above_maximum'] as const

export type MeasurementError = (typeof MEASUREMENT_ERRORS)[number]

export type MeasurementInput = { ok: true; value: number } | { ok: false; error: MeasurementError }

/**
 * Valida lo que teclea el cliente antes de llamar a la API. El servidor seguirá siendo la fuente
 * de verdad: esto solo evita peticiones imposibles y da un error inmediato y traducible.
 */
export function parseMeasurementInput(raw: string): MeasurementInput {
  const trimmed = raw.trim()

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'not_integer' }
  }

  const value = Number.parseInt(trimmed, 10)

  if (value < MIN_DIMENSION_MM) {
    return { ok: false, error: 'below_minimum' }
  }

  if (value > MAX_DIMENSION_MM) {
    return { ok: false, error: 'above_maximum' }
  }

  return { ok: true, value }
}

/** Evalúa la medida contra el máximo de la serie con las invariantes del dominio. */
export function assessSelectionSize(
  selection: Pick<ConfiguratorSelection, 'widthMm' | 'heightMm'>,
  sizeRange: CatalogSeriesSummary['sizeRange'],
): SizeAssessment | null {
  if (!validMeasurement(selection.widthMm) || !validMeasurement(selection.heightMm)) {
    return null
  }

  const range = SizeRange.of(sizeRange)

  return range.assess(Dimensions.of(selection.widthMm, selection.heightMm))
}

export function isWithinSeriesRange(
  selection: Pick<ConfiguratorSelection, 'widthMm' | 'heightMm'>,
  sizeRange: CatalogSeriesSummary['sizeRange'],
): boolean {
  return assessSelectionSize(selection, sizeRange)?.status === 'within_range'
}

/**
 * D1: por debajo del mínimo **no** hay presupuesto manual; es un error inline por campo. Separa qué
 * eje incumple para marcar `aria-invalid` y pintar el error bajo el campo que toca.
 */
export function belowMinimumAxes(assessment: SizeAssessment | null): {
  readonly width: boolean
  readonly height: boolean
} {
  if (assessment?.status !== 'out_of_range') {
    return { width: false, height: false }
  }

  return {
    width: assessment.violations.includes('width_below_minimum'),
    height: assessment.violations.includes('height_below_minimum'),
  }
}

/** Cuerpo exacto de `POST /api/quotes/price` y `POST /api/quotes` (docs/api.md). */
export interface ConfigurationRequestBody {
  readonly seriesSlug: string
  readonly widthMm: number
  readonly heightMm: number
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly extras: readonly QuoteExtra[]
  readonly discountCode: string | null
  readonly locale: Locale
}

export function buildConfigurationRequestBody(
  selection: ConfiguratorSelection,
  locale: Locale,
): ConfigurationRequestBody {
  const colorId = selection.finishId === null ? null : selection.colorId
  const discountCode = selection.discountCode === null ? null : selection.discountCode.trim()

  return {
    seriesSlug: selection.seriesSlug,
    widthMm: selection.widthMm,
    heightMm: selection.heightMm,
    finishId: selection.finishId,
    colorId,
    accessoryIds: unique(selection.accessoryIds),
    extras: unique(selection.extras).filter((extra) => QUOTE_EXTRAS.includes(extra)),
    discountCode: discountCode === '' ? null : discountCode,
    locale,
  }
}

export interface ManualQuoteRequestBody extends ConfigurationRequestBody {
  readonly customerRequested: boolean
  readonly contact: ConfiguratorContact
}

export function buildManualQuoteRequestBody(
  selection: ConfiguratorSelection,
  contact: ConfiguratorContact,
  locale: Locale,
): ManualQuoteRequestBody {
  return {
    ...buildConfigurationRequestBody(selection, locale),
    customerRequested: false,
    contact: {
      name: contact.name.trim(),
      email: contact.email.trim(),
      phone: contact.phone === null || contact.phone.trim() === '' ? null : contact.phone.trim(),
      message:
        contact.message === null || contact.message.trim() === '' ? null : contact.message.trim(),
    },
  }
}

export const CONTACT_ERRORS = ['required', 'too_short', 'too_long', 'invalid_email'] as const

export type ContactError = (typeof CONTACT_ERRORS)[number]

export type ContactErrors = Partial<Record<keyof ConfiguratorContact, ContactError>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Validación previa del formulario de contacto; el servidor revalida con Zod. */
export function validateContact(contact: ConfiguratorContact): ContactErrors {
  const errors: ContactErrors = {}
  const name = contact.name.trim()
  const email = contact.email.trim()

  if (name === '') {
    errors.name = 'required'
  } else if (name.length < 2) {
    errors.name = 'too_short'
  } else if (name.length > 120) {
    errors.name = 'too_long'
  }

  if (email === '') {
    errors.email = 'required'
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'invalid_email'
  }

  const phone = contact.phone?.trim() ?? ''

  if (phone !== '' && (phone.length < 6 || phone.length > 40)) {
    errors.phone = phone.length < 6 ? 'too_short' : 'too_long'
  }

  if (contact.message !== null && contact.message.length > 2000) {
    errors.message = 'too_long'
  }

  return errors
}

/** Borrador: solo la configuración, nunca datos personales (minimización, RGPD). */
export const DRAFT_VERSION = 1

export const DRAFT_STORAGE_PREFIX = 'cifuentes:configurador'

export function draftStorageKey(locale: Locale): string {
  return `${DRAFT_STORAGE_PREFIX}:${locale}:v${DRAFT_VERSION}`
}

const draftSchema = z.object({
  version: z.literal(DRAFT_VERSION),
  selection: z.object({
    seriesSlug: z.string().min(1).max(80),
    doorType: z.enum(TIPOS_2D_MVP),
    widthMm: z.number().int().min(MIN_DIMENSION_MM).max(MAX_DIMENSION_MM),
    heightMm: z.number().int().min(MIN_DIMENSION_MM).max(MAX_DIMENSION_MM),
    hingeSide: z.enum(HINGE_SIDES),
    finishId: z.string().min(1).max(80).nullable(),
    colorId: z.string().min(1).max(80).nullable(),
    accessoryIds: z.array(z.string().min(1).max(80)).max(50),
    extras: z.array(z.enum(QUOTE_EXTRAS)).max(QUOTE_EXTRAS.length),
    discountCode: z.string().min(1).max(32).nullable(),
    planking: z.enum(PLANKINGS).nullable(),
    moulding: z.boolean(),
    twoToneFrame: z.boolean(),
    glazing: z.boolean(),
  }),
})

export function serializeDraft(selection: ConfiguratorSelection): string {
  const draft: z.infer<typeof draftSchema> = {
    version: DRAFT_VERSION,
    selection: {
      ...selection,
      accessoryIds: [...selection.accessoryIds],
      extras: [...selection.extras],
    },
  }

  return JSON.stringify(draft)
}

/** Devuelve `null` ante cualquier borrador corrupto, de otra versión o de otro idioma. */
export function parseDraft(raw: string | null | undefined): ConfiguratorSelection | null {
  if (raw === null || raw === undefined || raw === '') {
    return null
  }

  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw))

    if (!parsed.success) {
      return null
    }

    return parsed.data.selection
  } catch {
    return null
  }
}

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function readDraft(storage: DraftStorage, locale: Locale): ConfiguratorSelection | null {
  try {
    return parseDraft(storage.getItem(draftStorageKey(locale)))
  } catch {
    return null
  }
}

export function saveDraft(
  storage: DraftStorage,
  locale: Locale,
  selection: ConfiguratorSelection,
): void {
  try {
    storage.setItem(draftStorageKey(locale), serializeDraft(selection))
  } catch {
    // El borrador es una comodidad, no un requisito: si el navegador no deja guardar, se ignora.
  }
}

export function clearDraft(storage: DraftStorage, locale: Locale): void {
  try {
    storage.removeItem(draftStorageKey(locale))
  } catch {
    // Igual que `saveDraft`: sin borrador se sigue configurando.
  }
}
