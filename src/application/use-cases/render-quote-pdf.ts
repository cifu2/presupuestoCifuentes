/**
 * Caso de uso: obtener el PDF de un presupuesto ya emitido (ADR-0004 §1).
 *
 * Es la descarga inmediata del configurador: no envía nada ni cambia el estado del presupuesto.
 * Compone el documento y lo renderiza con el puerto `QuotePdfRenderer`.
 */

import { ResourceNotFoundError } from '@/domain/shared/errors'
import {
  DEFAULT_QUOTE_DOCUMENT_VERSION,
  type QuoteDocument,
  type QuoteDocumentCustomer,
} from '@/domain/quote/quote-document'

import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'
import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'
import type { QuoteRepository } from '@/application/ports/quote-repository'

import { composeQuoteDocument, type ComposeQuoteDocumentDeps } from './compose-quote-document'

export interface RenderQuotePdfDeps extends ComposeQuoteDocumentDeps {
  readonly quoteRepository: QuoteRepository
  readonly quotePdfRenderer: QuotePdfRenderer
  readonly settings: QuoteDocumentSettings
}

export interface RenderQuotePdfInput {
  readonly reference: string
  readonly version?: number | undefined
  /** Datos del cliente para la cabecera del PDF; `null` en la descarga anónima. */
  readonly customer?: QuoteDocumentCustomer | null
}

export interface RenderQuotePdfResult {
  readonly document: QuoteDocument
  readonly pdf: Uint8Array
}

export async function renderQuotePdf(
  deps: RenderQuotePdfDeps,
  input: RenderQuotePdfInput,
): Promise<RenderQuotePdfResult> {
  const quote = await deps.quoteRepository.findByReference(input.reference)

  if (quote === null) {
    throw new ResourceNotFoundError(
      `No existe ningún presupuesto con referencia "${input.reference}"`,
    )
  }

  const document = await composeQuoteDocument(deps, {
    quote,
    version: input.version ?? DEFAULT_QUOTE_DOCUMENT_VERSION,
    customer: input.customer ?? null,
    settings: deps.settings,
  })

  return { document, pdf: await deps.quotePdfRenderer.render(document) }
}
