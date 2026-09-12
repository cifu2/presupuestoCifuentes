/**
 * Cuerpo del email de entrega del presupuesto (ADR-0004 §1 y §7).
 *
 * Se compone en el idioma guardado en el presupuesto y lleva lo imprescindible: a quién va, el
 * resumen del presupuesto y el PDF adjunto. El aviso interno no incluye el saludo al cliente.
 * No se añaden datos personales más allá del nombre y del destinatario del propio envío.
 */

import type { QuoteDocument } from '@/domain/quote/quote-document'
import type { QuoteDeliveryAudience } from '@/domain/quote/quote-delivery'
import {
  formatDate,
  formatMoney,
  pendingFieldLabels,
  quoteDocumentTexts,
} from '@/i18n/quote-document-texts'

export interface QuoteDeliveryEmail {
  readonly subject: string
  readonly text: string
}

export function quoteDeliveryEmail(input: {
  readonly document: QuoteDocument
  readonly audience: QuoteDeliveryAudience
  readonly recipient: string
}): QuoteDeliveryEmail {
  const { document } = input
  const texts = quoteDocumentTexts(document.locale)
  const money = (cents: bigint): string =>
    formatMoney(cents, document.totals.currency, document.locale)

  if (input.audience === 'internal') {
    return {
      subject: texts.internalSubject(document.reference),
      text: lines([
        texts.internalIntro(document.reference),
        '',
        summary(document, money, texts),
        '',
        texts.frozenPriceNotice,
      ]),
    }
  }

  const customerName = document.customer?.name ?? input.recipient

  return {
    subject: texts.emailSubject(document.reference),
    text: lines([
      texts.emailGreeting(customerName),
      '',
      texts.emailIntro,
      '',
      summary(document, money, texts),
      '',
      document.pendingFields.length > 0
        ? texts.pendingConfigurationNotice(
            pendingFieldLabels(document.locale, document.pendingFields),
          )
        : '',
      texts.emailClosing,
      texts.emailSignature,
    ]),
  }
}

function summary(
  document: QuoteDocument,
  money: (cents: bigint) => string,
  texts: ReturnType<typeof quoteDocumentTexts>,
): string {
  const rows = [
    `${texts.reference}: ${document.reference}`,
    `${texts.issuedOn}: ${formatDate(document.issuedOn, document.locale)}`,
    document.validUntil === null
      ? null
      : `${texts.validUntil}: ${formatDate(document.validUntil, document.locale)}`,
    `${texts.series}: ${document.configuration.seriesName}`,
    `${texts.measurements}: ${texts.measurement(document.configuration.widthMm, document.configuration.heightMm)}`,
    document.configuration.finishName === null
      ? null
      : `${texts.finish}: ${document.configuration.finishName}`,
    document.configuration.colorName === null
      ? null
      : `${texts.color}: ${document.configuration.colorName}`,
    `${texts.subtotal}: ${money(document.totals.subtotalCents)}`,
    `${texts.taxLine(document.totals.taxRatePercent)}: ${money(document.totals.taxCents)}`,
    `${texts.total}: ${money(document.totals.totalCents)}`,
  ]

  return lines(rows.filter((row): row is string => row !== null))
}

function lines(values: readonly string[]): string {
  return values.filter((value) => value.length > 0).join('\n')
}
