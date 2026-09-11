/**
 * Referencia legible de un presupuesto: `PC-2026-000123`.
 *
 * Es el identificador que ve el cliente y el comercial; el `id` interno sigue siendo un UUID.
 * El año es el de emisión y el número es una secuencia sin huecos por año.
 */

import { InvalidQuoteReferenceError } from '@/domain/shared/errors'

export const QUOTE_REFERENCE_PATTERN = /^PC-(\d{4})-(\d{6})$/

export function formatQuoteReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new InvalidQuoteReferenceError(`Año de emisión inválido: ${year}`)
  }

  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new InvalidQuoteReferenceError(
      `Secuencia de presupuesto fuera de rango (1-999999): ${sequence}`,
    )
  }

  return `PC-${year}-${sequence.toString().padStart(6, '0')}`
}

export function assertQuoteReference(value: string): void {
  if (!QUOTE_REFERENCE_PATTERN.test(value.trim())) {
    throw new InvalidQuoteReferenceError(
      `La referencia "${value}" no tiene el formato PC-AAAA-NNNNNN`,
    )
  }
}

export function quoteReferenceYear(reference: string): number {
  const match = QUOTE_REFERENCE_PATTERN.exec(reference.trim())

  if (match === null || match[1] === undefined) {
    throw new InvalidQuoteReferenceError(
      `La referencia "${reference}" no tiene el formato PC-AAAA-NNNNNN`,
    )
  }

  return Number.parseInt(match[1], 10)
}
