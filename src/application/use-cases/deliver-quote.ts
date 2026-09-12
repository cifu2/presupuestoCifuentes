/**
 * Caso de uso: entregar el presupuesto en PDF y por email (ADR-0004 §5-6).
 *
 * El orden es a prueba de fallos:
 *
 * 1. el presupuesto ya está persistido (el precio se congela al emitirlo, ADR-0003);
 * 2. el estado de cada entrega se persiste **antes** de renderizar: «pendiente de envío»;
 * 3. se renderiza el PDF una sola vez;
 * 4. se envía el email a cada destinatario.
 *
 * Un fallo de PDF o de email no pierde el presupuesto: la entrega queda registrada con su motivo y
 * `retryQuoteDeliveries` la reintenta **sin duplicar correos**, porque cada entrega tiene su clave de
 * idempotencia (`quoteId + versión + destinatario`) y una entrega ya enviada nunca se reenvía.
 */

import { InvalidQuoteDeliveryError, ResourceNotFoundError } from '@/domain/shared/errors'
import {
  QuoteDelivery,
  quoteDeliveryKey,
  type QuoteDeliveryAudience,
  type QuoteDeliveryStatus,
} from '@/domain/quote/quote-delivery'
import {
  DEFAULT_QUOTE_DOCUMENT_VERSION,
  quoteDocumentFileName,
  type QuoteDocument,
  type QuoteDocumentCustomer,
} from '@/domain/quote/quote-document'
import type { Quote } from '@/domain/quote/quote'

import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'
import type { EmailSender, EmailAttachment } from '@/application/ports/email-sender'
import type { QuoteDeliveryRepository } from '@/application/ports/quote-delivery-repository'
import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'

import type { ComposeQuoteDocumentDeps } from './compose-quote-document'
import { quoteDeliveryEmail } from './quote-delivery-email'
import { renderQuotePdf } from './render-quote-pdf'

export interface DeliverQuoteDeps extends ComposeQuoteDocumentDeps {
  readonly quoteRepository: QuoteRepository
  readonly quoteDeliveryRepository: QuoteDeliveryRepository
  readonly quotePdfRenderer: QuotePdfRenderer
  readonly emailSender: EmailSender
  readonly idGenerator: IdGenerator
  readonly clock: Clock
  readonly settings: QuoteDocumentSettings
}

export type DeliverQuoteStatus =
  'delivered' | 'already_delivered' | 'incomplete' | 'nothing_to_retry'

export type DeliverQuoteReason = 'none' | 'pdf_render_failed' | 'email_send_failed'

export interface QuoteDeliveryOutput {
  readonly id: string
  readonly audience: QuoteDeliveryAudience
  readonly recipient: string
  readonly status: QuoteDeliveryStatus
  readonly attempts: number
  readonly providerMessageId: string | null
  readonly lastError: string | null
  readonly sentAt: string | null
  readonly updatedAt: string
}

export interface DeliverQuoteResult {
  readonly status: DeliverQuoteStatus
  readonly reason: DeliverQuoteReason
  readonly quoteReference: string
  readonly version: number
  /** Bytes del PDF renderizado; `0` si no llegó a generarse. */
  readonly pdfBytes: number
  readonly deliveries: readonly QuoteDeliveryOutput[]
}

export interface DeliverQuoteInput {
  readonly reference: string
  /** Por defecto, la versión 1 del documento. */
  readonly version?: number | undefined
  readonly customer: QuoteDocumentCustomer | null
}

export interface RetryQuoteDeliveriesInput {
  readonly reference: string
  readonly version?: number | undefined
}

interface DeliveryTarget {
  readonly audience: QuoteDeliveryAudience
  readonly recipient: string
  readonly customerName: string | null
}

export async function deliverQuote(
  deps: DeliverQuoteDeps,
  input: DeliverQuoteInput,
): Promise<DeliverQuoteResult> {
  const quote = await requireQuote(deps.quoteRepository, input.reference)
  const version = input.version ?? DEFAULT_QUOTE_DOCUMENT_VERSION
  const targets = deliveryTargets(input.customer, deps.settings.internalRecipients)

  if (targets.length === 0) {
    throw new InvalidQuoteDeliveryError(
      `No hay destinatarios para el presupuesto "${quote.reference}": ni cliente ni buzón interno configurado`,
    )
  }

  const prepared = await prepareDeliveries(deps, quote, version, targets)

  return runDeliveries(deps, quote, version, input.customer, prepared)
}

export async function retryQuoteDeliveries(
  deps: DeliverQuoteDeps,
  input: RetryQuoteDeliveriesInput,
): Promise<DeliverQuoteResult> {
  const quote = await requireQuote(deps.quoteRepository, input.reference)
  const stored = await deps.quoteDeliveryRepository.listByQuoteId(quote.id)
  const candidates = stored.filter(
    (delivery) =>
      !delivery.isSent() && (input.version === undefined || delivery.version === input.version),
  )

  if (candidates.length === 0) {
    return {
      status: 'nothing_to_retry',
      reason: 'none',
      quoteReference: quote.reference,
      version: input.version ?? stored[0]?.version ?? DEFAULT_QUOTE_DOCUMENT_VERSION,
      pdfBytes: 0,
      deliveries: stored.map(toOutput),
    }
  }

  const version = input.version ?? candidates[0]?.version ?? DEFAULT_QUOTE_DOCUMENT_VERSION
  const at = deps.clock.now()
  const prepared = await Promise.all(
    candidates.map((delivery) => save(deps, delivery.startAttempt(at))),
  )
  const customer = customerOf(candidates)

  return runDeliveries(deps, quote, version, customer, prepared)
}

async function requireQuote(repository: QuoteRepository, reference: string): Promise<Quote> {
  const quote = await repository.findByReference(reference)

  if (quote === null) {
    throw new ResourceNotFoundError(`No existe ningún presupuesto con referencia "${reference}"`)
  }

  return quote
}

function deliveryTargets(
  customer: QuoteDocumentCustomer | null,
  internalRecipients: readonly string[],
): readonly DeliveryTarget[] {
  const targets: DeliveryTarget[] = []
  const seen = new Set<string>()

  if (customer !== null) {
    targets.push({ audience: 'customer', recipient: customer.email, customerName: customer.name })
    seen.add(customer.email.trim().toLowerCase())
  }

  for (const recipient of internalRecipients) {
    const normalized = recipient.trim().toLowerCase()

    if (seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    targets.push({ audience: 'internal', recipient, customerName: null })
  }

  return targets
}

/**
 * Registra el estado «pendiente de envío» de cada destinatario **antes** de renderizar o enviar.
 * Reutiliza la entrega existente por su clave de idempotencia: reintentar no crea filas nuevas.
 */
async function prepareDeliveries(
  deps: DeliverQuoteDeps,
  quote: Quote,
  version: number,
  targets: readonly DeliveryTarget[],
): Promise<readonly QuoteDelivery[]> {
  const at = deps.clock.now()
  const prepared: QuoteDelivery[] = []

  for (const target of targets) {
    const existing = await deps.quoteDeliveryRepository.findByKey(
      quoteDeliveryKey(quote.id, version, target.recipient),
    )

    if (existing !== null && existing.isSent()) {
      prepared.push(existing)

      continue
    }

    const base =
      existing ??
      QuoteDelivery.pending({
        id: deps.idGenerator.nextId(),
        quoteId: quote.id,
        quoteReference: quote.reference,
        version,
        audience: target.audience,
        recipient: target.recipient,
        customerName: target.customerName,
        createdAt: at,
      })

    prepared.push(await save(deps, base.startAttempt(at)))
  }

  return prepared
}

async function runDeliveries(
  deps: DeliverQuoteDeps,
  quote: Quote,
  version: number,
  customer: QuoteDocumentCustomer | null,
  deliveries: readonly QuoteDelivery[],
): Promise<DeliverQuoteResult> {
  const toSend = deliveries.filter((delivery) => !delivery.isSent())

  if (toSend.length === 0) {
    return {
      status: 'already_delivered',
      reason: 'none',
      quoteReference: quote.reference,
      version,
      pdfBytes: 0,
      deliveries: deliveries.map(toOutput),
    }
  }

  const at = deps.clock.now()
  const rendered = await renderDocument(deps, { quote, version, customer })

  if (!rendered.ok) {
    const failed = await Promise.all(
      toSend.map((delivery) => save(deps, delivery.markFailed(`pdf: ${rendered.error}`, at))),
    )

    return {
      status: 'incomplete',
      reason: 'pdf_render_failed',
      quoteReference: quote.reference,
      version,
      pdfBytes: 0,
      deliveries: merge(deliveries, failed).map(toOutput),
    }
  }

  const { document, pdf } = rendered

  const attachment: EmailAttachment = {
    filename: quoteDocumentFileName(document),
    contentType: 'application/pdf',
    content: pdf,
  }

  let reason: DeliverQuoteReason = 'none'
  const sent: QuoteDelivery[] = []

  for (const delivery of toSend) {
    const message = quoteDeliveryEmail({
      document,
      audience: delivery.audience,
      recipient: delivery.recipient,
    })

    try {
      const result = await deps.emailSender.send({
        to: delivery.recipient,
        subject: message.subject,
        text: message.text,
        attachments: [attachment],
      })

      sent.push(await save(deps, delivery.markSent(result.providerMessageId, deps.clock.now())))
    } catch (error) {
      reason = 'email_send_failed'
      sent.push(
        await save(deps, delivery.markFailed(`email: ${errorMessage(error)}`, deps.clock.now())),
      )
    }
  }

  const deliveriesAfter = merge(deliveries, sent)
  const allSent = deliveriesAfter.every((item) => item.isSent())

  return {
    status: allSent ? 'delivered' : 'incomplete',
    reason: allSent ? 'none' : reason,
    quoteReference: quote.reference,
    version,
    pdfBytes: pdf.byteLength,
    deliveries: deliveriesAfter.map(toOutput),
  }
}

type RenderedDocument =
  | { readonly ok: true; readonly document: QuoteDocument; readonly pdf: Uint8Array }
  | { readonly ok: false; readonly error: string }

/**
 * Compone el documento y renderiza el PDF. Un fallo aquí no pierde nada: el presupuesto sigue
 * emitido y las entregas quedan registradas como fallidas para reintentarlas.
 */
async function renderDocument(
  deps: DeliverQuoteDeps,
  input: {
    readonly quote: Quote
    readonly version: number
    readonly customer: QuoteDocumentCustomer | null
  },
): Promise<RenderedDocument> {
  try {
    const { document, pdf } = await renderQuotePdf(deps, {
      reference: input.quote.reference,
      version: input.version,
      customer: input.customer,
    })

    return { ok: true, document, pdf }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

/** Sustituye en la lista original las entregas que se acaban de actualizar (mismo id). */
function merge(
  original: readonly QuoteDelivery[],
  updated: readonly QuoteDelivery[],
): readonly QuoteDelivery[] {
  const byId = new Map(updated.map((delivery) => [delivery.id, delivery]))

  return original.map((delivery) => byId.get(delivery.id) ?? delivery)
}

function customerOf(deliveries: readonly QuoteDelivery[]): QuoteDocumentCustomer | null {
  const fromCustomer = deliveries.find((delivery) => delivery.audience === 'customer')

  if (fromCustomer === undefined) {
    return null
  }

  return {
    name: fromCustomer.customerName ?? fromCustomer.recipient,
    email: fromCustomer.recipient,
  }
}

async function save(deps: DeliverQuoteDeps, delivery: QuoteDelivery): Promise<QuoteDelivery> {
  await deps.quoteDeliveryRepository.save(delivery)

  return delivery
}

function toOutput(delivery: QuoteDelivery): QuoteDeliveryOutput {
  return {
    id: delivery.id,
    audience: delivery.audience,
    recipient: delivery.recipient,
    status: delivery.status,
    attempts: delivery.attempts,
    providerMessageId: delivery.providerMessageId,
    lastError: delivery.lastError,
    sentAt: delivery.sentAt?.toISOString() ?? null,
    updatedAt: delivery.updatedAt.toISOString(),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
