/**
 * Documento de presupuesto: lo que el PDF y el email representan (ADR-0004 §2).
 *
 * Es un tipo del dominio, sin framework: el tipo lleva **datos** (referencia, fechas, líneas,
 * totales, condiciones, emisor y cliente) con los textos de negocio ya resueltos al idioma del
 * presupuesto. Los rótulos de la plantilla («Referencia», «Total»…) viven en los adaptadores y en
 * `messages/`, no aquí.
 *
 * El documento se construye a partir del presupuesto emitido, que ya tiene el precio congelado
 * (ADR-0003): el PDF de hoy y el de dentro de un año dicen lo mismo.
 */

import type { Locale } from '@/domain/catalog/locale'
import type { PriceLineKind } from '@/domain/pricing/price-breakdown'
import type { QuoteExtra } from '@/domain/pricing/quote-configuration'
import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertValidDate,
} from '@/domain/shared/assertions'
import { InvalidQuoteError } from '@/domain/shared/errors'
import type { Quote } from '@/domain/quote/quote'

import { assertQuoteReference } from './quote-reference'

/** Versión del documento de un presupuesto recién emitido; entra en la clave de idempotencia. */
export const DEFAULT_QUOTE_DOCUMENT_VERSION = 1

/** Datos fiscales del emisor. Pueden llevar el marcador de valor pendiente (CIF-14). */
export interface QuoteDocumentIssuer {
  readonly name: string
  readonly taxId: string
  readonly address: string
  readonly email: string
  readonly phone: string
  readonly website: string
  /** `true` si algún dato del emisor sigue siendo el marcador de pendiente. */
  readonly isPending: boolean
}

export interface QuoteDocumentCustomer {
  readonly name: string
  readonly email: string
}

export interface QuoteDocumentConfiguration {
  readonly seriesName: string
  readonly widthMm: number
  readonly heightMm: number
  readonly finishName: string | null
  readonly colorName: string | null
  readonly accessoryNames: readonly string[]
  readonly extras: readonly QuoteExtra[]
}

export interface QuoteDocumentLine {
  readonly code: string
  readonly label: string
  readonly kind: PriceLineKind
  readonly units: number
  readonly unitAmountCents: bigint
  readonly amountCents: bigint
}

export interface QuoteDocumentTotals {
  readonly currency: string
  readonly subtotalCents: bigint
  readonly taxRatePercent: string
  readonly taxCents: bigint
  readonly totalCents: bigint
}

export interface QuoteDocument {
  readonly reference: string
  /** Versión del documento: entra en la clave de idempotencia de la entrega (ADR-0004 §6). */
  readonly version: number
  readonly issuedOn: Date
  readonly validUntil: Date | null
  readonly locale: Locale
  readonly issuer: QuoteDocumentIssuer
  readonly customer: QuoteDocumentCustomer | null
  readonly configuration: QuoteDocumentConfiguration
  readonly lines: readonly QuoteDocumentLine[]
  readonly totals: QuoteDocumentTotals
  readonly conditions: readonly string[]
  /** Claves de configuración que siguen pendientes del propietario (CIF-14). */
  readonly pendingFields: readonly string[]
}

export interface BuildQuoteDocumentInput {
  readonly quote: Quote
  readonly version: number
  readonly issuer: QuoteDocumentIssuer
  readonly customer: QuoteDocumentCustomer | null
  readonly configuration: QuoteDocumentConfiguration
  readonly conditions: readonly string[]
  readonly pendingFields: readonly string[]
}

export function buildQuoteDocument(input: BuildQuoteDocumentInput): QuoteDocument {
  const { quote } = input

  assertQuoteReference(quote.reference)
  assertIntegerInRange(input.version, 'version', 1, 1_000)
  assertValidDate(quote.createdAt, 'issuedOn')

  if (quote.validUntil !== null) {
    assertValidDate(quote.validUntil, 'validUntil')
  }

  assertNonEmptyString(quote.breakdown.currency, 'currency')

  const lines: readonly QuoteDocumentLine[] = quote.breakdown.lines.map((line) => ({
    code: line.code,
    label: line.label === null ? line.code : line.label.resolve(quote.locale),
    kind: line.kind,
    units: line.units,
    unitAmountCents: line.unitAmount.cents,
    amountCents: line.amount.cents,
  }))

  if (lines.length === 0) {
    throw new InvalidQuoteError(`El presupuesto "${quote.reference}" no tiene líneas que imprimir`)
  }

  const totals: QuoteDocumentTotals = {
    currency: quote.breakdown.currency,
    subtotalCents: quote.breakdown.subtotal.cents,
    taxRatePercent: quote.breakdown.taxRatePercent,
    taxCents: quote.breakdown.taxAmount.cents,
    totalCents: quote.breakdown.total.cents,
  }

  assertTotalsConsistent(quote.reference, totals)

  if (input.conditions.length === 0 && input.pendingFields.length === 0) {
    throw new InvalidQuoteError(
      `El documento de "${quote.reference}" no puede quedarse sin condiciones y sin aviso de pendiente`,
    )
  }

  return {
    reference: quote.reference,
    version: input.version,
    issuedOn: quote.createdAt,
    validUntil: quote.validUntil,
    locale: quote.locale,
    issuer: input.issuer,
    customer: input.customer,
    configuration: input.configuration,
    lines,
    totals,
    conditions: [...input.conditions],
    pendingFields: [...input.pendingFields],
  }
}

/** `true` si al documento le falta algún valor que depende del propietario (CIF-14). */
export function hasPendingConfiguration(document: QuoteDocument): boolean {
  return document.pendingFields.length > 0 || document.issuer.isPending
}

/** Nombre de fichero del PDF, sin caracteres que compliquen la cabecera HTTP. */
export function quoteDocumentFileName(document: QuoteDocument): string {
  const name = document.locale === 'es' ? 'presupuesto' : 'quote'

  return `${name}-${document.reference}.pdf`
}

function assertTotalsConsistent(reference: string, totals: QuoteDocumentTotals): void {
  const expectedSubtotal = totals.subtotalCents
  const expectedTotal = expectedSubtotal + totals.taxCents

  if (totals.subtotalCents < 0n) {
    throw new InvalidQuoteError(`El subtotal de "${reference}" no puede ser negativo`)
  }

  if (totals.taxCents < 0n) {
    throw new InvalidQuoteError(`El IVA de "${reference}" no puede ser negativo`)
  }

  if (expectedTotal !== totals.totalCents) {
    throw new InvalidQuoteError(
      `El total de "${reference}" (${totals.totalCents}) no es subtotal + IVA (${expectedTotal})`,
    )
  }
}
