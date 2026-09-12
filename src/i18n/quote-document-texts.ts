/**
 * Textos del documento de presupuesto (PDF y email) resueltos por idioma.
 *
 * El PDF se renderiza en servidor, sin contexto de petición de `next-intl`, y el email se compone
 * antes de enviarlo: ambos leen de aquí los rótulos de la plantilla del presupuesto, con las mismas
 * claves traducidas que la interfaz (`messages/<locale>.json`). El idioma es el **guardado en el
 * presupuesto** (ADR-0005), no el de quien lo descarga.
 *
 * También vive aquí el formato de importes y fechas: los importes se formatean desde el `bigint` en
 * céntimos (nunca con coma flotante) y las fechas en UTC, para que el mismo presupuesto se imprima
 * igual en cualquier réplica.
 */

import en from '../../messages/en.json'
import es from '../../messages/es.json'
import type { Locale } from '@/domain/catalog/locale'
import type { QuoteExtra } from '@/domain/pricing/quote-configuration'

const MESSAGES: Readonly<Record<Locale, typeof es>> = { es, en }

/**
 * Idioma BCP 47 del documento: formatos de fecha e importe y metadatos del PDF (§6.4 y §6.5).
 * `@react-pdf` lo declara en el catálogo del PDF, así que un lector sabe en qué idioma leerlo.
 */
export const DOCUMENT_LANGUAGES: Readonly<Record<Locale, string>> = {
  es: 'es-ES',
  en: 'en-GB',
}

export interface QuoteDocumentTexts {
  readonly documentTitle: string
  readonly reference: string
  readonly issuedOn: string
  readonly validUntil: string
  readonly customer: string
  readonly configuration: string
  readonly series: string
  readonly measurements: string
  readonly finish: string
  readonly color: string
  readonly accessories: string
  readonly noAccessories: string
  readonly unitPrice: string
  readonly quantity: string
  readonly amount: string
  readonly concept: string
  readonly breakdown: string
  readonly extrasTitle: string
  readonly subtotal: string
  readonly total: string
  readonly issuer: string
  readonly conditions: string
  readonly frozenPriceNotice: string
  readonly pdfFooter: string
  readonly extras: Readonly<Record<QuoteExtra, string>>
  readonly pendingFields: Readonly<Record<string, string>>
  readonly emailSubject: (reference: string) => string
  readonly emailGreeting: (customerName: string) => string
  readonly emailIntro: string
  readonly emailClosing: string
  readonly emailSignature: string
  readonly internalSubject: (reference: string) => string
  readonly internalIntro: (reference: string) => string
  readonly taxLine: (rate: string) => string
  readonly measurement: (widthMm: number, heightMm: number) => string
  readonly pageNumber: (page: number, total: number) => string
  readonly pendingConfigurationNotice: (fields: string) => string
}

export function quoteDocumentTexts(locale: Locale): QuoteDocumentTexts {
  const quote = MESSAGES[locale].Quote

  return {
    documentTitle: quote.documentTitle,
    reference: quote.reference,
    issuedOn: quote.issuedOn,
    validUntil: quote.validUntil,
    customer: quote.customer,
    configuration: quote.configuration,
    series: quote.series,
    measurements: quote.measurements,
    finish: quote.finish,
    color: quote.color,
    accessories: quote.accessories,
    noAccessories: quote.noAccessories,
    unitPrice: quote.unitPrice,
    quantity: quote.quantity,
    amount: quote.amount,
    concept: quote.concept,
    breakdown: quote.breakdown,
    extrasTitle: quote.extrasTitle,
    subtotal: quote.subtotal,
    total: quote.total,
    issuer: quote.issuer,
    conditions: quote.conditions,
    frozenPriceNotice: quote.frozenPriceNotice,
    pdfFooter: quote.pdf.footer,
    extras: quote.extras,
    pendingFields: quote.pendingFields,
    emailSubject: (reference) => fill(quote.email.subject, { reference }),
    emailGreeting: (customerName) => fill(quote.email.greeting, { customerName }),
    emailIntro: quote.email.intro,
    emailClosing: quote.email.closing,
    emailSignature: quote.email.signature,
    internalSubject: (reference) => fill(quote.email.internalSubject, { reference }),
    internalIntro: (reference) => fill(quote.email.internalIntro, { reference }),
    taxLine: (rate) => fill(quote.taxRate, { rate }),
    measurement: (widthMm, heightMm) =>
      fill(quote.measurementFormat, { width: widthMm, height: heightMm }),
    pageNumber: (page, total) => fill(quote.pdf.pageNumber, { page, total }),
    pendingConfigurationNotice: (fields) => fill(quote.pendingConfigurationNotice, { fields }),
  }
}

/** Texto legible de los valores pendientes de confirmar (`issuer.taxId` → «el NIF»). */
export function pendingFieldLabels(locale: Locale, fields: readonly string[]): string {
  const labels = quoteDocumentTexts(locale).pendingFields

  return fields.map((field) => labels[field] ?? field).join(', ')
}

/** Importe formateado sin coma flotante: se parte del `bigint` en céntimos. */
export function formatMoney(cents: bigint, currency: string, locale: Locale): string {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const units = absolute / 100n
  const decimals = (absolute % 100n).toString().padStart(2, '0')
  const thousandsSeparator = locale === 'es' ? '.' : ','
  const decimalSeparator = locale === 'es' ? ',' : '.'
  const amount = `${groupThousands(units.toString(), thousandsSeparator)}${decimalSeparator}${decimals}`
  const sign = negative ? '-' : ''

  if (currency === 'EUR') {
    return locale === 'es' ? `${sign}${amount} €` : `${sign}€${amount}`
  }

  return `${sign}${amount} ${currency}`
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(DOCUMENT_LANGUAGES[locale], {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date)
}

function groupThousands(digits: string, separator: string): string {
  const characters = [...digits]
  let grouped = ''

  for (let index = 0; index < characters.length; index += 1) {
    const remaining = characters.length - index

    if (index > 0 && remaining % 3 === 0) {
      grouped += separator
    }

    grouped += characters[index] ?? ''
  }

  return grouped
}

function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  )
}
