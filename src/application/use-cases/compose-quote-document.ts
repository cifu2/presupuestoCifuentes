/**
 * Caso de uso: componer el documento de presupuesto (ADR-0004 §2).
 *
 * Junta lo que ya está congelado en el presupuesto (precio, configuración, idioma) con los datos
 * del catálogo que hacen legible el documento (nombres de serie, acabado, color y accesorios) y con
 * los ajustes del propietario (datos fiscales y condiciones, CIF-14).
 *
 * El catálogo puede haber cambiado desde la emisión: si un elemento ya no está, el documento cae al
 * identificador congelado en vez de romperse. El precio, en cambio, nunca se recalcula.
 */

import { buildQuoteDocument, type QuoteDocument } from '@/domain/quote/quote-document'
import type { QuoteDocumentCustomer } from '@/domain/quote/quote-document'
import type { Quote } from '@/domain/quote/quote'

import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'
import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'
import type { SeriesRepository } from '@/application/ports/series-repository'

export interface ComposeQuoteDocumentDeps {
  readonly seriesRepository: SeriesRepository
  readonly finishRepository: FinishRepository
  readonly colorRepository: ColorRepository
  readonly accessoryRepository: AccessoryRepository
}

export interface ComposeQuoteDocumentInput {
  readonly quote: Quote
  readonly version: number
  readonly customer: QuoteDocumentCustomer | null
  readonly settings: QuoteDocumentSettings
}

export async function composeQuoteDocument(
  deps: ComposeQuoteDocumentDeps,
  input: ComposeQuoteDocumentInput,
): Promise<QuoteDocument> {
  const { quote } = input
  const locale = quote.locale
  const snapshot = quote.configurationSnapshot

  const series = await deps.seriesRepository.findById(snapshot.seriesId)
  const finish =
    snapshot.finishId === null ? null : await deps.finishRepository.findById(snapshot.finishId)
  const color =
    snapshot.colorId === null ? null : await deps.colorRepository.findById(snapshot.colorId)

  const accessories = await Promise.all(
    snapshot.accessoryIds.map((accessoryId) => deps.accessoryRepository.findById(accessoryId)),
  )

  return buildQuoteDocument({
    quote,
    version: input.version,
    customer: input.customer,
    issuer: { ...input.settings.issuer },
    conditions: input.settings.conditions[locale],
    pendingFields: pendingFieldsForLocale(input.settings.pendingFields, locale),
    configuration: {
      seriesName: series?.name.resolve(locale) ?? snapshot.seriesId,
      widthMm: snapshot.widthMm,
      heightMm: snapshot.heightMm,
      finishName: finish?.name.resolve(locale) ?? snapshot.finishId,
      colorName: color?.name.resolve(locale) ?? snapshot.colorId,
      accessoryNames: accessories.map(
        (accessory, index) => accessory?.name.resolve(locale) ?? snapshot.accessoryIds[index] ?? '',
      ),
      extras: [...snapshot.extras],
    },
  })
}

/**
 * El aviso de pendiente solo menciona lo que afecta al idioma del documento: las condiciones que
 * faltan en el otro idioma no ensucian un presupuesto que se imprime en este.
 */
function pendingFieldsForLocale(fields: readonly string[], locale: string): readonly string[] {
  return fields.filter(
    (field) => !field.startsWith('conditions.') || field === `conditions.${locale}`,
  )
}
