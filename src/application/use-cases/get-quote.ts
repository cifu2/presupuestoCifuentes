/**
 * Caso de uso: consultar un presupuesto emitido por su referencia pública.
 */

import type { Locale } from '@/domain/catalog/locale'
import { ResourceNotFoundError } from '@/domain/shared/errors'

import type { QuoteRepository } from '@/application/ports/quote-repository'
import { toQuoteOutput, type QuoteOutput } from './quote-output'

export interface GetQuoteDeps {
  readonly quoteRepository: QuoteRepository
}

export interface GetQuoteInput {
  readonly reference: string
  readonly locale: Locale
}

export async function getQuote(deps: GetQuoteDeps, input: GetQuoteInput): Promise<QuoteOutput> {
  const quote = await deps.quoteRepository.findByReference(input.reference)

  if (quote === null) {
    throw new ResourceNotFoundError(
      `No existe ningún presupuesto con referencia "${input.reference}"`,
    )
  }

  return toQuoteOutput(quote)
}
