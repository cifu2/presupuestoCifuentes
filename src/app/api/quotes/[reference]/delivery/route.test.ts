/**
 * Test del borde HTTP de la entrega del presupuesto cuando su último intento está en vuelo
 * (CIF-195).
 *
 * Una petición concurrente que llegue mientras el intento 100 sigue enviándose no puede responder
 * `attempts_exhausted`: esa salida invita a emitir una versión nueva y duplicaría el correo en curso
 * (ADR-0004 §6). Debe informar de `in_progress` y no tocar la reserva.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  makeAccessory,
  makeColor,
  makeFinish,
  makeSeries,
} from '@/domain/catalog/testing/factories'
import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import { Quote } from '@/domain/quote/quote'
import {
  MAX_QUOTE_DELIVERY_ATTEMPTS,
  QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON,
  QuoteDelivery,
  quoteDeliveryKey,
} from '@/domain/quote/quote-delivery'
import { InMemoryQuoteDeliveryRepository } from '@/infrastructure/persistence/in-memory/quote-delivery-store'

const TOKEN = 'token-de-prueba-suficientemente-largo'
const NOW = new Date('2026-09-12T09:00:00.000Z')
const CUSTOMER = { name: 'Ana', email: 'ana@example.com' }

vi.mock('@/config/env', () => ({
  env: { ADMIN_API_TOKEN: 'token-de-prueba-suficientemente-largo' },
}))

const spies = vi.hoisted(() => ({ rendered: 0, sent: [] as string[] }))

const quote = Quote.issue({
  id: 'quote-1',
  reference: 'PC-2026-000001',
  configuration: makeConfiguration({ finishId: 'finish-lacado' }),
  tariffVersionId: 'tariff-ci-100-v1',
  locale: 'es',
  breakdown: makeBreakdown(),
  validUntil: new Date('2026-10-12T09:00:00.000Z'),
  createdAt: NOW,
})

const deliveries = new InMemoryQuoteDeliveryRepository()

vi.mock('@/composition/container', () => ({
  createContainer: () => ({
    mode: 'demo',
    clock: { now: () => NOW },
    idGenerator: { nextId: () => 'delivery-nueva' },
    quoteRepository: {
      save: async () => {},
      findById: async (id: string) => (id === quote.id ? quote : null),
      findByReference: async (reference: string) => (reference === quote.reference ? quote : null),
      listRecent: async () => [quote],
    },
    quoteDeliveryRepository: deliveries,
    seriesRepository: {
      findPublishedBySlug: async () => null,
      findById: async (id: string) => makeSeries({ id }),
      listPublished: async () => [],
    },
    finishRepository: {
      findById: async (id: string) => makeFinish({ id }),
      listPublished: async () => [],
      listPublishedByIds: async () => [],
    },
    colorRepository: {
      findById: async (id: string) => makeColor({ id }),
      listPublishedByFinishId: async () => [],
    },
    accessoryRepository: {
      findById: async (id: string) => makeAccessory({ id }),
      listPublished: async () => [],
      listPublishedByIds: async () => [],
    },
    quotePdfRenderer: {
      render: async () => {
        spies.rendered += 1

        return new Uint8Array([0x25, 0x50, 0x44, 0x46])
      },
    },
    emailSender: {
      send: async (message: { to: string }) => {
        spies.sent.push(message.to)

        return { providerMessageId: 'msg-1' }
      },
    },
    quoteDocumentSettings: {
      issuer: {
        name: 'Puertas Cifuentes S.L.',
        taxId: 'B12345678',
        address: 'Calle Mayor 1',
        email: 'presupuestos@example.com',
        phone: '+34 900 000 000',
        website: 'https://example.com',
        isPending: false,
      },
      conditions: { es: ['Validez 30 días'], en: ['Valid for 30 days'] },
      internalRecipients: [],
      pendingFields: [],
    },
  }),
}))

const { POST } = await import('./route')

function deliver(token: string | null = TOKEN): Promise<Response> {
  return Promise.resolve(
    new Request('http://localhost/api/quotes/PC-2026-000001/delivery', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ customer: CUSTOMER }),
    }),
  ).then((request) => POST(request, { params: Promise.resolve({ reference: quote.reference }) }))
}

/** Siembra el intento 100 de la entrega del cliente: en vuelo (`claimedAt`) o ya cerrado. */
async function seedAttempts(claimedAt: Date | null): Promise<void> {
  await deliveries.save(
    QuoteDelivery.create({
      id: 'delivery-1',
      quoteId: quote.id,
      quoteReference: quote.reference,
      version: 1,
      audience: 'customer',
      recipient: CUSTOMER.email,
      customerName: CUSTOMER.name,
      status: claimedAt === null ? 'failed' : 'pending',
      attempts: MAX_QUOTE_DELIVERY_ATTEMPTS,
      providerMessageId: null,
      lastError: claimedAt === null ? 'email: proveedor caído' : null,
      createdAt: NOW,
      updatedAt: NOW,
      sentAt: null,
      claimedAt,
    }),
  )
}

describe('POST /api/quotes/:reference/delivery con el intento 100 en vuelo (CIF-195)', () => {
  it('responde 200 in_progress y no toca la reserva, en vez de attempts_exhausted', async () => {
    spies.rendered = 0
    spies.sent.length = 0
    await seedAttempts(NOW)

    const response = await deliver()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('in_progress')
    expect(body.reason).toBe('none')
    expect(body.pdfBytes).toBe(0)
    expect(body.deliveries[0].status).toBe('pending')
    expect(body.deliveries[0].attempts).toBe(MAX_QUOTE_DELIVERY_ATTEMPTS)
    expect(spies.rendered).toBe(0)
    expect(spies.sent).toEqual([])

    const stored = await deliveries.findByKey(quoteDeliveryKey(quote.id, 1, CUSTOMER.email))

    expect(stored?.status).toBe('pending')
    expect(stored?.claimedAt).toEqual(NOW)
  })

  it('sigue respondiendo attempts_exhausted cuando la reserva ya caducó', async () => {
    spies.rendered = 0
    spies.sent.length = 0
    await seedAttempts(null)

    const response = await deliver()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('attempts_exhausted')
    expect(body.reason).toBe('attempts_exhausted')
    expect(body.deliveries[0].lastError).toBe(QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON)
    expect(spies.rendered).toBe(0)
    expect(spies.sent).toEqual([])
  })

  it('sigue exigiendo el token del panel', async () => {
    const response = await deliver(null)

    expect(response.status).toBe(401)
  })
})
