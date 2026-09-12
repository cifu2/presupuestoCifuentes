/**
 * Entrega de un presupuesto (PDF/email) y su clave de idempotencia (ADR-0004 §5-6).
 *
 * Una entrega es el intento de hacer llegar el documento a un destinatario concreto. El estado se
 * persiste **antes** de renderizar o enviar, de modo que un fallo deje rastro y se pueda reintentar
 * sin duplicar correos: la identidad de la entrega es
 * `quoteId + versión + destinatario`, y reenviar el mismo documento al mismo destinatario es el
 * mismo registro, no uno nuevo.
 */

import {
  assertIntegerInRange,
  assertNonEmptyString,
  assertValidDate,
} from '@/domain/shared/assertions'
import {
  InvalidQuoteDeliveryError,
  InvalidQuoteDeliveryTransitionError,
} from '@/domain/shared/errors'

export const QUOTE_DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const

export type QuoteDeliveryStatus = (typeof QUOTE_DELIVERY_STATUSES)[number]

export const QUOTE_DELIVERY_AUDIENCES = ['customer', 'internal'] as const

/** `customer`: el cliente; `internal`: el buzón del comercial y sus copias. */
export type QuoteDeliveryAudience = (typeof QUOTE_DELIVERY_AUDIENCES)[number]

/** Tope de `lastError`: el motivo se guarda para diagnosticar, no para volcar un stack trace. */
const MAX_ERROR_LENGTH = 500

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeRecipient(recipient: string): string {
  return recipient.trim().toLowerCase()
}

/**
 * Clave de idempotencia de una entrega (ADR-0004 §6).
 *
 * El destinatario se normaliza (sin espacios y en minúsculas) para que `Cliente@X.com` y
 * `cliente@x.com ` sean la misma entrega y no se dupliquen correos por una diferencia de formato.
 */
export function quoteDeliveryKey(quoteId: string, version: number, recipient: string): string {
  return `${quoteId}:${version}:${normalizeRecipient(recipient)}`
}

export interface QuoteDeliveryProps {
  readonly id: string
  readonly quoteId: string
  readonly quoteReference: string
  readonly version: number
  readonly audience: QuoteDeliveryAudience
  readonly recipient: string
  /** Nombre del cliente para el saludo del email; `null` en el aviso interno. */
  readonly customerName: string | null
  readonly status: QuoteDeliveryStatus
  readonly attempts: number
  readonly providerMessageId: string | null
  readonly lastError: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly sentAt: Date | null
}

export class QuoteDelivery {
  readonly id: string
  readonly quoteId: string
  readonly quoteReference: string
  readonly version: number
  readonly audience: QuoteDeliveryAudience
  readonly recipient: string
  readonly customerName: string | null
  readonly status: QuoteDeliveryStatus
  readonly attempts: number
  readonly providerMessageId: string | null
  readonly lastError: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly sentAt: Date | null

  private constructor(props: QuoteDeliveryProps) {
    this.id = props.id
    this.quoteId = props.quoteId
    this.quoteReference = props.quoteReference
    this.version = props.version
    this.audience = props.audience
    this.recipient = props.recipient
    this.customerName = props.customerName
    this.status = props.status
    this.attempts = props.attempts
    this.providerMessageId = props.providerMessageId
    this.lastError = props.lastError
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
    this.sentAt = props.sentAt
  }

  static create(props: QuoteDeliveryProps): QuoteDelivery {
    assertNonEmptyString(props.id, 'id')
    assertNonEmptyString(props.quoteId, 'quoteId')
    assertNonEmptyString(props.quoteReference, 'quoteReference')
    assertIntegerInRange(props.version, 'version', 1, 1_000)
    assertIntegerInRange(props.attempts, 'attempts', 0, 100)
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    if (!QUOTE_DELIVERY_AUDIENCES.includes(props.audience)) {
      throw new InvalidQuoteDeliveryError(`audiencia de entrega desconocida: "${props.audience}"`)
    }

    if (!QUOTE_DELIVERY_STATUSES.includes(props.status)) {
      throw new InvalidQuoteDeliveryError(`estado de entrega desconocido: "${props.status}"`)
    }

    if (!EMAIL_PATTERN.test(normalizeRecipient(props.recipient))) {
      throw new InvalidQuoteDeliveryError(`destinatario de entrega inválido: "${props.recipient}"`)
    }

    if (props.sentAt !== null) {
      assertValidDate(props.sentAt, 'sentAt')
    }

    if (props.status === 'sent' && props.sentAt === null) {
      throw new InvalidQuoteDeliveryError('una entrega enviada necesita su fecha de envío')
    }

    if (props.status !== 'sent' && props.sentAt !== null) {
      throw new InvalidQuoteDeliveryError('solo una entrega enviada puede tener fecha de envío')
    }

    return new QuoteDelivery({ ...props, recipient: normalizeRecipient(props.recipient) })
  }

  /** Entrega registrada y todavía no intentada: el estado que sobrevive a un fallo. */
  static pending(props: {
    readonly id: string
    readonly quoteId: string
    readonly quoteReference: string
    readonly version: number
    readonly audience: QuoteDeliveryAudience
    readonly recipient: string
    readonly customerName: string | null
    readonly createdAt: Date
  }): QuoteDelivery {
    return QuoteDelivery.create({
      ...props,
      status: 'pending',
      attempts: 0,
      providerMessageId: null,
      lastError: null,
      updatedAt: props.createdAt,
      sentAt: null,
    })
  }

  get idempotencyKey(): string {
    return quoteDeliveryKey(this.quoteId, this.version, this.recipient)
  }

  isSent(): boolean {
    return this.status === 'sent'
  }

  isPending(): boolean {
    return this.status === 'pending'
  }

  /** Marca el inicio de un intento. Una entrega ya enviada no se reintenta: no se duplican correos. */
  startAttempt(at: Date): QuoteDelivery {
    assertValidDate(at, 'updatedAt')

    if (this.isSent()) {
      throw new InvalidQuoteDeliveryTransitionError(
        `La entrega de "${this.quoteReference}" a "${this.recipient}" ya se envió`,
      )
    }

    return new QuoteDelivery({
      ...this,
      status: 'pending',
      attempts: this.attempts + 1,
      lastError: null,
      updatedAt: at,
    })
  }

  markSent(providerMessageId: string, at: Date): QuoteDelivery {
    assertValidDate(at, 'sentAt')

    if (this.isSent()) {
      throw new InvalidQuoteDeliveryTransitionError(
        `La entrega de "${this.quoteReference}" a "${this.recipient}" ya se envió`,
      )
    }

    return new QuoteDelivery({
      ...this,
      status: 'sent',
      providerMessageId,
      lastError: null,
      sentAt: at,
      updatedAt: at,
    })
  }

  markFailed(reason: string, at: Date): QuoteDelivery {
    assertValidDate(at, 'updatedAt')

    if (this.isSent()) {
      throw new InvalidQuoteDeliveryTransitionError(
        `La entrega de "${this.quoteReference}" a "${this.recipient}" ya se envió`,
      )
    }

    return new QuoteDelivery({
      ...this,
      status: 'failed',
      lastError: truncate(reason),
      updatedAt: at,
    })
  }
}

function truncate(reason: string): string {
  const compact = reason.replace(/\s+/g, ' ').trim()

  return compact.length <= MAX_ERROR_LENGTH ? compact : `${compact.slice(0, MAX_ERROR_LENGTH - 1)}…`
}
