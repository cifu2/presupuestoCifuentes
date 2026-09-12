import { describe, expect, it } from 'vitest'

import {
  QuoteDelivery,
  quoteDeliveryKey,
  type QuoteDeliveryProps,
} from '@/domain/quote/quote-delivery'
import {
  InvalidQuoteDeliveryError,
  InvalidQuoteDeliveryTransitionError,
  InvalidValueError,
} from '@/domain/shared/errors'

const CREATED_AT = new Date('2026-09-12T09:00:00.000Z')
const SENT_AT = new Date('2026-09-12T09:05:00.000Z')

function makeDelivery(overrides: Partial<QuoteDeliveryProps> = {}): QuoteDelivery {
  return QuoteDelivery.create({
    id: overrides.id ?? 'delivery-1',
    quoteId: overrides.quoteId ?? 'quote-1',
    quoteReference: overrides.quoteReference ?? 'PC-2026-000001',
    version: overrides.version ?? 1,
    audience: overrides.audience ?? 'customer',
    recipient: overrides.recipient ?? 'cliente@example.com',
    customerName: overrides.customerName ?? 'Ana',
    status: overrides.status ?? 'pending',
    attempts: overrides.attempts ?? 0,
    providerMessageId: overrides.providerMessageId ?? null,
    lastError: overrides.lastError ?? null,
    createdAt: overrides.createdAt ?? CREATED_AT,
    updatedAt: overrides.updatedAt ?? CREATED_AT,
    sentAt: overrides.sentAt ?? null,
  })
}

describe('clave de idempotencia de una entrega', () => {
  it('junta presupuesto, versión y destinatario normalizado', () => {
    expect(quoteDeliveryKey('quote-1', 2, '  Cliente@Example.COM ')).toBe(
      'quote-1:2:cliente@example.com',
    )
  })

  it('distingue versiones del mismo destinatario', () => {
    expect(quoteDeliveryKey('quote-1', 1, 'cliente@example.com')).not.toBe(
      quoteDeliveryKey('quote-1', 2, 'cliente@example.com'),
    )
  })
})

describe('QuoteDelivery', () => {
  it('nace pendiente, sin intentos y sin fecha de envío', () => {
    const delivery = QuoteDelivery.pending({
      id: 'delivery-1',
      quoteId: 'quote-1',
      quoteReference: 'PC-2026-000001',
      version: 1,
      audience: 'customer',
      recipient: 'Cliente@Example.com',
      customerName: 'Ana',
      createdAt: CREATED_AT,
    })

    expect(delivery.status).toBe('pending')
    expect(delivery.attempts).toBe(0)
    expect(delivery.recipient).toBe('cliente@example.com')
    expect(delivery.idempotencyKey).toBe('quote-1:1:cliente@example.com')
  })

  it('rechaza un destinatario que no es un email', () => {
    expect(() => makeDelivery({ recipient: 'sin-arroba' })).toThrow(InvalidQuoteDeliveryError)
  })

  it('rechaza una versión fuera de rango', () => {
    expect(() => makeDelivery({ version: 0 })).toThrow(InvalidValueError)
  })

  it('rechaza una entrega enviada sin fecha de envío', () => {
    expect(() => makeDelivery({ status: 'sent', sentAt: null })).toThrow(InvalidQuoteDeliveryError)
  })

  it('rechaza una fecha de envío en una entrega no enviada', () => {
    expect(() => makeDelivery({ status: 'failed', sentAt: SENT_AT })).toThrow(
      InvalidQuoteDeliveryError,
    )
  })

  it('suma un intento al arrancar y limpia el error anterior', () => {
    const delivery = makeDelivery({ status: 'failed', attempts: 1, lastError: 'email: caído' })
    const started = delivery.startAttempt(SENT_AT)

    expect(started.status).toBe('pending')
    expect(started.attempts).toBe(2)
    expect(started.lastError).toBeNull()
    expect(started.updatedAt).toEqual(SENT_AT)
  })

  it('marca el envío con identificador del proveedor y fecha', () => {
    const sent = makeDelivery({ attempts: 1 }).markSent('resend-123', SENT_AT)

    expect(sent.status).toBe('sent')
    expect(sent.providerMessageId).toBe('resend-123')
    expect(sent.sentAt).toEqual(SENT_AT)
    expect(sent.isSent()).toBe(true)
  })

  it('guarda el motivo del fallo sin saltos de línea y recortado', () => {
    const failed = makeDelivery().markFailed(
      `proveedor:  \n  rechazado ${'x'.repeat(600)}`,
      SENT_AT,
    )

    expect(failed.status).toBe('failed')
    expect(failed.lastError?.startsWith('proveedor: rechazado')).toBe(true)
    expect(failed.lastError?.length).toBeLessThanOrEqual(500)
    expect(failed.lastError).not.toContain('\n')
  })

  it('no reenvía una entrega ya enviada', () => {
    const sent = makeDelivery({ status: 'sent', sentAt: SENT_AT })

    expect(() => sent.startAttempt(SENT_AT)).toThrow(InvalidQuoteDeliveryTransitionError)
    expect(() => sent.markSent('otro', SENT_AT)).toThrow(InvalidQuoteDeliveryTransitionError)
    expect(() => sent.markFailed('tarde', SENT_AT)).toThrow(InvalidQuoteDeliveryTransitionError)
  })
})
